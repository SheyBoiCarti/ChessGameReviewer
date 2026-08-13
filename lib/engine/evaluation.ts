import { validateFen } from 'chess.js';

import { FenValidationError } from '@/lib/chess/fen';
import type { UciScore } from '@/lib/engine/uci/types';

export type PlayerColor = 'white' | 'black';
export type EvaluationScore = UciScore;

/** Reads the active colour only from a syntactically valid six-field FEN. */
export function parseFenSideToMove(fen: string): PlayerColor {
  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) {
    throw new FenValidationError('expected exactly six FEN fields');
  }

  const validation = validateFen(fen);
  if (!validation.ok) {
    throw new FenValidationError(validation.error ?? 'invalid FEN');
  }

  return fields[1] === 'w' ? 'white' : 'black';
}

/**
 * Stockfish UCI scores are expressed for the side to move. This converts them
 * once into the canonical White perspective without collapsing mate or bounds.
 */
export function normalizeUciScoreToWhite(
  score: EvaluationScore,
  fen: string
): EvaluationScore | null {
  if (!isFiniteScore(score)) return null;
  const sign = parseFenSideToMove(fen) === 'white' ? 1 : -1;
  const value = score.value * sign;
  return score.bound
    ? { kind: score.kind, value, bound: score.bound }
    : { kind: score.kind, value };
}

/** Converts a canonical White score to the perspective of the player who moved. */
export function toMoverPerspective(
  score: EvaluationScore,
  mover: PlayerColor
): EvaluationScore | null {
  if (!isFiniteScore(score)) return null;
  const value = mover === 'white' ? score.value : -score.value;
  return score.bound
    ? { kind: score.kind, value, bound: score.bound }
    : { kind: score.kind, value };
}

/**
 * Returns an exact centipawn loss after perspective conversion. Mate and bound
 * scores deliberately remain outside this numerical comparison.
 */
export function calculateCentipawnLoss(
  beforeWhite: EvaluationScore,
  afterWhite: EvaluationScore,
  mover: PlayerColor
): number | null {
  const before = toMoverPerspective(beforeWhite, mover);
  const after = toMoverPerspective(afterWhite, mover);
  if (
    !before ||
    !after ||
    before.bound ||
    after.bound ||
    before.kind !== 'cp' ||
    after.kind !== 'cp'
  ) {
    return null;
  }
  return Math.max(0, before.value - after.value);
}

export function isFiniteScore(score: EvaluationScore): boolean {
  return (score.kind === 'cp' || score.kind === 'mate') && Number.isFinite(score.value);
}

export function isExactScore(score: EvaluationScore): boolean {
  return isFiniteScore(score) && score.bound === undefined;
}
