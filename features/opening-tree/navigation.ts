import type { OpeningGraphSnapshot } from '@/lib/chess/graph/openingGraph';
import type { MoveEdge } from '@/lib/chess/graph/types';
import { applyBoardMove, type AppliedBoardMove, type PromotionPiece } from '@/features/board/moves';
import type { Square } from 'chess.js';
import { normalizePositionKey } from '@/lib/chess/fen';

import type { OutcomePerspective } from './selectors';

/**
 * T36–T38: a visited entry records the actual replayed line, not a stored
 * graph path. `pathId` is the exact observed arrival prefix and is null when
 * the actual prefix has no stored arrival (transposition or novelty).
 */
export interface GraphNavigationEntry {
  positionKey: string;
  fen: string;
  pathId: number | null;
  uci: string | null;
  san: string | null;
  observed: boolean;
}

export interface GraphNavigationState extends GraphNavigationEntry {
  history: readonly GraphNavigationEntry[];
  cursor: number;
}

export interface BoardMoveNavigationResult {
  observed: boolean;
  nextPositionKey: string;
  nextFen: string;
  nextPathId: number | null;
  warning?: string;
}

/** Root entry FEN comes from the first canonical graph-included source game. */
export function createGraphNavigation(graph: OpeningGraphSnapshot): GraphNavigationState {
  if (!graph.rootFen || normalizePositionKey(graph.rootFen) !== graph.root.key) {
    throw new Error('INVALID_GRAPH_ROOT_FEN');
  }
  const root: GraphNavigationEntry = {
    positionKey: graph.root.key,
    fen: graph.rootFen,
    pathId: 0,
    uci: null,
    san: null,
    observed: true,
  };
  return { ...root, history: [root], cursor: 0 };
}

/** Builds a visited entry by applying the actual UCI move from the current full FEN. */
function entryFromEdge(
  graph: OpeningGraphSnapshot,
  state: GraphNavigationState,
  edge: MoveEdge | { targetKey: string; uci: string; san?: string }
): GraphNavigationEntry {
  if (!graph.positions.has(edge.targetKey)) throw new Error('UNKNOWN_GRAPH_POSITION');
  const applied = applyBoardMove(state.fen, {
    from: edge.uci.slice(0, 2) as Square,
    to: edge.uci.slice(2, 4) as Square,
    ...(edge.uci.length > 4 ? { promotion: edge.uci.slice(4) as PromotionPiece } : {}),
  });
  if (!applied) throw new Error('ILLEGAL_GRAPH_MOVE');
  const targetKey = normalizePositionKey(applied.fenAfter);
  if (targetKey !== edge.targetKey) throw new Error('INCONSISTENT_GRAPH_MOVE');
  // T37: no arbitrary target-arrival fallback. Resolve the actual prefix from
  // the previous actual path and UCI only; null continues through synthesized
  // routes while normalized position edges remain playable.
  const pathId =
    state.pathId === null ? null : (graph.paths.lookup(state.pathId, edge.uci) ?? null);
  return {
    positionKey: edge.targetKey,
    fen: applied.fenAfter,
    pathId,
    uci: edge.uci,
    san: applied.san,
    observed: true,
  };
}

/** Selecting a new branch truncates only the future; the visited sequence stays immutable. */
export function appendVisitedEntry(
  state: GraphNavigationState,
  entry: GraphNavigationEntry
): GraphNavigationState {
  const history = [...state.history.slice(0, state.cursor + 1), entry];
  return { ...entry, history, cursor: state.cursor + 1 };
}

export function navigateCandidate(
  graph: OpeningGraphSnapshot,
  state: GraphNavigationState,
  edge: MoveEdge | { targetKey: string; uci: string; san?: string }
): GraphNavigationState {
  return appendVisitedEntry(state, entryFromEdge(graph, state, edge));
}

export function navigateToHistoryIndex(
  state: GraphNavigationState,
  index: number
): GraphNavigationState {
  if (!Number.isInteger(index) || index < 0 || index >= state.history.length) {
    throw new Error('INVALID_GRAPH_HISTORY_INDEX');
  }
  const entry = state.history[index]!;
  // T36: cursor navigation keeps the full history so Back preserves redo.
  return { ...entry, history: state.history, cursor: index };
}

/** Back/Return atomically restores the last observed entry and keeps redo intact. */
export function navigateBack(state: GraphNavigationState): GraphNavigationState {
  return navigateToHistoryIndex(state, Math.max(0, state.cursor - 1));
}

/**
 * Restore the actual line against the current graph, including its redo tail.
 * Arrival IDs belong to a particular graph build and must be resolved afresh.
 * If a formerly observed position disappears, retain only the valid prefix.
 * Exploratory moves are restored by replaying their legal UCI moves.
 */
export function replayGraphNavigation(
  saved: GraphNavigationState,
  graph: OpeningGraphSnapshot
): GraphNavigationState {
  let replayed = createGraphNavigation(graph);
  if (saved.history[0]?.positionKey !== replayed.positionKey) return replayed;

  for (const entry of saved.history.slice(1)) {
    if (!entry.uci) break;
    const edge = graph.positions.get(replayed.positionKey)?.outgoing.get(entry.uci);
    if (edge) {
      try {
        replayed = navigateCandidate(graph, replayed, edge);
      } catch {
        break;
      }
      continue;
    }
    const applied = applyBoardMove(replayed.fen, {
      from: entry.uci.slice(0, 2) as Square,
      to: entry.uci.slice(2, 4) as Square,
      ...(entry.uci.length > 4 ? { promotion: entry.uci.slice(4) as PromotionPiece } : {}),
    });
    if (!applied) break;
    const positionKey = normalizePositionKey(applied.fenAfter);
    if (entry.observed && !graph.positions.has(positionKey)) break;
    replayed = appendVisitedEntry(replayed, {
      positionKey,
      fen: applied.fenAfter,
      pathId: null,
      uci: applied.uci,
      san: applied.san,
      observed: graph.positions.has(positionKey),
    });
  }
  return navigateToHistoryIndex(replayed, Math.min(saved.cursor, replayed.history.length - 1));
}

/** Notation derives from the visited sequence, not from stored graph paths. */
export function navigationBreadcrumbs(
  graph: OpeningGraphSnapshot,
  state: GraphNavigationState
): string[] {
  void graph;
  return state.history
    .slice(0, state.cursor + 1)
    .filter((entry) => entry.san !== null)
    .map((entry) => entry.san!);
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
  currentPathId: number | null,
  move: AppliedBoardMove
): BoardMoveNavigationResult {
  const currentNode = graph.positions.get(currentPositionKey);
  const edge = currentNode?.outgoing.get(move.uci);
  if (edge) {
    const nextPathId =
      currentPathId === null ? null : (graph.paths.lookup(currentPathId, move.uci) ?? null);
    return {
      observed: true,
      nextPositionKey: edge.targetKey,
      nextFen: move.fenAfter,
      nextPathId,
    };
  }

  const nextPositionKey = normalizePositionKey(move.fenAfter);
  const observed = graph.positions.has(nextPositionKey);
  return {
    observed,
    nextPositionKey,
    nextFen: move.fenAfter,
    nextPathId: null,
    ...(!observed ? { warning: 'This position does not appear in your imported games.' } : {}),
  };
}
