import { parseGamePgn } from '@/lib/chess/pgnParser';
import type { GameQuery, NormalizedGameSummary } from '@/lib/api/contracts';
import type { GraphBuildOptions } from '@/lib/chess/graph/types';
import type { EngineCapability } from '@/lib/engine/capabilities';
import type { ClearAllResult, DeletionResult } from '@/lib/db/deleteLocalData';
import type { GameRecord } from '@/lib/db/schema';

import { collectPersonalBookMoveKeys } from '../stockfish-analysis/bookMoves';
import type { GameAnalysisResult } from '../stockfish-analysis/analyzeGame';
import type { AnalysisStrength } from './types';
import type { GraphBuildWorkerResult } from '../opening-tree/graphWorkerClient';
import type { IngestionProgress, IngestionResult } from '../ingestion/types';
import { initialWorkspaceState, reduceWorkspace } from './reducer';
import type { WorkspaceAction, WorkspacePreferences, WorkspaceState } from './types';

interface IngestionStartOptions {
  manualRefresh?: boolean;
  onProgress?: (progress: IngestionProgress) => void;
}

export interface WorkspaceServices {
  ingestion: {
    start(query: GameQuery, options: IngestionStartOptions): Promise<IngestionResult>;
    cancel(): void;
    dispose(): void;
  };
  graph: {
    build(
      games: readonly NormalizedGameSummary[],
      options: GraphBuildOptions,
      queryFingerprint: string
    ): Promise<GraphBuildWorkerResult>;
    cancel(): void;
    dispose(): void;
  };
  engine: {
    initialize(): Promise<EngineCapability>;
    retryInitialize(): Promise<EngineCapability>;
    dispose(): void;
  };
  data: {
    deleteUsername(username: string): Promise<DeletionResult>;
    clearAll(): Promise<ClearAllResult>;
    listUsernames?(): Promise<string[]>;
    dispose(): void;
  };
  analysis: {
    restoreSelected?(
      game: GameRecord,
      strength: AnalysisStrength
    ): Promise<GameAnalysisResult | null>;
    restore?(
      games: readonly GameRecord[],
      strength: AnalysisStrength
    ): Promise<Record<string, GameAnalysisResult>>;
    analyze(
      game: GameRecord,
      strength: AnalysisStrength,
      capability: EngineCapability,
      context: { bookMoveKeys: readonly string[] },
      signal: AbortSignal,
      onProgress: (progress: { analyzedPlies: number; totalPlies: number }) => void
    ): Promise<GameAnalysisResult>;
  };
}

export interface WorkspaceController {
  getState(): WorkspaceState;
  getNavigationVersion(): number;
  subscribe(listener: () => void): () => void;
  submitQuery(query: GameQuery, options?: { manualRefresh?: boolean }): Promise<void>;
  cancelIngestion(): void;
  dismissIngestionError(): void;
  probeEngine(): Promise<void>;
  retryEngine(): Promise<void>;
  openReview(gameId: string): Promise<void>;
  invalidateReviewIntent(): void;
  selectGame(gameId: string | null): void;
  navigateGraph(positionKey: string, pathId: number | null): void;
  selectPly(ply: number): void;
  startAnalysis(strength?: AnalysisStrength): Promise<void>;
  cancelAnalysis(): void;
  deleteUserData(username: string): Promise<DeletionResult>;
  clearAllData(): Promise<ClearAllResult>;
  listStoredUsernames(): Promise<string[]>;
  dispatch(action: WorkspaceAction): void;
  dispose(): void;
}

class DataMaintenanceActiveError extends Error {
  constructor() {
    super('Local data maintenance is already running.');
    this.name = 'DataMaintenanceActiveError';
  }
}

export function createWorkspaceController(
  services: WorkspaceServices,
  initialPreferences: Partial<WorkspacePreferences> = {}
): WorkspaceController {
  let state: WorkspaceState = {
    ...initialWorkspaceState,
    preferences: { ...initialWorkspaceState.preferences, ...initialPreferences },
  };
  // Query relevance token also invalidates work during deletion; it is not an engine job ID.
  // See the T03 transition/caller inventory in docs/implementation-progress.md.
  let nextToken = 0;
  let disposed = false;
  let engineSequence = 0;
  // Local run generation guards progress; per-game generations guard terminal projections.
  // Restore generations below protect reads; saved envelope ownership is extended in T18.
  let analysisSequence = 0;
  let analysisController: AbortController | null = null;
  let activeQuery: Promise<void> | null = null;
  let activeAnalysis: Promise<void> | null = null;
  const pendingAnalyses = new Set<Promise<void>>();
  let maintenance: Promise<unknown> | null = null;
  const listeners = new Set<() => void>();
  const gameAnalysisSequences = new Map<string, number>();
  const restoreGenerations = new Map<string, number>();
  const reviewResults = new Map<string, GameAnalysisResult>();
  let reviewIntentSequence = 0;
  let pendingReview: { key: string; promise: Promise<void> } | null = null;
  let runningReview: { key: string; promise: Promise<void> } | null = null;
  const contentKey = (game: GameRecord, strength: AnalysisStrength) =>
    JSON.stringify([game.username, game.id, game.pgn, strength]);
  const invalidateReviewIntent = () => {
    reviewIntentSequence++;
    if (pendingReview && state.analysis.status === 'probing')
      dispatch({ type: 'analysis/preparationCancelled' });
    pendingReview = null;
  };

  const dispatch = (action: WorkspaceAction): void => {
    if (disposed) return;
    if (
      action.type === 'preferences/changed' &&
      action.preferences.analysisStrength &&
      action.preferences.analysisStrength !== state.preferences.analysisStrength
    )
      invalidateReviewIntent();
    const next = reduceWorkspace(state, action);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };

  const trackedOperation = (
    assign: (promise: Promise<void> | null) => void
  ): { promise: Promise<void>; finish: () => void } => {
    let finish!: () => void;
    const promise = new Promise<void>((resolve) => {
      finish = resolve;
    });
    assign(promise);
    return { promise, finish };
  };

  async function cancelAndWait(): Promise<void> {
    invalidateReviewIntent();
    reviewResults.clear();
    const invalidationToken = ++nextToken;
    analysisSequence += 1;
    dispatch({ type: 'operations/invalidated', token: invalidationToken });
    services.ingestion.cancel();
    services.graph.cancel();
    analysisController?.abort();
    const active = [activeQuery, activeAnalysis, ...pendingAnalyses].filter(
      (promise): promise is Promise<void> => promise !== null
    );
    await Promise.allSettled(active);
  }

  function runDeletion<T>(
    kind: 'user' | 'all',
    operation: () => Promise<T>,
    terminal: (result: T) => WorkspaceAction
  ): Promise<T> {
    if (maintenance) return Promise.reject(new DataMaintenanceActiveError());
    const work = (async (): Promise<T> => {
      dispatch({ type: 'data/deletionStarted', kind });
      await cancelAndWait();
      const result = await operation();
      dispatch(terminal(result));
      return result;
    })();
    maintenance = work;
    return work
      .catch((error: unknown) => {
        const message = 'Local data could not be deleted.';
        dispatch({ type: 'data/deletionFailed', error: message });
        const safeError = new Error(message);
        safeError.cause = error;
        throw safeError;
      })
      .finally(() => {
        if (maintenance === work) maintenance = null;
      });
  }

  async function runAnalysis(
    game: GameRecord,
    strength: AnalysisStrength,
    capability: EngineCapability,
    token: number
  ): Promise<void> {
    const tracked = trackedOperation((promise) => {
      activeAnalysis = promise;
      if (promise) pendingAnalyses.add(promise);
    });
    try {
      const sequence = ++analysisSequence;
      gameAnalysisSequences.set(game.id, sequence);
      analysisController?.abort();
      analysisController = new AbortController();
      restoreGenerations.set(game.id, (restoreGenerations.get(game.id) ?? 0) + 1);
      dispatch({ type: 'analysis/started', token });
      const bookMoveKeys = collectPersonalBookMoveKeys(state.graph.snapshot);
      try {
        const result = await services.analysis.analyze(
          game,
          strength,
          capability,
          { bookMoveKeys },
          analysisController.signal,
          (progress) => {
            if (sequence === analysisSequence) {
              dispatch({ type: 'analysis/progress', token, progress });
            }
          }
        );
        if (
          !disposed &&
          token === state.query.token &&
          gameAnalysisSequences.get(game.id) === sequence
        ) {
          reviewResults.set(contentKey(game, strength), result);
          dispatch({ type: 'analysis/terminal', token, gameId: game.id, result });
        }
      } catch (error) {
        if (sequence === analysisSequence) {
          dispatch({
            type: 'analysis/failed',
            token,
            error: error instanceof Error ? error.message : 'Game analysis failed.',
          });
        }
      } finally {
        if (sequence === analysisSequence) analysisController = null;
      }
    } finally {
      tracked.finish();
      pendingAnalyses.delete(tracked.promise);
      if (activeAnalysis === tracked.promise) activeAnalysis = null;
    }
  }

  function selectGame(gameId: string | null): void {
    if (gameId === state.selection.gameId) return;
    invalidateReviewIntent();
    analysisSequence++;
    runningReview = null;
    analysisController?.abort();
    analysisController = null;
    dispatch({ type: 'selection/game', gameId });
  }

  function requestReview(
    source: GameRecord,
    strength: AnalysisStrength,
    restore: boolean
  ): Promise<void> {
    if (disposed || maintenance) return Promise.resolve();
    const game = { ...source };
    const token = state.query.token;
    const key = JSON.stringify([token, contentKey(game, strength)]);
    if (pendingReview?.key === key) return pendingReview.promise;
    if (runningReview?.key === key) return runningReview.promise;
    const intent = ++reviewIntentSequence;
    restoreGenerations.set(game.id, (restoreGenerations.get(game.id) ?? 0) + 1);
    const current = () =>
      !disposed &&
      !maintenance &&
      token === state.query.token &&
      intent === reviewIntentSequence &&
      state.selection.gameId === game.id &&
      state.ingestion.result?.games.some(
        (candidate) =>
          candidate.id === game.id &&
          candidate.username === game.username &&
          candidate.pgn === game.pgn
      );
    const work = async () => {
      if (restore) {
        // Block automatic probing until this selected review's storage read has settled.
        dispatch({ type: 'analysis/probing' });
        let saved = reviewResults.get(contentKey(game, strength)) ?? null;
        if (!saved && services.analysis.restoreSelected) {
          try {
            saved = await services.analysis.restoreSelected(game, strength);
          } catch {
            /* Optional storage failure must not prevent a fresh review. */
          }
        }
        if (!current()) return;
        if (saved) {
          reviewResults.set(contentKey(game, strength), saved);
          dispatch({ type: 'analysis/terminal', token, gameId: game.id, result: saved });
          if (saved.status !== 'failed') return;
        }
      }
      if (!state.analysis.capability) await initializeEngine();
      if (!current()) return;
      const capability = state.analysis.capability;
      if (!capability || capability.mode === 'unavailable') {
        if (capability) dispatch({ type: 'analysis/capability', capability });
        return;
      }
      const running = runAnalysis(game, strength, capability, token);
      runningReview = { key, promise: running };
      try {
        await running;
      } finally {
        if (runningReview?.promise === running) runningReview = null;
      }
    };
    const promise = work().finally(() => {
      if (pendingReview?.promise === promise) pendingReview = null;
    });
    pendingReview = { key, promise };
    return promise;
  }

  async function initializeEngine(retry = false): Promise<void> {
    if (disposed || maintenance) return;
    const sequence = ++engineSequence;
    dispatch({ type: 'analysis/probing' });
    try {
      const capability = await (retry
        ? services.engine.retryInitialize()
        : services.engine.initialize());
      if (sequence === engineSequence) dispatch({ type: 'analysis/capability', capability });
    } catch (error) {
      if (sequence === engineSequence)
        dispatch({ type: 'analysis/capability', capability: unavailableCapability(error) });
    }
  }

  return {
    getState: () => state,
    getNavigationVersion: () => reviewIntentSequence,
    subscribe(listener) {
      disposed = false;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async submitQuery(query, options = {}) {
      if (maintenance) return;
      const tracked = trackedOperation((promise) => {
        activeQuery = promise;
      });
      try {
        disposed = false;
        invalidateReviewIntent();
        reviewResults.clear();
        restoreGenerations.clear();
        const token = ++nextToken;
        services.ingestion.cancel();
        services.graph.cancel();
        analysisController?.abort();
        dispatch({ type: 'query/started', query, token });
        try {
          const result = await services.ingestion.start(query, {
            ...(options.manualRefresh !== undefined
              ? { manualRefresh: options.manualRefresh }
              : {}),
            onProgress: (progress) => dispatch({ type: 'ingestion/progress', token, progress }),
          });
          if (disposed || token !== state.query.token) return;
          dispatch({ type: 'ingestion/terminal', token, result });
          if (services.analysis.restore && result.games.length > 0) {
            try {
              const strength = state.preferences.analysisStrength;
              const generations = new Map(
                result.games.map((game) => [game.id, restoreGenerations.get(game.id) ?? 0])
              );
              const restored = await services.analysis.restore(result.games, strength);
              if (disposed || token !== state.query.token) return;
              for (const [gameId, saved] of Object.entries(restored)) {
                if (
                  (restoreGenerations.get(gameId) ?? 0) !== generations.get(gameId) ||
                  strength !== state.preferences.analysisStrength
                )
                  continue;
                const game = result.games.find((game) => game.id === gameId);
                if (!game) continue;
                reviewResults.set(contentKey(game, strength), saved);
                dispatch({ type: 'analysis/terminal', token, gameId, result: saved });
              }
            } catch {
              /* Saved reviews are optional when storage is unavailable. */
            }
          }
          if (disposed || token !== state.query.token || result.games.length === 0) return;
          dispatch({ type: 'graph/started', token });
          const graph = await services.graph.build(
            result.games.map(toNormalizedSummary),
            {
              maxOpeningPlies: state.preferences.openingHorizon,
              includeRepeatedPositions: false,
            },
            result.fingerprint
          );
          dispatch({
            type: 'graph/terminal',
            token,
            status: graph.status,
            snapshot: graph.snapshot,
            diagnosticCodes: graph.status === 'complete' ? [] : graph.diagnosticCodes,
          });
        } catch (error) {
          console.error('[workspace operation failed]', error);
          if (disposed || token !== state.query.token) return;
          const message = error instanceof Error ? error.message : 'Workspace operation failed.';
          if (state.ingestion.status === 'loading') {
            dispatch({ type: 'ingestion/failed', token, error: message });
          } else if (message !== 'GRAPH_BUILD_CANCELLED') {
            dispatch({ type: 'graph/failed', token, error: message });
          }
        }
      } finally {
        tracked.finish();
        if (activeQuery === tracked.promise) activeQuery = null;
      }
    },
    cancelIngestion() {
      services.ingestion.cancel();
    },
    dismissIngestionError() {
      dispatch({ type: 'ingestion/errorDismissed' });
    },
    probeEngine: () => initializeEngine(),
    retryEngine: () => initializeEngine(true),
    selectGame,
    invalidateReviewIntent,
    openReview(gameId) {
      const game = state.ingestion.result?.games.find((game) => game.id === gameId);
      if (!game || disposed || maintenance) return Promise.resolve();
      const parsed = parseGamePgn({ game: toNormalizedSummary(game) });
      if (!parsed.ok || parsed.game.plies.length === 0) return Promise.resolve();
      selectGame(gameId);
      return requestReview(game, state.preferences.analysisStrength, true);
    },
    navigateGraph(positionKey, pathId) {
      dispatch({ type: 'selection/position', positionKey, pathId });
    },
    selectPly(ply) {
      dispatch({ type: 'selection/ply', ply });
    },
    startAnalysis(strength = state.preferences.analysisStrength) {
      const game = state.ingestion.result?.games.find((game) => game.id === state.selection.gameId);
      return game ? requestReview(game, strength, false) : Promise.resolve();
    },
    cancelAnalysis() {
      invalidateReviewIntent();
      runningReview = null;
      analysisController?.abort();
      analysisController = null;
      dispatch({ type: 'analysis/cancelled', token: state.query.token });
    },
    deleteUserData(username) {
      const normalized = username.toLowerCase();
      return runDeletion(
        'user',
        () => services.data.deleteUsername(normalized),
        () => ({ type: 'data/userDeleted', username: normalized })
      );
    },
    clearAllData() {
      return runDeletion(
        'all',
        () => services.data.clearAll(),
        () => ({ type: 'data/allCleared' })
      );
    },
    listStoredUsernames() {
      return services.data.listUsernames ? services.data.listUsernames() : Promise.resolve([]);
    },
    dispatch,
    dispose() {
      if (disposed) return;
      invalidateReviewIntent();
      reviewResults.clear();
      services.ingestion.cancel();
      services.ingestion.dispose();
      analysisController?.abort();
      services.graph.cancel();
      services.graph.dispose();
      engineSequence++;
      services.engine.dispose();
      services.data.dispose();
      listeners.clear();
      disposed = true;
    },
  };
}

function toNormalizedSummary(game: IngestionResult['games'][number]): NormalizedGameSummary {
  return {
    id: game.id,
    url: game.url,
    ...(game.uuid ? { uuid: game.uuid } : {}),
    usernameKey: game.username,
    userColor: game.userColor,
    result: game.result,
    endedAt: game.endedAt,
    timeClass: game.timeClass,
    ...(game.timeControl ? { timeControl: game.timeControl } : {}),
    rated: game.rated,
    userRating: game.userRating,
    opponentRating: game.opponentRating,
    whitePlayer: game.whitePlayer,
    blackPlayer: game.blackPlayer,
    pgn: game.pgn,
    rules: game.rules,
  };
}

function unavailableCapability(error: unknown): EngineCapability {
  return {
    mode: 'unavailable',
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    simd: false,
    engineInitialized: false,
    reason: error instanceof Error ? error.message : 'Stockfish is unavailable.',
    threads: 0,
    hashMb: 0,
  };
}
