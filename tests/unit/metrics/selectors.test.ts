import { describe, expect, it } from 'vitest';
import {
  filterGamesForGraph,
  ratingTierFor,
  selectArrivalOrders,
  selectCandidateMoves,
} from '@/features/opening-tree/selectors';
import { PathStore } from '@/lib/chess/graph/pathStore';
import type { PositionNode } from '@/lib/chess/graph/types';
import type { ParsedGame } from '@/lib/chess/pgnParser';

const aggregate = {
  games: 2,
  userWins: 1,
  draws: 0,
  userLosses: 1,
  whiteWins: 1,
  blackWins: 1,
  opponentRatingSum: 3000,
  opponentRatingCount: 2,
};
const node: PositionNode = {
  key: 'root',
  aggregate,
  arrivalsByPath: new Map(),
  outgoing: new Map([
    ['e2e4', { uci: 'e2e4', san: 'e4', targetKey: 'e4', aggregate }],
    [
      'd2d4',
      {
        uci: 'd2d4',
        san: 'd4',
        targetKey: 'd4',
        aggregate: { ...aggregate, games: 4, userWins: 3, userLosses: 1 },
      },
    ],
  ]),
};

describe('opening-tree selectors', () => {
  it('sorts candidate moves deterministically by games, score, or SAN', () => {
    expect(selectCandidateMoves(node, 'games').map((move) => move.san)).toEqual(['d4', 'e4']);
    expect(selectCandidateMoves(node, 'score').map((move) => move.san)).toEqual(['d4', 'e4']);
    expect(selectCandidateMoves(node, 'san').map((move) => move.san)).toEqual(['d4', 'e4']);
  });

  it('filters source games by player colour and configurable opponent-rating tiers', () => {
    const games = [
      { id: 'white-low', userColor: 'white', opponentRating: 1200 },
      { id: 'black-high', userColor: 'black', opponentRating: 1800 },
      { id: 'white-unknown', userColor: 'white', opponentRating: null },
    ] as ParsedGame[];
    const tiers = [
      { id: 'low', label: 'Under 1400', maxInclusive: 1399 },
      { id: 'high', label: '1400+', minInclusive: 1400 },
    ];

    expect(
      filterGamesForGraph(games, {
        userColors: ['white'],
        ratingTierIds: ['low'],
        ratingTiers: tiers,
      }).map((game) => game.id)
    ).toEqual(['white-low']);
    expect(
      filterGamesForGraph(games, {
        userColors: ['white'],
        ratingTierIds: ['unknown'],
        ratingTiers: tiers,
      }).map((game) => game.id)
    ).toEqual(['white-unknown']);
    expect(filterGamesForGraph(games, {}).map((game) => game.id)).toEqual([
      'white-low',
      'black-high',
      'white-unknown',
    ]);
    expect(filterGamesForGraph(games, { ratingTierIds: ['missing'], ratingTiers: tiers })).toEqual(
      []
    );
    expect(ratingTierFor(1500, [{ id: 'low', label: 'Low', maxInclusive: 1400 }])).toBeUndefined();
  });

  it('reconstructs arrival orders with deterministic frequency ordering', () => {
    const paths = new PathStore();
    const e4 = paths.intern(0, 'e2e4', 'e4');
    const e5 = paths.intern(e4, 'e7e5', 'e5');
    const arrivals = new Map([
      [e5, { ...aggregate }],
      [e4, { ...aggregate, games: 3, userWins: 2, userLosses: 1 }],
    ]);
    expect(
      selectArrivalOrders({ ...node, arrivalsByPath: arrivals }, paths)[0]?.moves.map(
        (move) => move.san
      )
    ).toEqual(['e4']);
  });
});
