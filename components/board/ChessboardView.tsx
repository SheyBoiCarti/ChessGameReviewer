'use client';

import type { KeyboardEvent } from 'react';

import { boardSquares, InvalidBoardPositionError } from '@/features/board/position';
import type { BoardOrientation } from '@/features/workspace/types';

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
}: {
  fen: string;
  orientation: BoardOrientation;
  currentPly: number;
  totalPlies: number;
  onPlyChange(ply: number): void;
  lastMove?: { from: string; to: string };
  selectedSquare?: string;
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
      <div
        className="chessboard"
        role="grid"
        aria-label="Chess board"
        data-orientation={orientation}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        aria-describedby="board-keyboard-help"
      >
        {squares.map((square) => {
          const highlighted =
            square.name === selectedSquare ||
            square.name === lastMove?.from ||
            square.name === lastMove?.to;
          return (
            <div
              className={`board-square ${square.isLight ? 'square-light' : 'square-dark'}${highlighted ? ' square-highlighted' : ''}`}
              role="gridcell"
              aria-label={square.name}
              data-square={square.name}
              key={square.name}
            >
              {square.piece ? <Piece piece={square.piece} square={square.name} /> : null}
            </div>
          );
        })}
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
