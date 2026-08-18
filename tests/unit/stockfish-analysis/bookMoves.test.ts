import { describe, expect, it } from 'vitest';

import { bookMoveKey, collectPersonalBookMoveKeys } from '@/features/stockfish-analysis/bookMoves';
import type { SerializedOpeningGraph } from '@/lib/chess/graph/serialization';

describe('bookMoves', () => {
  const emptyAggregate = {
    games: 0,
    userWins: 0,
    userLosses: 0,
    draws: 0,
    whiteWins: 0,
    blackWins: 0,
    opponentRatingSum: 0,
    opponentRatingCount: 0,
  };

  const snapshot: SerializedOpeningGraph = {
    formatVersion: 1,
    queryFingerprint: 'fp1',
    sourceGameCount: 5,
    excludedGameCount: 0,
    openingHorizon: 30,
    buildTimestamp: 1000,
    status: 'complete',
    rootKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
    includedGameCount: 5,
    remainingGameCount: 0,
    positions: [
      {
        key: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
        aggregate: { ...emptyAggregate, games: 5 },
        edges: [
          {
            uci: 'e2e4',
            san: 'e4',
            targetKey: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
            aggregate: { ...emptyAggregate, games: 3 },
          },
          {
            uci: 'd2d4',
            san: 'd4',
            targetKey: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq -',
            aggregate: { ...emptyAggregate, games: 1 },
          },
        ],
        arrivalsByPath: [],
      },
      {
        key: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
        aggregate: { ...emptyAggregate, games: 3 },
        edges: [
          {
            uci: 'c7c5',
            san: 'c5',
            targetKey: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
            aggregate: { ...emptyAggregate, games: 2 },
          },
        ],
        arrivalsByPath: [],
      },
    ],
    paths: [],
  };

  it('generates consistent book move keys', () => {
    expect(bookMoveKey('pos1', 'e2e4')).toBe('pos1\u0000e2e4');
  });

  it('collects qualifying edges with minimumGames threshold and sorts them deterministically', () => {
    const keys = collectPersonalBookMoveKeys(snapshot);
    expect(keys).toEqual([
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -\u0000c7c5',
      `${snapshot.rootKey}\u0000e2e4`,
    ]);
  });

  it('returns empty array for null snapshot', () => {
    expect(collectPersonalBookMoveKeys(null)).toEqual([]);
  });

  it('respects a custom minimumGames parameter', () => {
    expect(collectPersonalBookMoveKeys(snapshot, 3)).toEqual([`${snapshot.rootKey}\u0000e2e4`]);
    expect(collectPersonalBookMoveKeys(snapshot, 4)).toEqual([]);
  });
});
