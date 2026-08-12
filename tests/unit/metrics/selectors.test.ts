import { describe, expect, it } from 'vitest';
import { selectCandidateMoves } from '@/features/opening-tree/selectors';
import type { PositionNode } from '@/lib/chess/graph/types';

const aggregate = { games: 2, userWins: 1, draws: 0, userLosses: 1, whiteWins: 1, blackWins: 1, opponentRatingSum: 3000, opponentRatingCount: 2 };
const node: PositionNode = { key: 'root', aggregate, arrivalsByPath: new Map(), outgoing: new Map([
  ['e2e4', { uci: 'e2e4', san: 'e4', targetKey: 'e4', aggregate }],
  ['d2d4', { uci: 'd2d4', san: 'd4', targetKey: 'd4', aggregate: { ...aggregate, games: 4, userWins: 3, userLosses: 1 } }],
]) };

describe('opening-tree selectors', () => {
  it('sorts candidate moves deterministically by games, score, or SAN', () => {
    expect(selectCandidateMoves(node, 'games').map(move => move.san)).toEqual(['d4', 'e4']);
    expect(selectCandidateMoves(node, 'score').map(move => move.san)).toEqual(['d4', 'e4']);
    expect(selectCandidateMoves(node, 'san').map(move => move.san)).toEqual(['d4', 'e4']);
  });
});
