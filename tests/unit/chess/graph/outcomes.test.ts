import { describe, expect, it } from 'vitest';
import {
  addVisit,
  emptyOutcome,
  mergeOutcomes,
  outcomeInvariantHolds,
} from '@/lib/chess/graph/outcomes';

describe('outcome aggregates', () => {
  it('keeps user and board-colour outcomes distinct across wins, draws, and losses', () => {
    const aggregate = emptyOutcome();
    addVisit(aggregate, { result: 'win', userColor: 'white', opponentRating: 1600 });
    addVisit(aggregate, { result: 'draw', userColor: 'black', opponentRating: null });
    addVisit(aggregate, { result: 'loss', userColor: 'black', opponentRating: 1400 });
    expect(aggregate).toMatchObject({
      games: 3,
      userWins: 1,
      draws: 1,
      userLosses: 1,
      whiteWins: 2,
      blackWins: 0,
      opponentRatingSum: 3000,
      opponentRatingCount: 2,
    });
    expect(outcomeInvariantHolds(aggregate)).toBe(true);
  });
  it('rejects malformed aggregate totals', () => {
    expect(outcomeInvariantHolds({ ...emptyOutcome(), games: 1 })).toBe(false);
    expect(
      outcomeInvariantHolds({ ...emptyOutcome(), games: 1, draws: 1, opponentRatingCount: 2 })
    ).toBe(false);
  });

  it('merges aggregates without reinterpreting user wins as white wins', () => {
    const left = {
      ...emptyOutcome(),
      games: 1,
      userWins: 1,
      whiteWins: 0,
      blackWins: 1,
      opponentRatingSum: 1400,
      opponentRatingCount: 1,
    };
    const right = { ...emptyOutcome(), games: 1, draws: 1 };
    expect(mergeOutcomes(left, right)).toEqual({
      ...emptyOutcome(),
      games: 2,
      userWins: 1,
      draws: 1,
      whiteWins: 0,
      blackWins: 1,
      opponentRatingSum: 1400,
      opponentRatingCount: 1,
    });
  });
});
