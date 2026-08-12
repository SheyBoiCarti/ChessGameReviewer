import type { OutcomeAggregate } from '../chess/graph/types';

export interface DescriptiveMetrics {
  sampleSize: number;
  userScore: number | null;
  whiteScore: number | null;
  drawRate: number | null;
  userWinRate: number | null;
  userDrawRate: number | null;
  userLossRate: number | null;
  whiteWinRate: number | null;
  blackWinRate: number | null;
  averageOpponentRating: number | null;
  missingOpponentRatings: number;
}

export function describeOutcome(aggregate: OutcomeAggregate): DescriptiveMetrics {
  if (aggregate.games === 0)
    return {
      sampleSize: 0,
      userScore: null,
      whiteScore: null,
      drawRate: null,
      userWinRate: null,
      userDrawRate: null,
      userLossRate: null,
      whiteWinRate: null,
      blackWinRate: null,
      averageOpponentRating: null,
      missingOpponentRatings: 0,
    };
  return {
    sampleSize: aggregate.games,
    userScore: (aggregate.userWins + aggregate.draws * 0.5) / aggregate.games,
    whiteScore: (aggregate.whiteWins + aggregate.draws * 0.5) / aggregate.games,
    drawRate: aggregate.draws / aggregate.games,
    userWinRate: aggregate.userWins / aggregate.games,
    userDrawRate: aggregate.draws / aggregate.games,
    userLossRate: aggregate.userLosses / aggregate.games,
    whiteWinRate: aggregate.whiteWins / aggregate.games,
    blackWinRate: aggregate.blackWins / aggregate.games,
    averageOpponentRating:
      aggregate.opponentRatingCount === 0
        ? null
        : aggregate.opponentRatingSum / aggregate.opponentRatingCount,
    missingOpponentRatings: aggregate.games - aggregate.opponentRatingCount,
  };
}
