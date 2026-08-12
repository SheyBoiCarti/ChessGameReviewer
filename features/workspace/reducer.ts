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

const idleGraph = { status: 'idle', snapshot: null, error: null } as const;
const idleAnalysis = {
  status: 'idle',
  capability: null,
  result: null,
  progress: null,
  error: null,
} as const;

export const initialWorkspaceState: WorkspaceState = {
  query: { draft: defaultQuery, active: null, token: 0 },
  ingestion: { status: 'idle', progress: null, result: null, error: null },
  graph: idleGraph,
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
  if ('token' in action && action.type !== 'query/started' && action.token !== state.query.token) {
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
      };
    }
    case 'ingestion/failed':
      return {
        ...state,
        ingestion: { ...state.ingestion, status: 'failed', error: action.error },
      };
    case 'graph/started':
      return { ...state, graph: { status: 'building', snapshot: null, error: null } };
    case 'graph/terminal':
      return {
        ...state,
        graph: { status: action.status, snapshot: action.snapshot, error: null },
        selection: {
          ...state.selection,
          positionKey: action.snapshot.rootKey,
          pathId: 0,
        },
      };
    case 'graph/failed':
      return { ...state, graph: { status: 'failed', snapshot: null, error: action.error } };
    case 'selection/game':
      return { ...state, selection: { ...state.selection, gameId: action.gameId, ply: 0 } };
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
    case 'analysis/terminal':
      return {
        ...state,
        analysis: {
          ...state.analysis,
          status: action.result.status,
          result: action.result,
          error: action.result.error ?? null,
        },
      };
    case 'analysis/failed':
      return { ...state, analysis: { ...state.analysis, status: 'failed', error: action.error } };
    case 'preferences/changed':
      return { ...state, preferences: { ...state.preferences, ...action.preferences } };
    case 'data/userDeleted':
      return state.query.active?.username === action.username.toLowerCase()
        ? resetLoadedData(state)
        : state;
    case 'data/allCleared':
      return resetLoadedData(state);
  }
}

function resetLoadedData(state: WorkspaceState): WorkspaceState {
  return {
    ...state,
    query: { ...state.query, active: null },
    ingestion: { status: 'idle', progress: null, result: null, error: null },
    graph: idleGraph,
    selection: emptySelection,
    analysis: idleAnalysis,
  };
}
