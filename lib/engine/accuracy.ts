import { isExactScore, type EvaluationScore, type PlayerColor } from '@/lib/engine/evaluation';
import { scoreToMoverWinProbability } from '@/lib/engine/winProbability';

export const ACCURACY_HEURISTIC_VERSION = 'analyzer-accuracy-v1';
export const ACCURACY_ESTIMATE_NAME = 'Analyzer accuracy estimate';

export type MoveQuality =
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'mate-gained'
  | 'mate-retained'
  | 'miss'
  | 'mate-conceded';

export interface ClassifiedMoveAccuracy {
  status: 'classified';
  quality: MoveQuality;
  probabilityLoss: number;
  accuracyEstimate: number;
  heuristicVersion: typeof ACCURACY_HEURISTIC_VERSION;
}

export interface IndeterminateMoveAccuracy {
  status: 'indeterminate';
  reason: 'bound-score' | 'non-finite-score' | 'non-finite-probability';
}

export type MoveAccuracy = ClassifiedMoveAccuracy | IndeterminateMoveAccuracy;

type ScoreComparison = { before: EvaluationScore; after: EvaluationScore; mover: PlayerColor };
type ProbabilityComparison = { beforeProbability: number; afterProbability: number };

/**
 * Project-specific move-quality estimate. Inputs must be exact and generated
 * with equivalent engine settings; callers retain those settings in annotations.
 */
export function classifyMoveAccuracy(input: ScoreComparison | ProbabilityComparison): MoveAccuracy {
  if ('beforeProbability' in input)
    return classifyProbabilities(input.beforeProbability, input.afterProbability);

  if (input.before.bound || input.after.bound)
    return { status: 'indeterminate', reason: 'bound-score' };
  if (!isExactScore(input.before) || !isExactScore(input.after)) {
    return { status: 'indeterminate', reason: 'non-finite-score' };
  }

  const mateTransition = classifyMateTransition(input.before, input.after, input.mover);
  if (mateTransition) return classified(mateTransition, 0);

  const before = scoreToMoverWinProbability(input.before, input.mover);
  const after = scoreToMoverWinProbability(input.after, input.mover);
  if (before === null || after === null)
    return { status: 'indeterminate', reason: 'non-finite-score' };
  return classifyProbabilities(before, after);
}

function classifyMateTransition(
  before: EvaluationScore,
  after: EvaluationScore,
  mover: PlayerColor
): MoveQuality | null {
  const beforeOwnMate = isForcedMateForMover(before, mover);
  const afterOwnMate = isForcedMateForMover(after, mover);
  const afterOpponentMate = isForcedMateForOpponent(after, mover);

  if (afterOpponentMate) return 'mate-conceded';
  if (beforeOwnMate) return afterOwnMate ? 'mate-retained' : 'miss';
  return afterOwnMate ? 'mate-gained' : null;
}

function isForcedMateForMover(score: EvaluationScore, mover: PlayerColor): boolean {
  return score.kind === 'mate' && (mover === 'white' ? score.value > 0 : score.value < 0);
}

function isForcedMateForOpponent(score: EvaluationScore, mover: PlayerColor): boolean {
  return score.kind === 'mate' && (mover === 'white' ? score.value < 0 : score.value > 0);
}

function classifyProbabilities(before: number, after: number): MoveAccuracy {
  if (!isProbability(before) || !isProbability(after)) {
    return { status: 'indeterminate', reason: 'non-finite-probability' };
  }
  const loss = Math.max(0, before - after);
  if (loss <= 0.02 + Number.EPSILON) return classified(loss === 0 ? 'best' : 'excellent', loss);
  if (loss <= 0.05 + Number.EPSILON) return classified('good', loss);
  if (loss <= 0.1 + Number.EPSILON) return classified('inaccuracy', loss);
  if (loss <= 0.2 + Number.EPSILON) return classified('mistake', loss);
  return classified('blunder', loss);
}

function classified(quality: MoveQuality, probabilityLoss: number): ClassifiedMoveAccuracy {
  return {
    status: 'classified',
    quality,
    probabilityLoss,
    accuracyEstimate: Math.max(0, 100 * (1 - probabilityLoss)),
    heuristicVersion: ACCURACY_HEURISTIC_VERSION,
  };
}

function isProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
