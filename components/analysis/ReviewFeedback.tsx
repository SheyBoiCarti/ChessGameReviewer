'use client';

import { useMemo } from 'react';
import { Chess } from 'chess.js';

import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';
import type { AnalysisStrength } from '@/features/workspace/types';
import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { whiteCentipawnDelta } from '@/lib/engine/evaluation';
import {
  moveNotation,
  toGraphPoints,
  moveQualityDetails,
} from '@/features/stockfish-analysis/presentation';

export interface ReviewFeedbackProps {
  annotation: GameAnnotation | null;
  selectedPly: number;
  startFen?: string | undefined;
  nextMistake: number | null;
  onSelectPly(ply: number): void;
  hasAnnotations: boolean;
  showingPrevious?: boolean | undefined;
  previousStrength?: AnalysisStrength | null | undefined;
}

function convertUciToSan(fen: string | undefined, uci: string | undefined): string | null {
  if (!fen || !uci) return null;
  try {
    const chess = new Chess(fen);
    const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
    if (!match?.[1] || !match[2]) return null;
    const move = chess.move({
      from: match[1],
      to: match[2],
      ...(match[3] ? { promotion: match[3] } : {}),
    });
    return move ? move.san : null;
  } catch {
    return null;
  }
}

export function ReviewFeedback({
  annotation,
  selectedPly,
  startFen,
  nextMistake,
  onSelectPly,
  hasAnnotations,
  showingPrevious = false,
  previousStrength,
}: ReviewFeedbackProps) {
  const bestSan = useMemo(() => {
    if (!annotation?.before?.bestMove) return null;
    return convertUciToSan(startFen, annotation.before.bestMove);
  }, [annotation?.before?.bestMove, startFen]);

  if (selectedPly === 0) {
    return (
      <div className="review-feedback" role="region" aria-label="Selected move feedback">
        <p className="review-feedback__empty">Select a move to review it.</p>
      </div>
    );
  }

  if (!annotation) {
    return (
      <div className="review-feedback" role="region" aria-label="Selected move feedback">
        <p className="review-feedback__empty">This move has not been analysed yet.</p>
      </div>
    );
  }

  const quality =
    annotation.accuracy.status === 'classified' ? annotation.accuracy.quality : undefined;
  const isClassified = Boolean(quality);
  const qualityLabel = quality ? moveQualityDetails(quality).label : 'Move quality unavailable';

  return (
    <div className="review-feedback" role="region" aria-label="Selected move feedback">
      <details className="review-feedback__details">
        <summary className="review-feedback__header">
          {quality ? <MoveClassificationBadge quality={quality} size="inline" ariaHidden /> : null}
          <span className="review-feedback__title">
            {showingPrevious ? `Previous ${previousStrength ?? 'saved'} review · ` : ''}
            {moveNotation(annotation.ply, annotation.san, annotation.mover)} —{' '}
            <span>{isClassified ? qualityLabel : 'Move quality unavailable'}</span>
          </span>
        </summary>

        <p>
          {quality
            ? moveQualityDetails(quality).description
            : 'The available scores do not support a reliable move grade.'}
        </p>
        <EvaluationComparison annotation={annotation} />
        <p className="review-feedback__best-move">
          Best move: {bestSan ?? 'Best move unavailable'}
        </p>

        {hasAnnotations ? (
          <div className="review-feedback__actions">
            <button
              type="button"
              className="button-secondary review-feedback__next-btn"
              onClick={() => {
                if (nextMistake !== null) {
                  onSelectPly(nextMistake);
                }
              }}
              disabled={nextMistake === null}
            >
              Next mistake
            </button>
            {nextMistake === null ? (
              <span className="review-feedback__no-mistakes">
                No later mistakes in the analysed moves.
              </span>
            ) : null}
          </div>
        ) : null}
      </details>
    </div>
  );
}

export function EvaluationComparison({ annotation }: { annotation: GameAnnotation }) {
  const [before, after] = toGraphPoints([
    { ply: annotation.ply, evaluation: annotation.before.score },
    { ply: annotation.ply, evaluation: annotation.after.score },
  ]);
  const delta = whiteCentipawnDelta(annotation.before.score, annotation.after.score);
  return (
    <div className="review-evaluation">
      <p>Evaluation from White’s perspective</p>
      <p>Before: {before!.label}</p>
      <p>After: {after!.label}</p>
      {delta !== null ? (
        <p>
          Change for White: {delta >= 0 ? '+' : ''}
          {(delta / 100).toFixed(2)} pawns
        </p>
      ) : null}
    </div>
  );
}
