import type { OpeningGraphSnapshot } from '@/lib/chess/graph/openingGraph';
import type { MoveEdge } from '@/lib/chess/graph/types';
import type { AppliedBoardMove } from '@/features/board/moves';

import type { OutcomePerspective } from './selectors';

export interface GraphNavigationEntry {
  positionKey: string;
  pathId: number;
}

export interface GraphNavigationState extends GraphNavigationEntry {
  history: readonly GraphNavigationEntry[];
}

export interface BoardMoveNavigationResult {
  observed: boolean;
  nextPositionKey: string;
  nextPathId: number | null;
  warning?: string;
}

export function createGraphNavigation(graph: OpeningGraphSnapshot): GraphNavigationState {
  const root = { positionKey: graph.root.key, pathId: 0 };
  return { ...root, history: [root] };
}

export function navigateCandidate(
  graph: OpeningGraphSnapshot,
  state: GraphNavigationState,
  edge: MoveEdge
): GraphNavigationState {
  if (!graph.positions.has(edge.targetKey)) throw new Error('UNKNOWN_GRAPH_POSITION');
  const pathId = graph.paths.lookup(state.pathId, edge.uci);
  if (pathId === undefined) throw new Error('UNKNOWN_GRAPH_PATH');
  const entry = { positionKey: edge.targetKey, pathId };
  return { ...entry, history: [...state.history, entry] };
}

export function navigateToHistoryIndex(
  state: GraphNavigationState,
  index: number
): GraphNavigationState {
  if (!Number.isInteger(index) || index < 0 || index >= state.history.length) {
    throw new Error('INVALID_GRAPH_HISTORY_INDEX');
  }
  const entry = state.history[index]!;
  return { ...entry, history: state.history.slice(0, index + 1) };
}

export function navigateBack(state: GraphNavigationState): GraphNavigationState {
  return navigateToHistoryIndex(state, Math.max(0, state.history.length - 2));
}

export function navigationBreadcrumbs(
  graph: OpeningGraphSnapshot,
  state: GraphNavigationState
): string[] {
  return graph.paths.sequence(state.pathId).map(({ san }) => san);
}

export function perspectiveLabels(
  perspective: OutcomePerspective
): readonly [string, string, string] {
  return perspective === 'user'
    ? ['User win', 'Draw', 'User loss']
    : ['White win', 'Draw', 'Black win'];
}

export function resolveBoardMoveInGraph(
  graph: OpeningGraphSnapshot,
  currentPositionKey: string,
  currentPathId: number,
  move: AppliedBoardMove
): BoardMoveNavigationResult {
  const currentNode = graph.positions.get(currentPositionKey);
  if (!currentNode) {
    return {
      observed: false,
      nextPositionKey: move.fenAfter,
      nextPathId: null,
      warning: 'This move does not appear in your imported games.',
    };
  }

  const edge = currentNode.outgoing.get(move.uci);
  if (edge) {
    const directPathId = graph.paths.lookup(currentPathId, move.uci);
    const targetNode = graph.positions.get(edge.targetKey);
    const fallbackPathId = targetNode?.arrivalsByPath.keys().next().value ?? null;
    const nextPathId = directPathId ?? fallbackPathId ?? currentPathId;

    return {
      observed: true,
      nextPositionKey: edge.targetKey,
      nextPathId,
    };
  }

  return {
    observed: false,
    nextPositionKey: move.fenAfter,
    nextPathId: null,
    warning: 'This move does not appear in your imported games.',
  };
}
