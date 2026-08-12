import { describeOutcome, type DescriptiveMetrics } from '../../lib/metrics/descriptive';
import type { PositionNode } from '../../lib/chess/graph/types';
import { PathStore } from '../../lib/chess/graph/pathStore';

export type MoveSort = 'games' | 'score' | 'san';
export interface CandidateMove {
  uci: string;
  san: string;
  targetKey: string;
  metrics: DescriptiveMetrics;
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
