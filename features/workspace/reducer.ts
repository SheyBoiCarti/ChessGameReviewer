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
    case 'query/started':
      return {
        ...state,
        query: { draft: action.query, active: action.query, token: action.token },
        ingestion: { status: 'loading', progress: null, result: null, error: null },
        graph: idleGraph,
        selection: emptySelection,
        analysis: idleAnalysis,
      };
    case 'ingestion/progress':
      return { ...state, ingestion: { ...state.ingestion, progress: action.progress } };
    case 'ingestion/terminal': {
      const status =
        action.result.status === 'complete' && action.result.games.length === 0
          ? 'empty'
          : action.result.status;
      return {
        ...state,
        ingestion: {
          status,
          progress: state.ingestion.progress,
          result: action.result,
          error: null,
        },
        selection:
          action.result.games.length > 0
            ? {
                ...emptySelection,
                gameId: action.result.games.reduce((newest, game) =>
                  game.endedAt > newest.endedAt ? game : newest
                ).id,
              }
            : emptySelection,
      };
    }
    case 'ingestion/failed':
      return {
        ...state,
        ingestion: { ...state.ingestion, status: 'failed', error: action.error },
      };
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
        selection: { ...state.selection, gameId: action.gameId, ply: 0 },
        analysis: {
          ...idleAnalysis,
          capability: state.analysis.capability,
          resultsByGameId: state.analysis.resultsByGameId,
          status: cached
            ? 'complete'
            : state.analysis.capability?.mode === 'unavailable'
              ? 'unavailable'
              : 'idle',
          result: cached,
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
    case 'analysis/probing':
      return { ...state, analysis: { ...idleAnalysis, status: 'probing' } };
    case 'analysis/capability':
      return {
        ...state,
        analysis: {
          ...state.analysis,
          status: action.capability.mode === 'unavailable' ? 'unavailable' : 'idle',
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
          result: null,
          progress: null,
          error: null,
        },
      };
    case 'analysis/progress':
      return { ...state, analysis: { ...state.analysis, progress: action.progress } };
    case 'analysis/terminal': {
      const gameId = state.selection.gameId;
      const resultsByGameId =
        gameId && action.result.status === 'complete'
          ? { ...state.analysis.resultsByGameId, [gameId]: action.result }
          : state.analysis.resultsByGameId;
      return {
        ...state,
        analysis: {
          ...state.analysis,
          status: action.result.status,
          result: action.result,
          error: action.result.error ?? null,
          resultsByGameId,
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
    query: { ...state.query, active: null },
    ingestion: { status: 'idle', progress: null, result: null, error: null },
    graph: idleGraph,
    dataMaintenance: state.dataMaintenance,
    selection: emptySelection,
    analysis: idleAnalysis,
  };
}
