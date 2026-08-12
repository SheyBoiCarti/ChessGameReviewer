import { describeOutcome, type DescriptiveMetrics } from '../../lib/metrics/descriptive';
import type { PositionNode } from '../../lib/chess/graph/types';
import { PathStore } from '../../lib/chess/graph/pathStore';
import type { ParsedGame } from '../../lib/chess/pgnParser';

export type MoveSort = 'games' | 'score' | 'san';
export interface CandidateMove {
  uci: string;
  san: string;
  targetKey: string;
  metrics: DescriptiveMetrics;
}

export interface RatingTier {
  id: string;
  label: string;
  minInclusive?: number;
  maxInclusive?: number;
}

export interface GraphRecordFilter {
  userColors?: readonly ('white' | 'black')[];
  ratingTierIds?: readonly string[];
  ratingTiers?: readonly RatingTier[];
}

/**
 * Filters are deliberately applied to source records before graph construction.
 * Aggregate-only nodes cannot be retrospectively filtered without falsifying counts.
 */
export function filterGamesForGraph(
  games: readonly ParsedGame[],
  filter: GraphRecordFilter
): ParsedGame[] {
  const allowedColors = filter.userColors ? new Set(filter.userColors) : undefined;
  const allowedTierIds = filter.ratingTierIds ? new Set(filter.ratingTierIds) : undefined;
  const tiers = filter.ratingTiers ?? [];
  return games.filter((game) => {
    if (allowedColors && !allowedColors.has(game.userColor)) return false;
    if (!allowedTierIds) return true;
    const tierId = ratingTierFor(game.opponentRating, tiers);
    return tierId !== undefined && allowedTierIds.has(tierId);
  });
}

export function ratingTierFor(
  opponentRating: number | null,
  tiers: readonly RatingTier[]
): string | 'unknown' | undefined {
  if (opponentRating === null) return 'unknown';
  return tiers.find(
    (tier) =>
      (tier.minInclusive === undefined || opponentRating >= tier.minInclusive) &&
      (tier.maxInclusive === undefined || opponentRating <= tier.maxInclusive)
  )?.id;
}

export function selectCandidateMoves(
  node: PositionNode,
  sort: MoveSort = 'games'
): CandidateMove[] {
  return [...node.outgoing.values()]
    .map((edge) => ({
      uci: edge.uci,
      san: edge.san,
      targetKey: edge.targetKey,
      metrics: describeOutcome(edge.aggregate),
    }))
    .sort((left, right) =>
      sort === 'games'
        ? right.metrics.sampleSize - left.metrics.sampleSize || left.san.localeCompare(right.san)
        : sort === 'score'
          ? (right.metrics.userScore ?? -Infinity) - (left.metrics.userScore ?? -Infinity) ||
            left.san.localeCompare(right.san)
          : left.san.localeCompare(right.san)
    );
}

export function selectArrivalOrders(
  node: PositionNode,
  paths: PathStore
): Array<{ moves: ReturnType<PathStore['sequence']>; metrics: DescriptiveMetrics }> {
  return [...node.arrivalsByPath.entries()]
    .map(([id, aggregate]) => ({ moves: paths.sequence(id), metrics: describeOutcome(aggregate) }))
    .sort(
      (left, right) =>
        right.metrics.sampleSize - left.metrics.sampleSize ||
        left.moves
          .map((move) => move.uci)
          .join(' ')
          .localeCompare(right.moves.map((move) => move.uci).join(' '))
    );
}
