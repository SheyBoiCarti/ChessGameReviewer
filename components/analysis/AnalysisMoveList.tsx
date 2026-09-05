'use client';

import { useEffect, useMemo, useRef } from 'react';

import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';
import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { qualityLabel, toGraphPoints } from '@/features/stockfish-analysis/presentation';
import type { MovePly } from '@/lib/chess/pgnParser';
import { parseFenSideToMove, type PlayerColor } from '@/lib/engine/evaluation';

export interface AnalysisMoveListProps {
  moves?: readonly MovePly[] | undefined;
  annotations?: readonly GameAnnotation[] | undefined;
  selectedPly: number;
  onSelectPly(ply: number): void;
  id?: string | undefined;
  tableLabel?: string | undefined;
}

interface MoveCellData {
  move: MovePly;
  annotation?: GameAnnotation | undefined;
  evalLabel: string;
  qualityText?: string | undefined;
  movePrefix: string;
}

interface MoveRowData {
  fullmove: number;
  white?: MoveCellData | undefined;
  black?: MoveCellData | undefined;
}

export function AnalysisMoveList({
  moves,
  annotations = [],
  selectedPly,
  onSelectPly,
  id,
  tableLabel = 'Move list',
}: AnalysisMoveListProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  const effectiveMoves = useMemo<readonly MovePly[]>(() => {
    if (moves && moves.length > 0) return moves;
    if (annotations && annotations.length > 0) {
      return annotations.map((a) => {
        const fullmove = Math.floor((a.ply - 1) / 2) + 1;
        const side = a.mover === 'white' ? 'w' : 'b';
        return {
          ply: a.ply,
          san: a.san,
          uci: a.uci,
          fenBefore: `8/8/8/8/8/8/8/8 ${side} - - 0 ${fullmove}`,
          fenAfter: '',
          positionBefore: '',
          positionAfter: '',
        };
      });
    }
    return [];
  }, [moves, annotations]);

  const annotationsMap = useMemo(() => {
    const map = new Map<number, GameAnnotation>();
    for (const annotation of annotations) {
      map.set(annotation.ply, annotation);
    }
    return map;
  }, [annotations]);

  const graphPointsMap = useMemo(() => {
    const points = toGraphPoints(
      annotations.map((annotation) => ({
        ply: annotation.ply,
        evaluation: annotation.after.score,
      }))
    );
    const map = new Map<number, string>();
    for (const point of points) {
      map.set(point.ply, point.label);
    }
    return map;
  }, [annotations]);

  const rows = useMemo<MoveRowData[]>(() => {
    const result: MoveRowData[] = [];
    let currentRow: MoveRowData | null = null;

    for (const move of effectiveMoves) {
      let side: PlayerColor = 'white';
      let fullmove = 1;
      try {
        side = parseFenSideToMove(move.fenBefore);
        const parts = move.fenBefore.trim().split(/\s+/);
        fullmove = parseInt(parts[5] ?? '1', 10) || 1;
      } catch {
        side = move.ply % 2 === 1 ? 'white' : 'black';
        fullmove = Math.floor((move.ply - 1) / 2) + 1;
      }

      const annotation = annotationsMap.get(move.ply);
      const evalLabel = annotation
        ? (graphPointsMap.get(move.ply) ?? 'Evaluation unavailable')
        : 'Not analysed';
      const qualityText = annotation ? qualityLabel(annotation.accuracy) : undefined;
      const movePrefix = side === 'white' ? `${fullmove}.` : `${fullmove}...`;

      const cellData: MoveCellData = {
        move,
        annotation,
        evalLabel,
        qualityText,
        movePrefix,
      };

      if (!currentRow || currentRow.fullmove !== fullmove || currentRow[side] !== undefined) {
        currentRow = { fullmove };
        result.push(currentRow);
      }
      currentRow[side] = cellData;
    }

    return result;
  }, [effectiveMoves, annotationsMap, graphPointsMap]);

  useEffect(() => {
    const container = containerRef.current;
    const selected = selectedRef.current;
    if (container && selected) {
      const containerRect = container.getBoundingClientRect();
      const selectedRect = selected.getBoundingClientRect();

      if (selectedRect.top < containerRect.top) {
        container.scrollTop -= containerRect.top - selectedRect.top;
      } else if (selectedRect.bottom > containerRect.bottom) {
        container.scrollTop += selectedRect.bottom - containerRect.bottom;
      }
    }
  }, [selectedPly]);

  const renderCell = (cellData?: MoveCellData) => {
    if (!cellData) {
      return (
        <span className="analysis-move-cell analysis-move-cell--empty" aria-hidden="true">
          —
        </span>
      );
    }

    const { move, annotation, evalLabel, qualityText, movePrefix } = cellData;
    const isSelected = selectedPly === move.ply;
    const quality =
      annotation?.accuracy.status === 'classified' ? annotation.accuracy.quality : undefined;

    const accessibleLabel = annotation
      ? `Select ply ${move.ply}: ${movePrefix} ${move.san}, ${evalLabel}, ${qualityText}`
      : `Select ply ${move.ply}: ${movePrefix} ${move.san}, Not analysed`;

    const titleText = annotation ? `${evalLabel} (${qualityText})` : 'Not analysed';

    return (
      <button
        ref={isSelected ? selectedRef : null}
        type="button"
        className={`analysis-move-cell${isSelected ? ' analysis-move-cell--selected' : ''}`}
        onClick={() => onSelectPly(move.ply)}
        aria-current={isSelected ? 'true' : undefined}
        data-selected={isSelected ? 'true' : undefined}
        aria-label={accessibleLabel}
        title={titleText}
      >
        <span className="visually-hidden">{movePrefix} </span>
        <span className="analysis-move-cell__san">{move.san}</span>
        {quality ? (
          <span className="analysis-move-cell__badge">
            <MoveClassificationBadge quality={quality} size="inline" ariaHidden />
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div
      ref={containerRef}
      className="analysis-move-list"
      id={id}
      role="region"
      aria-label={tableLabel}
      tabIndex={0}
    >
      <div className="analysis-move-table" role="table" aria-label={tableLabel}>
        <div className="analysis-move-table__body" role="rowgroup">
          {rows.map((row) => (
            <div key={row.fullmove} className="analysis-move-table__row" role="row">
              <span className="analysis-move-table__num" role="rowheader" aria-hidden="true">
                {row.fullmove}.
              </span>
              <div className="analysis-move-table__col" role="cell">
                {renderCell(row.white)}
              </div>
              <div className="analysis-move-table__col" role="cell">
                {renderCell(row.black)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
