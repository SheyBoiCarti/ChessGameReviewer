import { reviewResultKey } from '../stockfish-analysis/reviewIdentity';
import { summarizeAnnotations } from '../stockfish-analysis/analyzeGame';
import type { GameQuery } from '@/lib/api/contracts';

import type { WorkspaceAction, WorkspaceState } from './types';

const defaultQuery: GameQuery = {
  username: '',
  maxGames: 500,
  timeClasses: ['bullet', 'blitz', 'rapid', 'daily'],
  colors: ['white', 'black'],
};

const emptySelection = {
  gameId: null,
  positionKey: null,
  pathId: null,
  ply: 0,
} as const;

const idleGraph = { status: 'idle', snapshot: null, diagnosticCodes: [], error: null } as const;
const idleAnalysis = {
  status: 'idle',
  capability: null,
  identity: null,
  result: null,
  progress: null,
  error: null,
  resultsByGameId: {},
} as const;

export const initialWorkspaceState: WorkspaceState = {
  query: { draft: defaultQuery, active: null, token: 0 },
  ingestion: { status: 'idle', progress: null, result: null, error: null },
  graph: idleGraph,
  dataMaintenance: { status: 'idle', error: null },
  selection: emptySelection,
  analysis: idleAnalysis,
  preferences: {
    boardOrientation: 'white',
    resultPerspective: 'user',
    theme: 'system',
    openingHorizon: 30,
    analysisStrength: 'balanced',
  },
};

export function reduceWorkspace(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  if (
    'token' in action &&
    action.type !== 'query/started' &&
    action.type !== 'operations/invalidated' &&
    action.token !== state.query.token
  ) {
    return state;
  }

  switch (action.type) {
    case 'query/draftChanged':
      return { ...state, query: { ...state.query, draft: action.query } };
    case 'query/started': {
      const hasExistingGames = (state.ingestion.result?.games.length ?? 0) > 0;
      return {
        ...state,
        query: {
          draft: action.query,
          active: hasExistingGames ? state.query.active : null,
          requested: action.query,
          token: action.token,
        },
        ingestion: {
          status: 'loading',
          lastAttempt: null,
          progress: null,
          result: hasExistingGames ? state.ingestion.result : null,
          error: null,
        },
        graph: hasExistingGames ? state.graph : idleGraph,
        selection: hasExistingGames ? state.selection : emptySelection,
        analysis: hasExistingGames ? state.analysis : idleAnalysis,
      };
    }
    case 'ingestion/progress':
      return { ...state, ingestion: { ...state.ingestion, progress: action.progress } };
    case 'ingestion/terminal': {
      const hasExistingGames = (state.ingestion.result?.games.length ?? 0) > 0;
      const isFailed =
        action.result.status === 'failed' ||
        (action.result.status === 'cancelled' && action.result.games.length === 0);

      if (isFailed && hasExistingGames) {
        return {
          ...state,
          ingestion: {
            ...state.ingestion,
            lastAttempt: action.result,
            status: action.result.status === 'cancelled' ? 'cancelled' : 'failed',
            error:
              action.result.status === 'cancelled'
                ? null
                : (action.result.diagnostics[0]?.message ??
                  action.result.failedMonths[0]?.error.message ??
                  'Games could not be loaded'),
          },
        };
      }

      const status =
        action.result.status === 'complete' && action.result.games.length === 0
          ? 'empty'
          : action.result.status;
      const gameId =
        action.result.games.length > 0
          ? action.result.games.reduce((newest, game) =>
              game.endedAt > newest.endedAt ? game : newest
            ).id
          : null;
      const previousGames = new Map(
        state.ingestion.result?.games.map((game) => [game.id, game]) ?? []
      );
      const resultsByGameId = Object.fromEntries(
        Object.entries(state.analysis.resultsByGameId).filter(([id]) => {
          const oldGame = previousGames.get(id);
          const newGame = action.result.games.find((game) => game.id === id);
          return (
            oldGame &&
            newGame &&
            oldGame.username === newGame.username &&
            oldGame.pgn === newGame.pgn
          );
        })
      );
      const cached = gameId ? (resultsByGameId[gameId] ?? null) : null;
      return {
        ...state,
        query: {
          ...state.query,
          active: isFailed ? state.query.active : (state.query.requested ?? state.query.active),
        },
        analysis: {
          ...state.analysis,
          resultsByGameId,
          resultStrength:
            cached && gameId ? (state.analysis.resultStrengthsByGameId?.[gameId] ?? null) : null,
          identity: null,
          previousResult: null,
          previousStrength: null,
          showingPrevious: false,
          status:
            cached?.status ??
            (state.analysis.capability?.mode === 'unavailable' ? 'unavailable' : 'idle'),
          result: cached,
          progress: cached
            ? { analyzedPlies: cached.analyzedPlies, totalPlies: cached.totalPlies }
            : null,
          error: null,
        },
        ingestion: {
          status,
          progress: state.ingestion.progress,
          result: action.result,
          lastAttempt: action.result,
          error: null,
        },
        graph: action.result.games.length === 0 ? idleGraph : state.graph,
        selection: { ...emptySelection, gameId },
      };
    }
    case 'ingestion/failed':
      return {
        ...state,
        ingestion: { ...state.ingestion, status: 'failed', error: action.error, lastAttempt: null },
      };
    case 'ingestion/errorDismissed': {
      const currentResult = state.ingestion.result;
      const recoveredStatus = currentResult
        ? currentResult.games.length > 0
          ? currentResult.status === 'partial'
            ? 'partial'
            : 'complete'
          : 'empty'
        : 'idle';
      return {
        ...state,
        ingestion: {
          ...state.ingestion,
          status: recoveredStatus,
          error: null,
        },
      };
    }
    case 'graph/started':
      return {
        ...state,
        graph: { status: 'building', snapshot: null, diagnosticCodes: [], error: null },
      };
    case 'graph/terminal':
      return {
        ...state,
        graph: {
          status: action.status,
          snapshot: action.snapshot,
          diagnosticCodes: action.diagnosticCodes,
          error: null,
        },
        selection: {
          ...state.selection,
          positionKey: action.snapshot.rootKey,
          pathId: 0,
        },
      };
    case 'graph/failed':
      return {
        ...state,
        graph: { status: 'failed', snapshot: null, diagnosticCodes: [], error: action.error },
      };
    case 'selection/game': {
      const cached = action.gameId
        ? (state.analysis.resultsByGameId?.[action.gameId] ?? null)
        : null;
      return {
        ...state,
        // A retained last-reviewed ply (T27) is installed atomically with the selection;
        // without one, explicit selection starts at position zero.
        selection: {
          ...state.selection,
          gameId: action.gameId,
          ply: Math.max(0, action.ply ?? 0),
        },
        analysis: {
          ...idleAnalysis,
          capability: state.analysis.capability,
          resultsByGameId: state.analysis.resultsByGameId,
          reviewEntries: state.analysis.reviewEntries ?? {},
          resultStrengthsByGameId: state.analysis.resultStrengthsByGameId ?? {},
          resultStrength:
            cached && action.gameId
              ? (state.analysis.resultStrengthsByGameId?.[action.gameId] ?? null)
              : null,
          status: cached
            ? cached.status
            : state.analysis.capability?.mode === 'unavailable'
              ? 'unavailable'
              : 'idle',
          result: cached,
          progress: cached
            ? { analyzedPlies: cached.analyzedPlies, totalPlies: cached.totalPlies }
            : null,
          error:
            !cached && state.analysis.capability?.mode === 'unavailable'
              ? (state.analysis.capability.reason ?? null)
              : null,
        },
      };
    }
    case 'selection/position':
      return {
        ...state,
        selection: {
          ...state.selection,
          positionKey: action.positionKey,
          pathId: action.pathId,
        },
      };
    case 'selection/ply':
      return { ...state, selection: { ...state.selection, ply: Math.max(0, action.ply) } };
    case 'analysis/preparationCancelled':
      return {
        ...state,
        analysis: {
          ...state.analysis,
          status:
            state.analysis.result?.status ??
            (state.analysis.capability?.mode === 'unavailable' ? 'unavailable' : 'idle'),
        },
      };
    case 'analysis/probing':
      return { ...state, analysis: { ...state.analysis, status: 'probing' } };
    case 'analysis/capability':
      return {
        ...state,
        analysis: {
          ...state.analysis,
          status:
            state.analysis.result?.status ??
            (action.capability.mode === 'unavailable' ? 'unavailable' : 'idle'),
          capability: action.capability,
          error:
            action.capability.mode === 'unavailable' ? (action.capability.reason ?? null) : null,
        },
      };
    case 'analysis/started':
      return {
        ...state,
        analysis: {
          ...state.analysis,
          status: 'running',
          identity: action.identity ?? null,
          previousResult: state.analysis.result,
          previousStrength: state.analysis.resultStrength ?? null,
          showingPrevious: !!state.analysis.result,
          result: state.analysis.result,
          progress: null,
          error: null,
        },
      };
    case 'analysis/update': {
      const identity = state.analysis.identity;
      if (
        !identity ||
        state.analysis.status !== 'running' ||
        identity.jobId !== action.identity.jobId ||
        identity.queryToken !== state.query.token ||
        JSON.stringify(identity) !== JSON.stringify(action.identity) ||
        state.selection.gameId !== identity.gameId
      )
        return state;
      const byPly = new Map(
        (state.analysis.showingPrevious ? [] : (state.analysis.result?.annotations ?? [])).map(
          (item) => [item.ply, item]
        )
      );
      if (byPly.has(action.update.annotation.ply)) return state;
      byPly.set(action.update.annotation.ply, action.update.annotation);
      const annotations = [...byPly.values()].sort((a, b) => a.ply - b.ply);
      const result = {
        status: 'partial' as const,
        annotations,
        analyzedPlies: annotations.length,
        totalPlies: action.update.totalPlies,
        summary: summarizeAnnotations(annotations),
        warnings: [],
      };
      const key = reviewResultKey(
        identity.username,
        identity.gameId,
        identity.pgnDigest,
        identity.strength
      );
      const previous = state.analysis.reviewEntries?.[key];
      return {
        ...state,
        analysis: {
          ...state.analysis,
          reviewEntries: {
            ...state.analysis.reviewEntries,
            [key]: { lastComplete: previous?.lastComplete ?? null, latestAttempt: result },
          },
          result,
          resultStrength: identity.strength,
          showingPrevious: false,
          progress: { analyzedPlies: annotations.length, totalPlies: result.totalPlies },
        },
      };
    }
    case 'analysis/stopping':
      if (
        state.analysis.status !== 'running' ||
        JSON.stringify(state.analysis.identity) !== JSON.stringify(action.identity)
      )
        return state;
      return { ...state, analysis: { ...state.analysis, status: 'stopping' } };
    case 'analysis/progress':
      return { ...state, analysis: { ...state.analysis, progress: action.progress } };
    case 'analysis/terminal': {
      if (
        action.identity &&
        state.selection.gameId === action.identity.gameId &&
        (state.analysis.identity?.jobId !== action.identity.jobId ||
          !['running', 'stopping'].includes(state.analysis.status))
      )
        return state;
      const gameId = action.gameId ?? state.selection.gameId;
      const key =
        action.reviewKey ??
        (action.identity
          ? reviewResultKey(
              action.identity.username,
              action.identity.gameId,
              action.identity.pgnDigest,
              action.identity.strength
            )
          : null);
      const previousEntry = key ? state.analysis.reviewEntries?.[key] : undefined;
      const reviewEntries = key
        ? {
            ...state.analysis.reviewEntries,
            [key]: {
              lastComplete:
                action.result.status === 'complete'
                  ? action.result
                  : (previousEntry?.lastComplete ?? null),
              latestAttempt: action.result,
            },
          }
        : (state.analysis.reviewEntries ?? {});
      const existing = gameId ? state.analysis.resultsByGameId[gameId] : null;
      const projected =
        existing?.status === 'complete' && action.result.status !== 'complete'
          ? existing
          : action.result;
      const resultsByGameId = gameId
        ? { ...state.analysis.resultsByGameId, [gameId]: projected }
        : state.analysis.resultsByGameId;
      return {
        ...state,
        analysis: {
          ...state.analysis,
          resultsByGameId,
          reviewEntries,
          resultStrengthsByGameId:
            gameId && projected === action.result && (action.identity?.strength ?? action.strength)
              ? {
                  ...state.analysis.resultStrengthsByGameId,
                  [gameId]: (action.identity?.strength ?? action.strength)!,
                }
              : (state.analysis.resultStrengthsByGameId ?? {}),
          ...(gameId !== state.selection.gameId
            ? {}
            : {
                status: action.result.status,
                resultStrength:
                  action.result.annotations.length === 0 && state.analysis.previousResult
                    ? state.analysis.previousStrength
                    : (action.identity?.strength ??
                      action.strength ??
                      state.analysis.resultStrength),
                result:
                  action.result.annotations.length === 0 && state.analysis.previousResult
                    ? state.analysis.previousResult
                    : action.result,
                showingPrevious:
                  action.result.annotations.length === 0 && !!state.analysis.previousResult,
                error: action.result.error ?? null,
                progress: {
                  analyzedPlies: action.result.analyzedPlies,
                  totalPlies: action.result.totalPlies,
                },
              }),
        },
      };
    }
    case 'analysis/cancelled':
      return {
        ...state,
        analysis: { ...state.analysis, status: 'cancelled', error: null },
      };
    case 'analysis/failed':
      return { ...state, analysis: { ...state.analysis, status: 'failed', error: action.error } };
    case 'preferences/changed':
      return { ...state, preferences: { ...state.preferences, ...action.preferences } };
    case 'operations/invalidated':
      return {
        ...state,
        query: { ...state.query, token: action.token },
        ingestion:
          state.ingestion.status === 'loading'
            ? { ...state.ingestion, status: 'cancelled' }
            : state.ingestion,
        graph: state.graph.status === 'building' ? idleGraph : state.graph,
        analysis:
          state.analysis.status === 'running'
            ? { ...state.analysis, status: 'cancelled' }
            : state.analysis,
      };
    case 'data/deletionStarted':
      return {
        ...state,
        dataMaintenance: {
          status: action.kind === 'user' ? 'deleting-user' : 'clearing-all',
          error: null,
        },
      };
    case 'data/deletionFailed':
      return {
        ...state,
        dataMaintenance: { status: 'idle', error: action.error },
      };
    case 'data/userDeleted': {
      const matchesActiveUser = state.query.active?.username === action.username.toLowerCase();
      if (
        !matchesActiveUser &&
        state.dataMaintenance.status === 'idle' &&
        state.dataMaintenance.error === null
      ) {
        return state;
      }
      const next = matchesActiveUser ? resetLoadedData(state) : state;
      return { ...next, dataMaintenance: { status: 'idle', error: null } };
    }
    case 'data/allCleared':
      return {
        ...resetLoadedData(state),
        dataMaintenance: { status: 'idle', error: null },
      };
  }
}

function resetLoadedData(state: WorkspaceState): WorkspaceState {
  return {
    ...state,
    query: { ...state.query, active: null, requested: null },
    ingestion: { status: 'idle', progress: null, result: null, error: null },
    graph: idleGraph,
    dataMaintenance: state.dataMaintenance,
    selection: emptySelection,
    analysis: idleAnalysis,
  };
}
