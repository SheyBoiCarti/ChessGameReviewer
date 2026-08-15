import { describe, expect, it } from 'vitest';

import {
  createGraphNavigation,
  navigateBack,
  navigateCandidate,
  navigateToHistoryIndex,
  navigationBreadcrumbs,
  perspectiveLabels,
  resolveBoardMoveInGraph,
} from '@/features/opening-tree/navigation';
import { PathStore } from '@/lib/chess/graph/pathStore';
import type { OpeningGraphSnapshot } from '@/lib/chess/graph/openingGraph';
import type { OutcomeAggregate, PositionNode } from '@/lib/chess/graph/types';
import type { AppliedBoardMove } from '@/features/board/moves';

describe('opening graph navigation', () => {
  it('preserves the selected move order while two paths reach one position', () => {
    const graph = transpositionGraph();
    let state = createGraphNavigation(graph);
    state = navigateCandidate(graph, state, edge(graph.root, 'e2e4'));
    state = navigateCandidate(graph, state, edge(node(graph, 'after-e4'), 'e7e5'));
    state = navigateCandidate(graph, state, edge(node(graph, 'after-e5'), 'g1f3'));

    expect(state.positionKey).toBe('transposed-target');
    expect(navigationBreadcrumbs(graph, state)).toEqual(['e4', 'e5', 'Nf3']);

    const root = navigateToHistoryIndex(state, 0);
    expect(root).toMatchObject({ positionKey: 'root', pathId: 0 });
  });

  it('labels user and board outcome perspectives independently', () => {
    expect(perspectiveLabels('user')).toEqual(['User win', 'Draw', 'User loss']);
    expect(perspectiveLabels('board')).toEqual(['White win', 'Draw', 'Black win']);
  });

  it('rejects unknown positions, paths, and invalid history indexes', () => {
    const graph = transpositionGraph();
    const state = createGraphNavigation(graph);
    expect(() => navigateCandidate(graph, state, move('a2a3', 'a3', 'missing-position'))).toThrow(
      'UNKNOWN_GRAPH_POSITION'
    );
    expect(() => navigateCandidate(graph, state, move('a2a3', 'a3', 'after-e4'))).toThrow(
      'UNKNOWN_GRAPH_PATH'
    );
    expect(() => navigateToHistoryIndex(state, -1)).toThrow('INVALID_GRAPH_HISTORY_INDEX');
    expect(() => navigateToHistoryIndex(state, 0.5)).toThrow('INVALID_GRAPH_HISTORY_INDEX');
    expect(() => navigateToHistoryIndex(state, 1)).toThrow('INVALID_GRAPH_HISTORY_INDEX');
    expect(navigateBack(state)).toEqual(state);
  });

  it('resolves an observed board move in the graph', () => {
    const graph = transpositionGraph();
    const appliedMove: AppliedBoardMove = {
      from: 'e2',
      to: 'e4',
      uci: 'e2e4',
      san: 'e4',
      fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    };

    const result = resolveBoardMoveInGraph(graph, 'root', 0, appliedMove);
    expect(result).toEqual({
      observed: true,
      nextPositionKey: 'after-e4',
      nextPathId: 1,
    });
  });

  it('returns unobserved result with warning when a legal board move is not in the graph', () => {
    const graph = transpositionGraph();
    const unobservedMove: AppliedBoardMove = {
      from: 'c2',
      to: 'c4',
      uci: 'c2c4',
      san: 'c4',
      fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fenAfter: 'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq - 0 1',
    };

    const result = resolveBoardMoveInGraph(graph, 'root', 0, unobservedMove);
    expect(result.observed).toBe(false);
    expect(result.nextPositionKey).toBe(unobservedMove.fenAfter);
    expect(result.nextPathId).toBeNull();
    expect(result.warning).toMatch(/not appear in your imported games/i);
  });
});

function transpositionGraph(): OpeningGraphSnapshot {
  const paths = PathStore.fromNodes([
    { id: 0, parentId: null, uci: null, san: null, ply: 0 },
    { id: 1, parentId: 0, uci: 'e2e4', san: 'e4', ply: 1 },
    { id: 2, parentId: 1, uci: 'e7e5', san: 'e5', ply: 2 },
    { id: 3, parentId: 2, uci: 'g1f3', san: 'Nf3', ply: 3 },
    { id: 4, parentId: 0, uci: 'd2d4', san: 'd4', ply: 1 },
    { id: 5, parentId: 4, uci: 'd7d5', san: 'd5', ply: 2 },
    { id: 6, parentId: 5, uci: 'g1f3', san: 'Nf3', ply: 3 },
  ]);
  const root = position('root', [move('e2e4', 'e4', 'after-e4'), move('d2d4', 'd4', 'after-d4')]);
  const positions = new Map<string, PositionNode>([
    ['root', root],
    ['after-e4', position('after-e4', [move('e7e5', 'e5', 'after-e5')])],
    ['after-e5', position('after-e5', [move('g1f3', 'Nf3', 'transposed-target')])],
    ['after-d4', position('after-d4', [move('d7d5', 'd5', 'after-d5')])],
    ['after-d5', position('after-d5', [move('g1f3', 'Nf3', 'transposed-target')])],
    [
      'transposed-target',
      {
        ...position('transposed-target', []),
        arrivalsByPath: new Map([
          [3, aggregate(3, 2, 0, 1)],
          [6, aggregate(2, 0, 1, 1)],
        ]),
      },
    ],
  ]);
  return {
    status: 'complete',
    root,
    positions,
    paths,
    openingHorizon: 30,
    includedGameCount: 5,
    remainingGameCount: 0,
  };
}

function position(key: string, moves: ReturnType<typeof move>[]): PositionNode {
  return {
    key,
    aggregate: aggregate(5, 2, 2, 1),
    outgoing: new Map(moves.map((value) => [value.uci, value])),
    arrivalsByPath: new Map(),
  };
}

function move(uci: string, san: string, targetKey: string) {
  return { uci, san, targetKey, aggregate: aggregate(5, 2, 2, 1) };
}

function aggregate(
  games: number,
  userWins: number,
  draws: number,
  userLosses: number
): OutcomeAggregate {
  return {
    games,
    userWins,
    draws,
    userLosses,
    whiteWins: userWins,
    blackWins: userLosses,
    opponentRatingSum: games * 1800,
    opponentRatingCount: games,
  };
}

function node(graph: OpeningGraphSnapshot, key: string): PositionNode {
  return graph.positions.get(key)!;
}

function edge(positionNode: PositionNode, uci: string) {
  return positionNode.outgoing.get(uci)!;
}
