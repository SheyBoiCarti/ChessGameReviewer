import type { GameQuery, NormalizedGameSummary } from '@/lib/api/contracts';
import type { GraphBuildOptions } from '@/lib/chess/graph/types';
import type { EngineCapability } from '@/lib/engine/capabilities';
import type { ClearAllResult, DeletionResult } from '@/lib/db/deleteLocalData';
import type { GameRecord } from '@/lib/db/schema';

import type { GameAnalysisResult } from '../stockfish-analysis/analyzeGame';
import type { AnalysisStrength } from './types';
import type { GraphBuildWorkerResult } from '../opening-tree/graphWorkerClient';
import type { IngestionProgress, IngestionResult } from '../ingestion/types';
import { initialWorkspaceState, reduceWorkspace } from './reducer';
import type { WorkspaceAction, WorkspaceState } from './types';

interface IngestionStartOptions {
  manualRefresh?: boolean;
  onProgress?: (progress: IngestionProgress) => void;
}

export interface WorkspaceServices {
  ingestion: {
    start(query: GameQuery, options: IngestionStartOptions): Promise<IngestionResult>;
    cancel(): void;
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
    dispose(): void;
  };
  data: {
    deleteUsername(username: string): Promise<DeletionResult>;
    clearAll(): Promise<ClearAllResult>;
    dispose(): void;
  };
  analysis: {
    analyze(
      game: GameRecord,
      strength: AnalysisStrength,
      capability: EngineCapability,
      signal: AbortSignal,
      onProgress: (progress: { analyzedPlies: number; totalPlies: number }) => void
    ): Promise<GameAnalysisResult>;
  };
}

export interface WorkspaceController {
  getState(): WorkspaceState;
  subscribe(listener: () => void): () => void;
  submitQuery(query: GameQuery, options?: { manualRefresh?: boolean }): Promise<void>;
  cancelIngestion(): void;
  probeEngine(): Promise<void>;
  selectGame(gameId: string | null): void;
  navigateGraph(positionKey: string, pathId: number | null): void;
  selectPly(ply: number): void;
  startAnalysis(strength?: AnalysisStrength): Promise<void>;
  cancelAnalysis(): void;
  deleteUserData(username: string): Promise<DeletionResult>;
  clearAllData(): Promise<ClearAllResult>;
  dispatch(action: WorkspaceAction): void;
  dispose(): void;
}

export function createWorkspaceController(services: WorkspaceServices): WorkspaceController {
  let state = initialWorkspaceState;
  let nextToken = 0;
  let disposed = false;
  let analysisSequence = 0;
  let analysisController: AbortController | null = null;
  const listeners = new Set<() => void>();

  const dispatch = (action: WorkspaceAction): void => {
    if (disposed) return;
    const next = reduceWorkspace(state, action);
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };

  return {
    getState: () => state,
    subscribe(listener) {
      disposed = false;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async submitQuery(query, options = {}) {
      disposed = false;
      const token = ++nextToken;
      services.ingestion.cancel();
      services.graph.cancel();
      dispatch({ type: 'query/started', query, token });
      try {
        const result = await services.ingestion.start(query, {
          ...(options.manualRefresh !== undefined ? { manualRefresh: options.manualRefresh } : {}),
          onProgress: (progress) => dispatch({ type: 'ingestion/progress', token, progress }),
        });
        dispatch({ type: 'ingestion/terminal', token, result });
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
    },
    cancelIngestion() {
      services.ingestion.cancel();
    },
    async probeEngine() {
      dispatch({ type: 'analysis/probing' });
      try {
        const capability = await services.engine.initialize();
        dispatch({ type: 'analysis/capability', capability });
      } catch (error) {
        dispatch({
          type: 'analysis/capability',
          capability: unavailableCapability(error),
        });
      }
    },
    selectGame(gameId) {
      analysisSequence += 1;
      analysisController?.abort();
      analysisController = null;
      dispatch({ type: 'selection/game', gameId });
    },
    navigateGraph(positionKey, pathId) {
      dispatch({ type: 'selection/position', positionKey, pathId });
    },
    selectPly(ply) {
      dispatch({ type: 'selection/ply', ply });
    },
    async startAnalysis(strength = state.preferences.analysisStrength) {
      const game = state.ingestion.result?.games.find(({ id }) => id === state.selection.gameId);
      const capability = state.analysis.capability;
      if (!game || !capability || capability.mode === 'unavailable') return;
      const sequence = ++analysisSequence;
      analysisController?.abort();
      analysisController = new AbortController();
      const token = state.query.token;
      dispatch({ type: 'analysis/started', token });
      try {
        const result = await services.analysis.analyze(
          game,
          strength,
          capability,
          analysisController.signal,
          (progress) => {
            if (sequence === analysisSequence) {
              dispatch({ type: 'analysis/progress', token, progress });
            }
          }
        );
        if (sequence === analysisSequence) {
          dispatch({ type: 'analysis/terminal', token, result });
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
    },
    cancelAnalysis() {
      analysisSequence += 1;
      analysisController?.abort();
      analysisController = null;
      dispatch({ type: 'analysis/cancelled', token: state.query.token });
    },
    async deleteUserData(username) {
      const normalized = username.toLowerCase();
      const result = await services.data.deleteUsername(normalized);
      dispatch({ type: 'data/userDeleted', username: normalized });
      return result;
    },
    async clearAllData() {
      const result = await services.data.clearAll();
      dispatch({ type: 'data/allCleared' });
      return result;
    },
    dispatch,
    dispose() {
      if (disposed) return;
      services.ingestion.cancel();
      analysisController?.abort();
      services.graph.cancel();
      services.graph.dispose();
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
