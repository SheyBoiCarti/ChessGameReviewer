import { Chess } from 'chess.js';

import type { ParsedGame } from '@/lib/chess/pgnParser';
import type { GameAnnotation, GameAnalysisResult } from './analyzeGame';
import { explainMove } from './moveExplanation';
import type { AnalysisStrength } from '@/features/workspace/types';
import type { MoveAccuracy, MoveQuality } from '@/lib/engine/accuracy';
import {
  parseFenSideToMove,
  type PlayerColor,
  type EvaluationScore,
} from '@/lib/engine/evaluation';
import type { EvaluationLimit } from '@/lib/engine/stockfishAdapter';

export interface MoveQualityDetails {
  label: string;
  symbol: string;
  colorClass: string;
  description: string;
}

const QUALITY_METADATA: Record<MoveQuality, MoveQualityDetails> = {
  brilliant: {
    label: 'Brilliant',
    symbol: '!!',
    colorClass: 'badge-brilliant',
    description: 'A top engine choice meeting the local brilliant-move criteria',
  },
  great: {
    label: 'Great',
    symbol: '!',
    colorClass: 'badge-great',
    description: 'A strong engine choice meeting the local great-move criteria',
  },
  best: {
    label: 'Best',
    symbol: '★',
    colorClass: 'badge-best',
    description: 'The best move according to the engine',
  },
  excellent: {
    label: 'Excellent',
    symbol: '✓✓',
    colorClass: 'badge-excellent',
    description: 'An almost optimal move',
  },
  good: {
    label: 'Good',
    symbol: '✓',
    colorClass: 'badge-good',
    description: 'A solid, playable move',
  },
  inaccuracy: {
    label: 'Inaccuracy',
    symbol: '?!',
    colorClass: 'badge-inaccuracy',
    description: 'A slight mistake that gives away some advantage',
  },
  mistake: {
    label: 'Mistake',
    symbol: '?',
    colorClass: 'badge-mistake',
    description: 'A bad move that significantly hurts your position',
  },
  blunder: {
    label: 'Blunder',
    symbol: '??',
    colorClass: 'badge-blunder',
    description: 'A move with a large drop in the local evaluation',
  },
  miss: {
    label: 'Miss',
    symbol: '✕',
    colorClass: 'badge-miss',
    description: 'A missed improvement according to the local engine',
  },
  forced: {
    label: 'Forced',
    symbol: '□',
    colorClass: 'badge-forced',
    description: 'The only legal move available',
  },
};

export function moveQualityDetails(quality: MoveQuality): MoveQualityDetails {
  return QUALITY_METADATA[quality];
}

export interface MoveTagDetails {
  label: string;
  symbol: string;
  colorClass: string;
  description: string;
}

export const REPERTOIRE_TAG_DETAILS: MoveTagDetails = {
  label: 'Repertoire',
  symbol: '♟',
  colorClass: 'badge-repertoire',
  description: 'A recognized opening move from your games',
};

export function moveTagDetails(tag: 'repertoire'): MoveTagDetails {
  return REPERTOIRE_TAG_DETAILS;
}

export interface AnalysisPreset {
  limit: EvaluationLimit;
  multiPv: number;
}

const presets: Record<AnalysisStrength, AnalysisPreset> = {
  quick: { limit: { depth: 10 }, multiPv: 1 },
  balanced: { limit: { depth: 14 }, multiPv: 2 },
  deep: { limit: { movetimeMs: 3000 }, multiPv: 3 },
};

export function analysisPreset(strength: AnalysisStrength): AnalysisPreset {
  const preset = presets[strength];
  return { limit: { ...preset.limit }, multiPv: preset.multiPv };
}

export interface EvaluationGraphInput {
  ply: number;
  evaluation: EvaluationScore | null;
}

export interface EvaluationGraphPoint {
  ply: number;
  value: number | null;
  label: string;
}

/** Mate is placed outside the normal ±10-pawn visual range but remains labelled as mate. */
export function toGraphPoints(values: readonly EvaluationGraphInput[]): EvaluationGraphPoint[] {
  return values.map(({ ply, evaluation }) => {
    if (!evaluation || !Number.isFinite(evaluation.value)) {
      return { ply, value: null, label: 'Evaluation unavailable' };
    }
    if (evaluation.kind === 'mate') {
      const side = evaluation.value >= 0 ? 'White' : 'Black';
      return {
        ply,
        value: evaluation.value >= 0 ? 12 : -12,
        label: `${evaluation.bound ? `${evaluation.bound} bound · ` : ''}${side} mate in ${Math.abs(evaluation.value)}`,
      };
    }
    const pawns = evaluation.value / 100;
    return {
      ply,
      value: pawns,
      label: `${evaluation.bound ? `${evaluation.bound} bound · ` : ''}${pawns >= 0 ? 'White' : 'Black'} ${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`,
    };
  });
}

export function qualityLabel(accuracy: MoveAccuracy): string {
  if (accuracy.status === 'indeterminate') {
    if (accuracy.reason === 'bound-score') return 'Indeterminate (bound score)';
    if (accuracy.reason === 'non-finite-score') return 'Indeterminate (invalid score)';
    return 'Indeterminate (probability unavailable)';
  }
  return moveQualityDetails(accuracy.quality).label;
}

export interface ConvertedPrincipalVariation {
  moves: string[];
  diagnostic: string | null;
}

export function convertPvToSan(
  startFen: string,
  uciMoves: readonly string[]
): ConvertedPrincipalVariation {
  try {
    const chess = new Chess(startFen);
    const moves = uciMoves.map((uci) => {
      const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
      if (!match?.[1] || !match[2]) throw new Error('Invalid UCI move.');
      const move = chess.move({
        from: match[1],
        to: match[2],
        ...(match[3] ? { promotion: match[3] } : {}),
      });
      if (!move) throw new Error('Illegal UCI move.');
      return move.san;
    });
    return { moves, diagnostic: null };
  } catch {
    return {
      moves: [...uciMoves],
      diagnostic: 'The principal variation could not be fully converted to SAN; safe UCI is shown.',
    };
  }
}

/** A single original-game selection shared by board and analysis panels. */
interface SelectedMoveBase {
  ply: number;
  san: string;
  fenBefore: string;
  fenAfter: string;
  mover: PlayerColor;
  scoreOrigin: 'after';
  arrowOrigin: 'after';
  reply: string | null;
}
export type SelectedMovePresentation =
  | { state: 'starting'; ply: 0; fenAfter: string }
  | (SelectedMoveBase & {
      state: 'pending';
      annotation: null;
      quality: null;
      beforeScore: null;
      afterScore: null;
    })
  | (SelectedMoveBase & {
      state: 'ready';
      explanation: string | null;
      annotation: GameAnnotation;
      quality: MoveQuality | 'indeterminate';
      beforeScore: EvaluationScore;
      afterScore: EvaluationScore;
    });

export function selectMovePresentation(
  game: ParsedGame,
  result: GameAnalysisResult | null,
  ply: number
): SelectedMovePresentation {
  const move = game.plies[ply - 1];
  if (!move || ply < 1) {
    return { state: 'starting', ply: 0, fenAfter: game.plies[0]?.fenBefore ?? new Chess().fen() };
  }
  const annotation = result?.annotations.find((item) => item.ply === move.ply) ?? null;
  const candidate = annotation?.after.pv[0];
  let reply: string | null = null;
  if (candidate && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(candidate)) {
    try {
      const chess = new Chess(move.fenAfter);
      if (
        chess.move({
          from: candidate.slice(0, 2),
          to: candidate.slice(2, 4),
          ...(candidate[4] ? { promotion: candidate[4] } : {}),
        })
      )
        reply = candidate;
    } catch {
      /* A stale or illegal PV cannot be drawn on this position. */
    }
  }
  const base: SelectedMoveBase = {
    ply: move.ply,
    san: move.san,
    fenBefore: move.fenBefore,
    fenAfter: move.fenAfter,
    mover: parseFenSideToMove(move.fenBefore),
    scoreOrigin: 'after',
    arrowOrigin: 'after',
    reply,
  };
  if (!annotation)
    return {
      ...base,
      state: 'pending',
      annotation: null,
      quality: null,
      beforeScore: null,
      afterScore: null,
    };
  return {
    ...base,
    state: 'ready',
    explanation: explainMove(move.fenBefore, move.uci),
    annotation,
    quality:
      annotation.accuracy.status === 'classified' ? annotation.accuracy.quality : 'indeterminate',
    beforeScore: annotation.before.score,
    afterScore: annotation.after.score,
  };
}

export function moveNotation(ply: number, san: string, mover?: PlayerColor): string {
  return `${Math.ceil(ply / 2)}${(mover ?? (ply % 2 ? 'white' : 'black')) === 'white' ? '.' : '…'} ${san}`;
}
