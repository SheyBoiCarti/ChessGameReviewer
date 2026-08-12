import { PathStore } from '@/lib/chess/graph/pathStore';
import type { OpeningGraphSnapshot } from '@/lib/chess/graph/openingGraph';
import type { MoveEdge, OutcomeAggregate, PositionNode } from '@/lib/chess/graph/types';

export function openingGraphFixture(
  status: 'complete' | 'limited' = 'complete'
): OpeningGraphSnapshot {
  const paths = PathStore.fromNodes([
    { id: 0, parentId: null, uci: null, san: null, ply: 0 },
    { id: 1, parentId: 0, uci: 'e2e4', san: 'e4', ply: 1 },
    { id: 2, parentId: 1, uci: 'e7e5', san: 'e5', ply: 2 },
    { id: 3, parentId: 2, uci: 'g1f3', san: 'Nf3', ply: 3 },
    { id: 4, parentId: 0, uci: 'd2d4', san: 'd4', ply: 1 },
    { id: 5, parentId: 4, uci: 'd7d5', san: 'd5', ply: 2 },
    { id: 6, parentId: 5, uci: 'g1f3', san: 'Nf3', ply: 3 },
  ]);
  const root = position(
    '8/8/8/8/8/8/8/K6k w - -',
    [move('e2e4', 'e4', 'after-e4'), move('d2d4', 'd4', 'after-d4')],
    [[0, aggregate(5, 2, 2, 1)]]
  );
  const positions = new Map<string, PositionNode>([
    [root.key, root],
    ['after-e4', position('after-e4', [move('e7e5', 'e5', 'after-e5')])],
    ['after-e5', position('after-e5', [move('g1f3', 'Nf3', 'transposed-target')])],
    ['after-d4', position('after-d4', [move('d7d5', 'd5', 'after-d5')])],
    ['after-d5', position('after-d5', [move('g1f3', 'Nf3', 'transposed-target')])],
    [
      'transposed-target',
      position(
        'transposed-target',
        [],
        [
          [3, aggregate(3, 2, 0, 1)],
          [6, aggregate(2, 0, 1, 1)],
        ]
      ),
    ],
  ]);
  return {
    status,
    root,
    positions,
    paths,
    openingHorizon: 30,
    includedGameCount: 5,
    remainingGameCount: status === 'limited' ? 2 : 0,
    ...(status === 'limited' ? { reachedLimit: 'maxEdges' as const } : {}),
  };
}

function position(
  key: string,
  moves: MoveEdge[],
  arrivals: Array<[number, OutcomeAggregate]> = []
): PositionNode {
  return {
    key,
    aggregate: aggregate(5, 2, 2, 1),
    outgoing: new Map(moves.map((value) => [value.uci, value])),
    arrivalsByPath: new Map(arrivals),
  };
}

function move(uci: string, san: string, targetKey: string): MoveEdge {
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
