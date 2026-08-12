import { describe, expect, it } from 'vitest';
import { describeOutcome } from '@/lib/metrics/descriptive';

describe('describeOutcome', () => {
  it('reports user and board perspective from the same aggregate', () => {
    expect(
      describeOutcome({
        games: 4,
        userWins: 2,
        draws: 1,
        userLosses: 1,
        whiteWins: 1,
        blackWins: 2,
        opponentRatingSum: 3000,
        opponentRatingCount: 2,
      })
    ).toMatchObject({
      sampleSize: 4,
      userScore: 0.625,
      whiteScore: 0.375,
      drawRate: 0.25,
      userWinRate: 0.5,
      userDrawRate: 0.25,
      userLossRate: 0.25,
      whiteWinRate: 0.25,
      blackWinRate: 0.5,
      averageOpponentRating: 1500,
      missingOpponentRatings: 2,
    });
  });
  it('uses null rather than a synthetic zero for empty aggregates', () => {
    expect(
      describeOutcome({
        games: 0,
        userWins: 0,
        draws: 0,
        userLosses: 0,
        whiteWins: 0,
        blackWins: 0,
        opponentRatingSum: 0,
        opponentRatingCount: 0,
      })
    ).toMatchObject({
      userScore: null,
      userWinRate: null,
      userDrawRate: null,
      userLossRate: null,
      whiteWinRate: null,
      blackWinRate: null,
    });
  });
});
