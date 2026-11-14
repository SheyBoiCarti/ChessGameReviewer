import { parseGamePgn } from '@/lib/chess/pgnParser';
import type { GameQuery, NormalizedGameSummary } from '@/lib/api/contracts';
import type { GraphBuildOptions } from '@/lib/chess/graph/types';
import type { EngineCapability } from '@/lib/engine/capabilities';
import type { ClearAllResult, DeletionResult } from '@/lib/db/deleteLocalData';
import type { GameRecord } from '@/lib/db/schema';

import type { AnalysisUpdate, GameAnalysisResult } from '../stockfish-analysis/analyzeGame';
import { computePgnDigest, reviewResultKey } from '../stockfish-analysis/reviewIdentity';
import type { AnalysisStrength, GameReviewCursor } from './types';
import { clearWorkspaceSession } from './session';
import type { GraphBuildWorkerResult } from '../opening-tree/graphWorkerClient';
import type { IngestionProgress, IngestionResult } from '../ingestion/types';
import { initialWorkspaceState, reduceWorkspace } from './reducer';
import type { OpeningScope, WorkspaceAction, WorkspacePreferences, WorkspaceState } from './types';
import {
  computeDatasetRevision,
  createGraphCacheIdentity,
  type GraphCacheIdentity,
} from '../opening-tree/graphIdentity';
import { collectPersonalRepertoireMoveKeys } from '../stockfish-analysis/bookMoves';

/** T27: at most 500 retained last-reviewed cursors per user, least-recently-used eviction. */
const MAX_CURSORS_PER_USER = 500;

interface IngestionStartOptions {
  manualRefresh?: boolean;
  cacheOnly?: boolean;
  onProgress?: (progress: IngestionProgress) => void;
}

export interface WorkspaceServices {
  ingestion: {
    start(query: GameQuery, options: IngestionStartOptions): Promise<IngestionResult>;
    cancel(): void;
    dispose(): void;
  };
  graph: {
    load?(
      identity: GraphCacheIdentity,
      games: readonly NormalizedGameSummary[]
    ): Promise<GraphBuildWorkerResult>;
    build(
      games: readonly NormalizedGameSummary[],
      options: GraphBuildOptions,
      queryFingerprint: string
    ): Promise<GraphBuildWorkerResult>;
    cancel(): void;
    dispose(): void;
    clearMemory?(): void;
    deleteUser?(username: string): Promise<void>;
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
      context: { bookMoveKeys: readonly string[]; isCurrent?: () => boolean },
      signal: AbortSignal,
      onProgress: (progress: { analyzedPlies: number; totalPlies: number }) => void,
      onUpdate?: (update: AnalysisUpdate) => void
    ): Promise<GameAnalysisResult>;
  };
}

export interface WorkspaceController {
  getState(): WorkspaceState;
  getNavigationVersion(): number;
  subscribe(listener: () => void): () => void;
  submitQuery(
    query: GameQuery,
    options?: { manualRefresh?: boolean; cacheOnly?: boolean }
  ): Promise<void>;
  cancelIngestion(): void;
  dismissIngestionError(): void;
  probeEngine(): Promise<void>;
  retryEngine(): Promise<void>;
  openReview(gameId: string): Promise<void>;
  invalidateReviewIntent(): void;
  selectGame(gameId: string | null): void;
  /** Explicit Start over: selects position zero and forgets the retained cursor (T27). */
  startOver(gameId: string): void;
  navigateGraph(positionKey: string, pathId: number | null): void;
  /** T40: independent opening graph request sequence; never calls submitQuery. */
  requestOpeningGraph(scope: OpeningScope): Promise<void>;
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
  // T40: opening graph requests carry their own sequence, independent of query tokens.
  let graphSequence = 0;
  const datasetRevisions = new WeakMap<IngestionResult, string>();
  const revisionFor = (dataset: IngestionResult): string => {
    return datasetRevisions.get(dataset) ?? '';
  };
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
  const reviewResults = new Map<
    string,
    { lastComplete: GameAnalysisResult | null; latestAttempt: GameAnalysisResult }
  >();
  let reviewIntentSequence = 0;
  let pendingReview: { key: string; promise: Promise<void> } | null = null;
  let runningReview: { key: string; promise: Promise<void> } | null = null;
  const contentKey = (game: GameRecord, strength: AnalysisStrength) =>
    JSON.stringify([game.username, game.id, game.pgn, strength]);
  // T27: retained last-reviewed original plies. The synchronous index is keyed by
  // normalized username + game id; durable entries are keyed by the PGN digest so a
  // changed digest resets the retained ply to zero. Variation origins stay separate.
  const cursorIndexByGame = new Map<string, GameReviewCursor>();
  const cursorEntriesByContent = new Map<string, number>();
  const cursorCounts = new Map<string, number>();
  const gameCursorKey = (username: string, gameId: string) =>
    JSON.stringify([username.toLowerCase(), gameId]);
  const cursorContentKey = (username: string, gameId: string, digest: string) =>
    JSON.stringify([username.toLowerCase(), gameId, digest]);
  const forgetCursorEntry = (username: string, gameId: string, entry: GameReviewCursor) => {
    if (entry.digest)
      cursorEntriesByContent.delete(cursorContentKey(username, gameId, entry.digest));
    const normalized = username.toLowerCase();
    cursorCounts.set(normalized, Math.max(0, (cursorCounts.get(normalized) ?? 0) - 1));
  };
  const clearCursorsForUser = (username: string): void => {
    const normalized = username.toLowerCase();
    for (const [key, entry] of cursorIndexByGame) {
      const parsed = JSON.parse(key) as [string, string];
      if (parsed[0] === normalized) {
        forgetCursorEntry(normalized, parsed[1], entry);
        cursorIndexByGame.delete(key);
      }
    }
    cursorCounts.delete(normalized);
  };
  const clearAllCursors = (): void => {
    for (const [key, entry] of cursorIndexByGame) {
      const parsed = JSON.parse(key) as [string, string];
      forgetCursorEntry(parsed[0], parsed[1], entry);
      cursorIndexByGame.delete(key);
    }
    cursorEntriesByContent.clear();
    cursorCounts.clear();
  };
  const recordLastReviewedPly = (game: GameRecord, ply: number): void => {
    const normalized = game.username.toLowerCase();
    const gameKey = gameCursorKey(normalized, game.id);
    const existing = cursorIndexByGame.get(gameKey);
    if (ply <= 0) {
      if (existing) {
        forgetCursorEntry(normalized, game.id, existing);
        cursorIndexByGame.delete(gameKey);
      }
      return;
    }
    const digest = existing?.pgn === game.pgn ? existing.digest : null;
    if (existing?.digest && existing.pgn !== game.pgn)
      cursorEntriesByContent.delete(cursorContentKey(normalized, game.id, existing.digest));
    cursorIndexByGame.delete(gameKey);
    cursorIndexByGame.set(gameKey, { ply, pgn: game.pgn, digest });
    if (digest) cursorEntriesByContent.set(cursorContentKey(normalized, game.id, digest), ply);
    const count = (cursorCounts.get(normalized) ?? 0) + (existing ? 0 : 1);
    cursorCounts.set(normalized, count);
    // Evict least-recently-used entries for this user beyond the bound.
    if (count > MAX_CURSORS_PER_USER) {
      let toEvict = count - MAX_CURSORS_PER_USER;
      for (const [key, entry] of cursorIndexByGame) {
        if (toEvict === 0) break;
        const parsed = JSON.parse(key) as [string, string];
        if (parsed[0] === normalized) {
          forgetCursorEntry(normalized, parsed[1], entry);
          cursorIndexByGame.delete(key);
          toEvict -= 1;
        }
      }
      cursorCounts.set(normalized, MAX_CURSORS_PER_USER);
    }
    // Resolve the durable digest identity asynchronously; PGN equality already guards
    // the synchronous restore path.
    if (digest) return;
    void (async () => {
      try {
        const digest = await computePgnDigest(game.pgn);
        const entry = cursorIndexByGame.get(gameKey);
        if (!entry || entry.pgn !== game.pgn || entry.digest === digest) return;
        if (entry.digest)
          cursorEntriesByContent.delete(cursorContentKey(normalized, game.id, entry.digest));
        cursorIndexByGame.set(gameKey, { ...entry, digest });
        cursorEntriesByContent.set(cursorContentKey(normalized, game.id, digest), entry.ply);
      } catch {
        /* The digest identity is optional for the in-memory cursor. */
      }
    })();
  };
  /** Restores the retained ply for `game`, or zero when absent or content-changed.
   * The clamp happens only after the current game parses legally. */
  const lastReviewedPly = (game: GameRecord): number => {
    const gameKey = gameCursorKey(game.username, game.id);
    const entry = cursorIndexByGame.get(gameKey);
    if (!entry) return 0;
    if (entry.pgn !== game.pgn) {
      forgetCursorEntry(game.username, game.id, entry);
      cursorIndexByGame.delete(gameKey);
      return 0;
    }
    cursorIndexByGame.delete(gameKey);
    cursorIndexByGame.set(gameKey, entry);
    const parsed = parseGamePgn({ game: toNormalizedSummary(game) });
    if (!parsed.ok) return 0;
    return Math.min(entry.ply, parsed.game.plies.length);
  };
  const rememberReview = (
    game: GameRecord,
    strength: AnalysisStrength,
    result: GameAnalysisResult
  ) => {
    const key = contentKey(game, strength);
    const previous = reviewResults.get(key);
    reviewResults.set(key, {
      lastComplete: result.status === 'complete' ? result : (previous?.lastComplete ?? null),
      latestAttempt: result,
    });
  };
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
    // T27: deletion removes retained cursors from memory and the saved session.
    if (action.type === 'data/userDeleted') {
      clearCursorsForUser(action.username);
      if (state.query.active?.username === action.username) clearWorkspaceSession();
    }
    if (action.type === 'data/allCleared') {
      clearAllCursors();
      clearWorkspaceSession();
    }
    const next = reduceWorkspace(state, action);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };

  /**
   * T40: builds the displayed opening graph from metadata-filtered accepted
   * records. Never replays games on the main thread; stale requests are
   * ignored by graph request identity, even within the same query token.
   */
  function buildOpeningGraph(
    games: readonly GameRecord[],
    horizon: number,
    scope: OpeningScope,
    datasetRevision: string,
    queryFingerprint: string,
    graphRequestId: number,
    token: number
  ): Promise<void> {
    const scopedGames = scope === 'both' ? games : games.filter((game) => game.userColor === scope);
    const summaries = scopedGames.map(toNormalizedSummary);
    const options: GraphBuildOptions = {
      maxOpeningPlies: horizon,
      includeRepeatedPositions: false,
    };
    const identity = createGraphCacheIdentity({
      username: state.query.active?.username ?? games[0]?.username ?? '',
      query: state.query.active ?? {
        username: games[0]?.username ?? '',
        timeClasses: ['blitz', 'rapid', 'bullet', 'daily'],
        colors: ['white', 'black'],
        maxGames: games.length,
      },
      scope,
      horizon,
      datasetRevision,
      includeRepeatedPositions: false,
    });
    const buildPromise = services.graph.load
      ? services.graph.load(identity, summaries)
      : services.graph.build(summaries, options, queryFingerprint);
    return buildPromise
      .then((graph) => {
        if (disposed || token !== state.query.token || graphRequestId !== graphSequence) return;
        dispatch({
          type: 'graph/terminal',
          token,
          status: graph.status,
          snapshot: graph.snapshot,
          diagnosticCodes: graph.status === 'complete' ? [] : graph.diagnosticCodes,
          requestId: graphRequestId,
          scope,
          datasetRevision,
        });
        if (scope === 'both') {
          dispatch({
            type: 'repertoire/installed',
            token,
            datasetRevision,
            horizon,
            moveKeys: collectPersonalRepertoireMoveKeys(graph.snapshot),
          });
        }
      })
      .catch((error: unknown) => {
        if (disposed || token !== state.query.token || graphRequestId !== graphSequence) return;
        const message = error instanceof Error ? error.message : 'Graph build failed.';
        if (message !== 'GRAPH_BUILD_CANCELLED')
          dispatch({ type: 'graph/failed', token, requestId: graphRequestId, error: message });
      });
  }

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
      const pgnDigest = await computePgnDigest(game.pgn);
      if (
        disposed ||
        token !== state.query.token ||
        sequence !== analysisSequence ||
        analysisController.signal.aborted
      )
        return;
      const identity = {
        queryToken: token,
        username: game.username,
        gameId: game.id,
        pgnDigest,
        strength,
        jobId: sequence,
      };
      dispatch({ type: 'analysis/started', token, identity });
      // The opening graph may be scoped or incomplete; it is not repertoire context.
      const bookMoveKeys: readonly string[] = [];
      try {
        const result = await services.analysis.analyze(
          game,
          strength,
          capability,
          {
            bookMoveKeys,
            isCurrent: () =>
              !disposed &&
              token === state.query.token &&
              gameAnalysisSequences.get(game.id) === sequence,
          },
          analysisController.signal,
          () => {
            /* Completed annotations own progressive coverage. */
          },
          (update) => dispatch({ type: 'analysis/update', identity, update })
        );
        if (
          !disposed &&
          token === state.query.token &&
          gameAnalysisSequences.get(game.id) === sequence
        ) {
          rememberReview(game, strength, result);
          dispatch({ type: 'analysis/terminal', token, gameId: game.id, result, identity });
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
    // Retain the leaving game's reviewed position before switching (T27). A variation
    // origin never reaches this path: stepping a PV does not dispatch selection/ply.
    const leavingGameId = state.selection.gameId;
    const leavingPly = state.selection.ply;
    if (leavingGameId) {
      const leavingGame = state.ingestion.result?.games.find((game) => game.id === leavingGameId);
      if (leavingGame) recordLastReviewedPly(leavingGame, leavingPly);
    }
    let retainedPly: number | undefined;
    if (gameId) {
      restoreGenerations.set(gameId, (restoreGenerations.get(gameId) ?? 0) + 1);
      const nextGame = state.ingestion.result?.games.find((game) => game.id === gameId);
      if (nextGame) {
        const restored = lastReviewedPly(nextGame);
        if (restored > 0) retainedPly = restored;
      }
    }
    analysisSequence++;
    runningReview = null;
    analysisController?.abort();
    analysisController = null;
    dispatch({ type: 'selection/game', gameId, ...(retainedPly ? { ply: retainedPly } : {}) });
  }

  function startOver(gameId: string): void {
    invalidateReviewIntent();
    // An explicit Start over intentionally selects zero and forgets the retained cursor.
    const game = state.ingestion.result?.games.find((candidate) => candidate.id === gameId);
    if (game) {
      const gameKey = gameCursorKey(game.username, gameId);
      const entry = cursorIndexByGame.get(gameKey);
      if (entry) {
        forgetCursorEntry(game.username, gameId, entry);
        cursorIndexByGame.delete(gameKey);
      }
    }
    if (state.selection.gameId === gameId) {
      dispatch({ type: 'selection/ply', ply: 0 });
    }
  }

  function requestReview(
    source: GameRecord,
    strength: AnalysisStrength,
    restore: boolean
  ): Promise<void> {
    if (disposed || maintenance || state.analysis.status === 'stopping') return Promise.resolve();
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
        const remembered = reviewResults.get(contentKey(game, strength));
        let saved = remembered?.lastComplete ?? remembered?.latestAttempt ?? null;
        if (!saved && services.analysis.restoreSelected) {
          try {
            saved = await services.analysis.restoreSelected(game, strength);
          } catch {
            /* Optional storage failure must not prevent a fresh review. */
          }
        }
        if (!current()) return;
        if (saved) {
          const digest = await computePgnDigest(game.pgn);
          if (!current()) return;
          rememberReview(game, strength, saved);
          dispatch({
            type: 'analysis/terminal',
            token,
            gameId: game.id,
            result: saved,
            strength,
            reviewKey: reviewResultKey(game.username, game.id, digest, strength),
          });
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
            ...(options.cacheOnly !== undefined ? { cacheOnly: options.cacheOnly } : {}),
            onProgress: (progress) => dispatch({ type: 'ingestion/progress', token, progress }),
          });
          if (disposed || token !== state.query.token) return;
          const newest = result.games.reduce<GameRecord | null>(
            (current, game) => (!current || game.endedAt > current.endedAt ? game : current),
            null
          );
          dispatch({
            type: 'ingestion/terminal',
            token,
            result,
            ply: newest ? lastReviewedPly(newest) : 0,
          });
          if (result.games.length === 0) return;
          const strength = state.preferences.analysisStrength;
          const generations = new Map(
            result.games.map((game) => [game.id, restoreGenerations.get(game.id) ?? 0])
          );
          // Let startup selection claim its selected read before background reads begin.
          setTimeout(() => {
            if (disposed || token !== state.query.token) return;
            const restore = services.analysis.restore;
            const selected = result.games.find((game) => game.id === state.selection.gameId);
            const install = async (game: GameRecord, saved: GameAnalysisResult) => {
              const digest = await computePgnDigest(game.pgn);
              if (
                disposed ||
                token !== state.query.token ||
                generations.get(game.id) !== 0 ||
                (restoreGenerations.get(game.id) ?? 0) !== generations.get(game.id) ||
                strength !== state.preferences.analysisStrength
              )
                return;
              rememberReview(game, strength, saved);
              dispatch({
                type: 'analysis/terminal',
                token,
                gameId: game.id,
                result: saved,
                strength,
                reviewKey: reviewResultKey(game.username, game.id, digest, strength),
              });
            };
            void (async () => {
              const selectedRead = services.analysis.restoreSelected;
              if (
                selected &&
                selectedRead &&
                generations.get(selected.id) === 0 &&
                (restoreGenerations.get(selected.id) ?? 0) === 0
              ) {
                try {
                  const saved = await selectedRead(selected, strength);
                  if (saved) await install(selected, saved);
                } catch {
                  /* Optional selected review. */
                }
              }
              if (!restore || disposed || token !== state.query.token) return;
              const remaining =
                selectedRead && selected
                  ? result.games.filter((game) => game.id !== selected.id)
                  : result.games;
              if (remaining.length === 0) return;
              try {
                const restored = await restore(remaining, strength);
                await Promise.all(
                  Object.entries(restored).map(async ([id, saved]) => {
                    const game = remaining.find((candidate) => candidate.id === id);
                    if (game) await install(game, saved);
                  })
                );
              } catch {
                /* Optional saved reviews. */
              }
            })();
          }, 0);
          const graphRequestId = ++graphSequence;
          const datasetRevision = await computeDatasetRevision(result.games);
          datasetRevisions.set(result, datasetRevision);
          dispatch({ type: 'graph/started', token, requestId: graphRequestId });
          void buildOpeningGraph(
            result.games,
            state.preferences.openingHorizon,
            'both',
            datasetRevision,
            result.fingerprint,
            graphRequestId,
            token
          );
        } catch (error) {
          console.error('[workspace operation failed]', error);
          if (disposed || token !== state.query.token) return;
          const message = error instanceof Error ? error.message : 'Workspace operation failed.';
          if (state.ingestion.status === 'loading') {
            dispatch({ type: 'ingestion/failed', token, error: message });
          } else if (message !== 'GRAPH_BUILD_CANCELLED') {
            dispatch({ type: 'graph/failed', token, requestId: graphSequence, error: message });
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
    startOver,
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
    async requestOpeningGraph(scope: OpeningScope) {
      const dataset = state.ingestion.result;
      if (!dataset || dataset.games.length === 0 || disposed || maintenance) {
        return Promise.resolve();
      }
      // A color excluded from import needs an explicit load. Retain current
      // candidates and line while the user edits or submits that import.
      if (scope !== 'both' && !state.query.active?.colors.includes(scope)) return;
      const horizon = state.preferences.openingHorizon;
      const datasetRevision = revisionFor(dataset);
      const graphRequestId = ++graphSequence;
      dispatch({
        type: 'graph/rebuildStarted',
        requestId: graphRequestId,
        scope,
        datasetRevision,
      });
      const token = state.query.token;
      await buildOpeningGraph(
        dataset.games,
        horizon,
        scope,
        datasetRevision,
        dataset.fingerprint,
        graphRequestId,
        token
      );
      if (
        disposed ||
        token !== state.query.token ||
        graphRequestId !== graphSequence ||
        scope === 'both'
      )
        return;
      if (
        state.repertoire?.datasetRevision === datasetRevision &&
        state.repertoire.horizon === horizon
      )
        return;
      try {
        const repertoireIdentity = createGraphCacheIdentity({
          username: state.query.active?.username ?? dataset.games[0]?.username ?? '',
          query: state.query.active ?? {
            username: dataset.games[0]?.username ?? '',
            timeClasses: ['blitz', 'rapid', 'bullet', 'daily'],
            colors: ['white', 'black'],
            maxGames: dataset.games.length,
          },
          scope: 'both',
          horizon,
          datasetRevision,
          includeRepeatedPositions: false,
        });
        const context = services.graph.load
          ? await services.graph.load(repertoireIdentity, dataset.games.map(toNormalizedSummary))
          : await services.graph.build(
              dataset.games.map(toNormalizedSummary),
              { maxOpeningPlies: horizon, includeRepeatedPositions: false },
              dataset.fingerprint
            );
        if (disposed || token !== state.query.token || graphRequestId !== graphSequence) return;
        dispatch({
          type: 'repertoire/installed',
          token,
          datasetRevision,
          horizon,
          moveKeys: collectPersonalRepertoireMoveKeys(context.snapshot),
        });
      } catch {
        // Repertoire tags remain unavailable; base scores and scoped candidates stay usable.
      }
    },
    selectPly(ply) {
      dispatch({ type: 'selection/ply', ply });
      const game = state.ingestion.result?.games.find((game) => game.id === state.selection.gameId);
      if (game) recordLastReviewedPly(game, state.selection.ply);
    },
    startAnalysis(strength = state.preferences.analysisStrength) {
      const game = state.ingestion.result?.games.find((game) => game.id === state.selection.gameId);
      return game ? requestReview(game, strength, false) : Promise.resolve();
    },
    cancelAnalysis() {
      invalidateReviewIntent();
      runningReview = null;
      if (state.analysis.status === 'running' && state.analysis.identity) {
        dispatch({ type: 'analysis/stopping', identity: state.analysis.identity });
        analysisController?.abort();
      } else if (analysisController) {
        analysisSequence++;
        analysisController.abort();
        analysisController = null;
        dispatch({ type: 'analysis/preparationCancelled' });
      }
    },
    deleteUserData(username) {
      const normalized = username.toLowerCase();
      return runDeletion(
        'user',
        async () => {
          await services.graph.deleteUser?.(normalized);
          return services.data.deleteUsername(normalized);
        },
        () => ({ type: 'data/userDeleted', username: normalized })
      );
    },
    clearAllData() {
      return runDeletion(
        'all',
        async () => {
          services.graph.clearMemory?.();
          return services.data.clearAll();
        },
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

export function toNormalizedSummary(game: IngestionResult['games'][number]): NormalizedGameSummary {
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
