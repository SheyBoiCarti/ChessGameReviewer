'use client';

import { useState, type KeyboardEvent } from 'react';
import type { Square } from 'chess.js';

import { AccessibleBoardGrid } from '@/components/board/AccessibleBoardGrid';
import { InteractiveChessboard, type InteractiveChessboardProps } from '@/components/board/InteractiveChessboard';
import { boardSquares, InvalidBoardPositionError } from '@/features/board/position';
import type { EvaluationScore } from '@/lib/engine/evaluation';

import { EvaluationBar } from './EvaluationBar';
import { MoveHistoryControls } from './MoveHistoryControls';

export interface MoveHistoryModel {
  currentPly: number;
  totalPlies: number;
  onPlyChange(ply: number): void;
}

export interface ChessboardViewProps extends InteractiveChessboardProps {
  history?: MoveHistoryModel;
  evaluationScore?: EvaluationScore;
  currentPly?: number;
  totalPlies?: number;
  onPlyChange?(ply: number): void;
  selectedSquare?: string;
}

export function ChessboardView({
  fen,
  orientation,
  isInteractive = false,
  onMove,
  lastMove,
  lastMoveBadge,
  pvArrow,
  history,
  evaluationScore,
  currentPly,
  totalPlies,
  onPlyChange,
  selectedSquare: controlledSelectedSquare,
}: ChessboardViewProps) {
  const [selection, setSelection] = useState<{
    selectedSquare: Square | null;
    legalTargets: readonly Square[];
  }>({
    selectedSquare: null,
    legalTargets: [],
  });

  const historyModel: MoveHistoryModel | undefined =
    history ??
    (onPlyChange && currentPly !== undefined && totalPlies !== undefined
      ? { currentPly, totalPlies, onPlyChange }
      : undefined);

  let squares;
  try {
    squares = boardSquares(fen, orientation);
  } catch (error) {
    if (!(error instanceof InvalidBoardPositionError)) throw error;
    return (
      <div className="board-error" role="alert">
        <p>The selected chess position is invalid and cannot be displayed.</p>
        <button
          type="button"
          onClick={() => {
            if (historyModel) {
              historyModel.onPlyChange(0);
            }
          }}
        >
          Return to start
        </button>
      </div>
    );
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!historyModel) return;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = Math.max(0, historyModel.currentPly - 1);
    if (event.key === 'ArrowRight')
      next = Math.min(historyModel.totalPlies, historyModel.currentPly + 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = historyModel.totalPlies;
    if (next !== null) {
      event.preventDefault();
      historyModel.onPlyChange(next);
    }
  };

  const activeSelectedSquare =
    (controlledSelectedSquare as Square | undefined) ?? selection.selectedSquare;

  const legalTargetsStatus =
    selection.selectedSquare && selection.legalTargets.length > 0
      ? `Selected ${selection.selectedSquare}. Legal destinations: ${selection.legalTargets.join(', ')}.`
      : undefined;

  return (
    <div className="board-region">
      <div className={`board-stage${evaluationScore ? ' board-stage--with-evaluation' : ''}`}>
        {evaluationScore ? <EvaluationBar score={evaluationScore} /> : null}
        <div className="chessboard-frame">
          <div
            className="chessboard"
            role="grid"
            aria-label="Chess board"
            data-orientation={orientation}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            aria-describedby={historyModel ? 'board-keyboard-help' : undefined}
          >
            <AccessibleBoardGrid
              squares={squares}
              orientation={orientation}
              selectedSquare={activeSelectedSquare}
              lastMove={lastMove}
              lastMoveBadge={lastMoveBadge}
              legalTargetsStatus={legalTargetsStatus}
            />
            <InteractiveChessboard
              fen={fen}
              orientation={orientation}
              isInteractive={isInteractive}
              onMove={onMove}
              lastMove={lastMove}
              lastMoveBadge={lastMoveBadge}
              pvArrow={pvArrow}
              onSelectionChange={setSelection}
            />
          </div>
          {pvArrow ? (
            <BoardArrow move={pvArrow} orientation={orientation} />
          ) : null}
        </div>
      </div>
      {historyModel ? (
        <>
          <p id="board-keyboard-help" className="sr-only">
            Use Left and Right Arrow to move through history. Home returns to the first position and
            End moves to the last.
          </p>
          <MoveHistoryControls
            currentPly={historyModel.currentPly}
            totalPlies={historyModel.totalPlies}
            onPlyChange={historyModel.onPlyChange}
          />
        </>
      ) : null}
    </div>
  );
}

function BoardArrow({
  move,
  orientation,
}: {
  move: { from: string; to: string };
  orientation: 'white' | 'black';
}) {
  const from = squareCenter(move.from, orientation);
  const to = squareCenter(move.to, orientation);
  if (!from || !to) return null;
  return (
    <svg
      className="board-arrow"
      viewBox="0 0 100 100"
      aria-label={`Principal variation ${move.from} to ${move.to}`}
      role="img"
    >
      <defs>
        <marker
          id="pv-arrow-head"
          markerWidth="5"
          markerHeight="5"
          refX="4"
          refY="2.5"
          orient="auto"
        >
          <path d="M0,0 L5,2.5 L0,5 Z" />
        </marker>
      </defs>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd="url(#pv-arrow-head)" />
    </svg>
  );
}

function squareCenter(square: string, orientation: 'white' | 'black') {
  if (!/^[a-h][1-8]$/.test(square)) return null;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const column = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  return { x: (column + 0.5) * 12.5, y: (row + 0.5) * 12.5 };
}
