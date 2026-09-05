'use client';

import { useMemo } from 'react';
import { Chess } from 'chess.js';

import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';
import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { moveQualityDetails } from '@/features/stockfish-analysis/presentation';

export interface ReviewFeedbackProps {
  annotation: GameAnnotation | null;
  selectedPly: number;
  startFen?: string | undefined;
  nextMistake: number | null;
  onSelectPly(ply: number): void;
  hasAnnotations: boolean;
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
      <div className="review-feedback__header">
        {quality ? <MoveClassificationBadge quality={quality} size="inline" ariaHidden /> : null}
        <span className="review-feedback__title">
          {isClassified ? `${annotation.san} — ${qualityLabel}` : 'Move quality unavailable'}
        </span>
      </div>

      <p className="review-feedback__best-move">Best move: {bestSan ?? 'Best move unavailable'}</p>

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
    </div>
  );
}
