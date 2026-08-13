'use client';

import type { KeyboardEvent } from 'react';

import { boardSquares, InvalidBoardPositionError } from '@/features/board/position';
import type { BoardOrientation } from '@/features/workspace/types';
import type { EvaluationScore } from '@/lib/engine/evaluation';

import { EvaluationBar } from './EvaluationBar';
import { MoveHistoryControls } from './MoveHistoryControls';
import { Piece } from './Piece';

export function ChessboardView({
  fen,
  orientation,
  currentPly,
  totalPlies,
  onPlyChange,
  lastMove,
  selectedSquare,
  pvArrow,
  evaluationScore,
}: {
  fen: string;
  orientation: BoardOrientation;
  currentPly: number;
  totalPlies: number;
  onPlyChange(ply: number): void;
  lastMove?: { from: string; to: string };
  selectedSquare?: string;
  pvArrow?: { from: string; to: string };
  evaluationScore?: EvaluationScore;
}) {
  let squares;
  try {
    squares = boardSquares(fen, orientation);
  } catch (error) {
    if (!(error instanceof InvalidBoardPositionError)) throw error;
    return (
      <div className="board-error" role="alert">
        <p>The selected chess position is invalid and cannot be displayed.</p>
        <button type="button" onClick={() => onPlyChange(0)}>
          Return to start
        </button>
      </div>
    );
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = Math.max(0, currentPly - 1);
    if (event.key === 'ArrowRight') next = Math.min(totalPlies, currentPly + 1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = totalPlies;
    if (next !== null) {
      event.preventDefault();
      onPlyChange(next);
    }
  };

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
            aria-describedby="board-keyboard-help"
          >
            {Array.from({ length: 8 }, (_, row) => (
              <div className="board-row" role="row" key={row}>
                {squares.slice(row * 8, row * 8 + 8).map((square, column) => {
                  const selected = square.name === selectedSquare;
                  const highlighted =
                    selected || square.name === lastMove?.from || square.name === lastMove?.to;
                  return (
                    <div
                      className={`board-square ${square.isLight ? 'square-light' : 'square-dark'}${highlighted ? ' square-highlighted' : ''}${selected ? ' square-selected' : ''}`}
                      role="gridcell"
                      aria-label={square.name}
                      data-square={square.name}
                      key={square.name}
                    >
                      {column === 0 ? (
                        <span className="board-rank-label" aria-hidden="true">
                          {square.rank}
                        </span>
                      ) : null}
                      {square.piece ? <Piece piece={square.piece} square={square.name} /> : null}
                      {row === 7 ? (
                        <span className="board-file-label" aria-hidden="true">
                          {square.file}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {pvArrow ? <BoardArrow move={pvArrow} orientation={orientation} /> : null}
        </div>
      </div>
      <p id="board-keyboard-help" className="sr-only">
        Use Left and Right Arrow to move through history. Home returns to the first position and End
        moves to the last.
      </p>
      <MoveHistoryControls
        currentPly={currentPly}
        totalPlies={totalPlies}
        onPlyChange={onPlyChange}
      />
    </div>
  );
}

function BoardArrow({
  move,
  orientation,
}: {
  move: { from: string; to: string };
  orientation: BoardOrientation;
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

function squareCenter(square: string, orientation: BoardOrientation) {
  if (!/^[a-h][1-8]$/.test(square)) return null;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const column = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  return { x: (column + 0.5) * 12.5, y: (row + 0.5) * 12.5 };
}
