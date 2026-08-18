'use client';

import { useEffect, useMemo, useRef } from 'react';

import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';
import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { qualityLabel, toGraphPoints } from '@/features/stockfish-analysis/presentation';

export interface AnalysisMoveListProps {
  annotations: readonly GameAnnotation[];
  selectedPly: number;
  onSelectPly(ply: number): void;
  id?: string | undefined;
}

export function AnalysisMoveList({
  annotations,
  selectedPly,
  onSelectPly,
  id,
}: AnalysisMoveListProps) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  const points = useMemo(
    () =>
      toGraphPoints(
        annotations.map((annotation) => ({
          ply: annotation.ply,
          evaluation: annotation.after.score,
        }))
      ),
    [annotations]
  );

  useEffect(() => {
    if (selectedRef.current && typeof selectedRef.current.scrollIntoView === 'function') {
      selectedRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedPly]);

  return (
    <div
      className="analysis-move-list"
      id={id}
      role="region"
      aria-label="Analysis move list"
      tabIndex={0}
    >
      <div className="analysis-move-list__items" role="list">
        {annotations.map((annotation, index) => {
          const isSelected = selectedPly === annotation.ply;
          const moveNumber = Math.floor((annotation.ply - 1) / 2) + 1;
          const movePrefix = annotation.mover === 'white' ? `${moveNumber}.` : `${moveNumber}...`;
          const evalLabel = points[index]?.label ?? 'Evaluation unavailable';
          const quality =
            annotation.accuracy.status === 'classified' ? annotation.accuracy.quality : undefined;
          const qualityText = qualityLabel(annotation.accuracy);

          return (
            <div key={annotation.ply} role="listitem">
              <button
                ref={isSelected ? selectedRef : null}
                type="button"
                className={`analysis-move-row${isSelected ? ' analysis-move-row--selected' : ''}`}
                onClick={() => onSelectPly(annotation.ply)}
                aria-current={isSelected ? 'true' : undefined}
                data-selected={isSelected ? 'true' : undefined}
                aria-label={`Select ply ${annotation.ply}: ${movePrefix} ${annotation.san}, ${evalLabel}, ${qualityText}`}
              >
                <span className="analysis-move-row__num" aria-hidden="true">
                  {movePrefix}
                </span>
                <span className="analysis-move-row__san" aria-hidden="true">
                  {annotation.san}
                </span>
                <span className="analysis-move-row__badge" aria-hidden="true">
                  {quality ? (
                    <MoveClassificationBadge quality={quality} size="inline" ariaHidden />
                  ) : null}
                </span>
                <span className="analysis-move-row__eval" aria-hidden="true">
                  {evalLabel}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
