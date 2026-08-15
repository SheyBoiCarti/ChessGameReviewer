import type { Square } from 'chess.js';

import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';
import { Piece } from '@/components/board/Piece';
import { boardSquares, type SquareModel } from '@/features/board/position';
import type { MoveQuality } from '@/lib/engine/accuracy';

export interface AccessibleBoardGridProps {
  squares: readonly SquareModel[];
  orientation: 'white' | 'black';
  selectedSquare?: Square | null;
  lastMove?: { from: Square; to: Square };
  lastMoveBadge?: { square: Square; quality: MoveQuality };
  legalTargetsStatus?: string;
}

export function AccessibleBoardGrid({
  squares,
  selectedSquare,
  lastMove,
  lastMoveBadge,
  legalTargetsStatus,
}: AccessibleBoardGridProps): React.JSX.Element {
  return (
    <>
      <div className="accessible-board-grid">
        {Array.from({ length: 8 }, (_, row) => (
          <div className="board-row" role="row" key={row}>
            {squares.slice(row * 8, row * 8 + 8).map((square, column) => {
              const isSelected = square.name === selectedSquare;
              const isHighlighted =
                isSelected || square.name === lastMove?.from || square.name === lastMove?.to;
              const hasBadge = lastMoveBadge?.square === square.name;

              return (
                <div
                  className={`board-square ${square.isLight ? 'square-light' : 'square-dark'}${isHighlighted ? ' square-highlighted' : ''}${isSelected ? ' square-selected' : ''}`}
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
                  {hasBadge ? (
                    <MoveClassificationBadge quality={lastMoveBadge.quality} size="inline" />
                  ) : null}
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
      {legalTargetsStatus ? (
        <span className="sr-only" role="status" aria-live="polite">
          {legalTargetsStatus}
        </span>
      ) : null}
    </>
  );
}
