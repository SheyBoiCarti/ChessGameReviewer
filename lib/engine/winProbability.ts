import { Chess } from 'chess.js';

import {
  isExactScore,
  parseFenSideToMove,
  toMoverPerspective,
  type EvaluationScore,
  type PlayerColor,
} from '@/lib/engine/evaluation';

export interface RatingContext {
  moverRating?: number | null;
  opponentRating?: number | null;
}

/** A transparent project estimate: 400cp maps to a 10:1 win-probability odds ratio. */
export function scoreToWhiteWinProbability(score: EvaluationScore): number | null {
  if (!isExactScore(score)) return null;
  if (score.kind === 'mate') {
    if (score.value > 0) return 1;
    if (score.value < 0) return 0;
    return null;
  }
  return logistic((Math.LN10 * score.value) / 400);
}

export function scoreToMoverWinProbability(
  score: EvaluationScore,
  mover: PlayerColor
): number | null {
  const moverScore = toMoverPerspective(score, mover);
  return moverScore ? scoreToWhiteWinProbability(moverScore) : null;
}

/**
 * Maps an engine score to mover expected points in [0, 1].
 * Accepts rating context; falls back to the transparent neutral model when no calibrated model is configured.
 */
export function scoreToMoverExpectedPoints(
  score: EvaluationScore,
  mover: PlayerColor,
  _ratingContext?: RatingContext
): number | null {
  return scoreToMoverWinProbability(score, mover);
}

/**
 * Nonlinear loss-to-accuracy transformation:
 * accuracy = 100 * (exp(-5 * loss) - exp(-5)) / (1 - exp(-5))
 * Clamped to [0, 100].
 */
export function lossToAccuracyEstimate(loss: number): number {
  if (Number.isNaN(loss) || loss <= 0) return 100;
  if (loss >= 1) return 0;
  const k = 5;
  const expMinusK = Math.exp(-k);
  const raw = (100 * (Math.exp(-k * loss) - expMinusK)) / (1 - expMinusK);
  return Math.max(0, Math.min(100, raw));
}

/**
 * Returns a terminal position's win probability for `mover`; null means that
 * engine output is needed because the position is still playable.
 */
export function terminalMoverWinProbability(fen: string, mover: PlayerColor): number | null {
  const activeColor = parseFenSideToMove(fen);
  const position = new Chess(fen);
  if (position.isCheckmate()) {
    const winner: PlayerColor = activeColor === 'white' ? 'black' : 'white';
    return winner === mover ? 1 : 0;
  }
  if (position.isDraw()) {
    return 0.5;
  }
  return null;
}

function logistic(value: number): number {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}
