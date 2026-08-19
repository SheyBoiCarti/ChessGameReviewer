import { Chess, type Square } from 'chess.js';

import { isExactScore, type EvaluationScore, type PlayerColor } from '@/lib/engine/evaluation';
import {
  lossToAccuracyEstimate,
  scoreToMoverExpectedPoints,
  scoreToMoverWinProbability,
  type RatingContext,
} from '@/lib/engine/winProbability';

export { lossToAccuracyEstimate };

export const ACCURACY_HEURISTIC_VERSION = 'analyzer-accuracy-v2';
export const ACCURACY_ESTIMATE_NAME = 'Analyzer accuracy estimate';

export const REVIEW_MOVE_QUALITIES = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'blunder',
  'miss',
  'forced',
] as const;

export type MoveQuality = (typeof REVIEW_MOVE_QUALITIES)[number];
export type MoveBreakdown = Record<MoveQuality, number>;
export type MateTransition = 'gained' | 'retained' | 'conceded' | 'missed';

export interface MoveContext {
  beforeScore: EvaluationScore;
  afterScore: EvaluationScore;
  mover: PlayerColor;
  fenBefore: string;
  uci: string;
  bestMoveUci?: string;
  secondBestScore?: EvaluationScore;
  isBook: boolean;
  pv?: readonly string[];
  ratingContext?: RatingContext;
  moverRating?: number | null;
  opponentRating?: number | null;
}

export interface ClassifiedMoveAccuracy {
  status: 'classified';
  quality: MoveQuality;
  mateTransition?: MateTransition;
  probabilityLoss: number;
  accuracyEstimate: number;
  heuristicVersion: typeof ACCURACY_HEURISTIC_VERSION;
}

export interface IndeterminateMoveAccuracy {
  status: 'indeterminate';
  reason: 'bound-score' | 'non-finite-score' | 'non-finite-probability';
}

export type MoveAccuracy = ClassifiedMoveAccuracy | IndeterminateMoveAccuracy;

export type ScoreComparison = {
  before: EvaluationScore;
  after: EvaluationScore;
  mover: PlayerColor;
};
export type ProbabilityComparison = { beforeProbability: number; afterProbability: number };

const PIECE_VALUES: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

function countMaterial(
  chess: Chess,
  color: 'w' | 'b',
  pieceValues: Record<string, number>
): number {
  let total = 0;
  const board = chess.board();
  for (const row of board) {
    for (const sq of row) {
      if (sq && sq.color === color) {
        total += pieceValues[sq.type] ?? 0;
      }
    }
  }
  return total;
}

/**
 * Detects whether a move executes a sound non-pawn material sacrifice visible in the engine PV.
 */
export function detectSoundPieceSacrifice(
  fenBefore: string,
  uci: string,
  pv?: readonly string[]
): boolean {
  if (!pv || pv.length === 0) return false;

  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!match) return false;
  const [, from, to, promotion] = match;
  if (promotion) return false;

  try {
    const chess = new Chess(fenBefore);
    const moverColor = chess.turn();
    const piece = chess.get(from as Square);
    if (!piece) return false;
    // Only non-pawn, non-king piece sacrifices
    if (piece.type === 'p' || piece.type === 'k') return false;

    const opponentColor = moverColor === 'w' ? 'b' : 'w';
    const moverMaterialBefore = countMaterial(chess, moverColor, PIECE_VALUES);
    const opponentMaterialBefore = countMaterial(chess, opponentColor, PIECE_VALUES);

    const moveResult = chess.move({
      from: from as Square,
      to: to as Square,
    });
    if (!moveResult) return false;
    if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) return false;

    // Identify opponent's PV reply
    const replyUci = pv[0] === uci ? pv[1] : pv[0];
    if (!replyUci) return false;

    const replyMatch = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(replyUci);
    if (!replyMatch) return false;
    const [, replyFrom, replyTo, replyPromotion] = replyMatch;

    const replyResult = chess.move({
      from: replyFrom as Square,
      to: replyTo as Square,
      ...(replyPromotion ? { promotion: replyPromotion } : {}),
    });
    if (!replyResult) return false;

    const moverMaterialAfter = countMaterial(chess, moverColor, PIECE_VALUES);
    const opponentMaterialAfter = countMaterial(chess, opponentColor, PIECE_VALUES);

    const moverNetChange =
      moverMaterialAfter -
      moverMaterialBefore -
      (opponentMaterialAfter - opponentMaterialBefore);

    // Mover must have given up net non-pawn material (net loss of at least 1 point in exchange)
    return moverNetChange <= -1;
  } catch {
    return false;
  }
}

/** Legacy helper retained for backwards compatibility. */
export function detectOfferedPieceSacrifice(fenBefore: string, uci: string): boolean {
  return detectSoundPieceSacrifice(fenBefore, uci, [uci]);
}

function isOnlyLegalMove(fen: string, uci: string): boolean {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    if (moves.length !== 1 || !moves[0]) return false;
    const move = moves[0];
    const moveUci = `${move.from}${move.to}${move.promotion ?? ''}`;
    return moveUci === uci;
  } catch {
    return false;
  }
}

/**
 * Project-specific move-quality estimate. Inputs must be exact and generated
 * with equivalent engine settings; callers retain those settings in annotations.
 */
export function classifyMoveAccuracy(
  input: MoveContext | ScoreComparison | ProbabilityComparison
): MoveAccuracy {
  if ('beforeProbability' in input) {
    return classifyProbabilities(input.beforeProbability, input.afterProbability);
  }

  const beforeScore = 'beforeScore' in input ? input.beforeScore : input.before;
  const afterScore = 'afterScore' in input ? input.afterScore : input.after;
  const mover = input.mover;
  const fenBefore = 'fenBefore' in input ? input.fenBefore : undefined;
  const uci = 'uci' in input ? input.uci : undefined;
  const bestMoveUci = 'bestMoveUci' in input ? input.bestMoveUci : undefined;
  const secondBestScore = 'secondBestScore' in input ? input.secondBestScore : undefined;
  const isBook = 'isBook' in input ? input.isBook : false;
  const pv = 'pv' in input ? input.pv : undefined;
  const ratingContext: RatingContext | undefined =
    'ratingContext' in input && input.ratingContext
      ? input.ratingContext
      : 'moverRating' in input
        ? {
            moverRating: input.moverRating,
            opponentRating: input.opponentRating,
          }
        : undefined;

  if (beforeScore.bound || afterScore.bound) {
    return { status: 'indeterminate', reason: 'bound-score' };
  }
  if (!isExactScore(beforeScore) || !isExactScore(afterScore)) {
    return { status: 'indeterminate', reason: 'non-finite-score' };
  }

  const mateTransition = classifyMateTransition(beforeScore, afterScore, mover);

  const beforeProb = scoreToMoverExpectedPoints(beforeScore, mover, ratingContext);
  const afterProb = scoreToMoverExpectedPoints(afterScore, mover, ratingContext);
  if (
    beforeProb === null ||
    afterProb === null ||
    !isProbability(beforeProb) ||
    !isProbability(afterProb)
  ) {
    return { status: 'indeterminate', reason: 'non-finite-score' };
  }

  const loss = Math.max(0, beforeProb - afterProb);

  if (fenBefore && uci && isOnlyLegalMove(fenBefore, uci)) {
    return classified('forced', loss, mateTransition);
  }

  if (mateTransition === 'missed') {
    return classified('miss', loss, mateTransition);
  }

  if (mateTransition === 'conceded') {
    return classified('blunder', loss, mateTransition);
  }

  if (isBook && loss <= 0.02 + Number.EPSILON) {
    return classified('book', loss, mateTransition);
  }

  if (
    uci &&
    bestMoveUci &&
    uci === bestMoveUci &&
    loss <= 0.02 + Number.EPSILON &&
    beforeProb < 0.95 - Number.EPSILON &&
    afterProb >= 0.5 - Number.EPSILON &&
    fenBefore &&
    detectSoundPieceSacrifice(fenBefore, uci, pv)
  ) {
    return classified('brilliant', loss, mateTransition);
  }

  if (
    uci &&
    bestMoveUci &&
    uci === bestMoveUci &&
    loss <= 0.02 + Number.EPSILON &&
    secondBestScore &&
    isExactScore(secondBestScore) &&
    !secondBestScore.bound
  ) {
    const secondProb = scoreToMoverWinProbability(secondBestScore, mover);
    if (secondProb !== null && isProbability(secondProb)) {
      if (beforeProb - secondProb >= 0.15 - Number.EPSILON) {
        return classified('great', loss, mateTransition);
      }
    }
  }

  if (uci && bestMoveUci && uci === bestMoveUci) {
    return classified('best', loss, mateTransition);
  }

  if (loss <= 0.02 + Number.EPSILON) {
    return classified(
      bestMoveUci === undefined && loss <= Number.EPSILON ? 'best' : 'excellent',
      loss,
      mateTransition
    );
  }

  if (loss <= 0.05 + Number.EPSILON) {
    return classified('good', loss, mateTransition);
  }

  if (loss <= 0.1 + Number.EPSILON) {
    return classified('inaccuracy', loss, mateTransition);
  }

  if (beforeProb >= 0.85 - Number.EPSILON && loss > 0.15 + Number.EPSILON) {
    return classified('miss', loss, mateTransition);
  }

  if (loss <= 0.2 + Number.EPSILON) {
    return classified('mistake', loss, mateTransition);
  }

  return classified('blunder', loss, mateTransition);
}

function classifyMateTransition(
  before: EvaluationScore,
  after: EvaluationScore,
  mover: PlayerColor
): MateTransition | undefined {
  const beforeOwnMate = isForcedMateForMover(before, mover);
  const afterOwnMate = isForcedMateForMover(after, mover);
  const beforeOpponentMate = isForcedMateForOpponent(before, mover);
  const afterOpponentMate = isForcedMateForOpponent(after, mover);

  if (!beforeOpponentMate && afterOpponentMate) return 'conceded';
  if (beforeOwnMate && !afterOwnMate) return 'missed';
  if (beforeOwnMate && afterOwnMate) return 'retained';
  if (!beforeOwnMate && afterOwnMate) return 'gained';
  return undefined;
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

function classified(
  quality: MoveQuality,
  probabilityLoss: number,
  mateTransition?: MateTransition
): ClassifiedMoveAccuracy {
  return {
    status: 'classified',
    quality,
    ...(mateTransition ? { mateTransition } : {}),
    probabilityLoss,
    accuracyEstimate: lossToAccuracyEstimate(probabilityLoss),
    heuristicVersion: ACCURACY_HEURISTIC_VERSION,
  };
}

function isProbability(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}
