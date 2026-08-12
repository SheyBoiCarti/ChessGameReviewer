import type { GameVisit, OutcomeAggregate } from './types';

export function emptyOutcome(): OutcomeAggregate {
  return {
    games: 0,
    userWins: 0,
    draws: 0,
    userLosses: 0,
    whiteWins: 0,
    blackWins: 0,
    opponentRatingSum: 0,
    opponentRatingCount: 0,
  };
}

export function addVisit(aggregate: OutcomeAggregate, visit: GameVisit): void {
  aggregate.games += 1;
  if (visit.result === 'win') aggregate.userWins += 1;
  else if (visit.result === 'draw') aggregate.draws += 1;
  else aggregate.userLosses += 1;

  const whiteWon =
    (visit.userColor === 'white' && visit.result === 'win') ||
    (visit.userColor === 'black' && visit.result === 'loss');
  if (whiteWon) aggregate.whiteWins += 1;
  else if (visit.result !== 'draw') aggregate.blackWins += 1;

  if (visit.opponentRating !== null) {
    aggregate.opponentRatingSum += visit.opponentRating;
    aggregate.opponentRatingCount += 1;
  }
}

export function mergeOutcomes(left: OutcomeAggregate, right: OutcomeAggregate): OutcomeAggregate {
  return {
    games: left.games + right.games,
    userWins: left.userWins + right.userWins,
    draws: left.draws + right.draws,
    userLosses: left.userLosses + right.userLosses,
    whiteWins: left.whiteWins + right.whiteWins,
    blackWins: left.blackWins + right.blackWins,
    opponentRatingSum: left.opponentRatingSum + right.opponentRatingSum,
    opponentRatingCount: left.opponentRatingCount + right.opponentRatingCount,
  };
}

export function outcomeInvariantHolds(aggregate: OutcomeAggregate): boolean {
  return (
    aggregate.games === aggregate.userWins + aggregate.draws + aggregate.userLosses &&
    aggregate.games === aggregate.whiteWins + aggregate.draws + aggregate.blackWins &&
    aggregate.opponentRatingCount >= 0 &&
    aggregate.opponentRatingCount <= aggregate.games
  );
}
