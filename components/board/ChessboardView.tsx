'use client';

import { useEffect, useState, type DragEvent, type KeyboardEvent } from 'react';
import type { Square } from 'chess.js';

import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';
import { Piece } from '@/components/board/Piece';
import { PromotionDialog } from '@/components/board/PromotionDialog';
import {
  applyBoardMove,
  legalDestinations,
  promotionRequired,
  type AppliedBoardMove,
  type PromotionPiece,
} from '@/features/board/moves';
import { boardSquares, InvalidBoardPositionError } from '@/features/board/position';
import type { MoveQuality } from '@/lib/engine/accuracy';
import {
  parseFenSideToMove,
  type EvaluationScore,
  type PlayerColor,
} from '@/lib/engine/evaluation';

import { EvaluationBar } from './EvaluationBar';
import { MoveHistoryControls } from './MoveHistoryControls';

export interface MoveHistoryModel {
  currentPly: number;
  totalPlies: number;
  onPlyChange(ply: number): void;
}

export interface ChessboardViewProps {
  fen: string;
  orientation: 'white' | 'black';
  isInteractive?: boolean | undefined;
  onMove?: ((move: AppliedBoardMove) => boolean) | undefined;
  lastMove?: { from: Square; to: Square } | undefined;
  lastMoveBadge?: { square: Square; quality: MoveQuality } | undefined;
  pvArrow?: { from: Square; to: Square } | undefined;
  history?: MoveHistoryModel | undefined;
  evaluationScore?: EvaluationScore | undefined;
  currentPly?: number | undefined;
  totalPlies?: number | undefined;
  onPlyChange?: ((ply: number) => void) | undefined;
  selectedSquare?: string | undefined;
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
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<readonly Square[]>([]);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  useEffect(() => {
    setSelectedSquare(null);
    setLegalTargets([]);
    setPendingPromotion(null);
  }, [fen, orientation, isInteractive]);

  let mover: PlayerColor = 'white';
  try {
    mover = parseFenSideToMove(fen);
  } catch {
    mover = 'white';
  }

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

  const activeSelectedSquare = (controlledSelectedSquare as Square | undefined) ?? selectedSquare;

  const handleSquareClick = (squareName: Square) => {
    if (!isInteractive) return;

    const squareObj = squares.find((s) => s.name === squareName);
    const piece = squareObj?.piece;

    if (selectedSquare) {
      if (squareName === selectedSquare) {
        setSelectedSquare(null);
        setLegalTargets([]);
        return;
      }

      if (legalTargets.includes(squareName)) {
        if (promotionRequired(fen, { from: selectedSquare, to: squareName })) {
          setPendingPromotion({ from: selectedSquare, to: squareName });
          return;
        }

        const move = applyBoardMove(fen, { from: selectedSquare, to: squareName });
        if (move) {
          const accepted = onMove?.(move);
          if (accepted !== false) {
            setSelectedSquare(null);
            setLegalTargets([]);
          }
        }
        return;
      }

      if (piece && piece.color === mover) {
        const destinations = legalDestinations(fen, squareName);
        setSelectedSquare(squareName);
        setLegalTargets(destinations);
        return;
      }

      setSelectedSquare(null);
      setLegalTargets([]);
    } else {
      if (piece && piece.color === mover) {
        const destinations = legalDestinations(fen, squareName);
        setSelectedSquare(squareName);
        setLegalTargets(destinations);
      }
    }
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>, squareName: Square) => {
    if (!isInteractive) return;
    const squareObj = squares.find((s) => s.name === squareName);
    if (!squareObj?.piece || squareObj.piece.color !== mover) return;
    e.dataTransfer.setData('text/plain', squareName);
    setSelectedSquare(squareName);
    setLegalTargets(legalDestinations(fen, squareName));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, targetSquare: Square) => {
    if (!isInteractive) return;
    e.preventDefault();
    const from = e.dataTransfer.getData('text/plain') as Square;
    if (!from || from === targetSquare) return;

    if (promotionRequired(fen, { from, to: targetSquare })) {
      setPendingPromotion({ from, to: targetSquare });
      return;
    }

    const move = applyBoardMove(fen, { from, to: targetSquare });
    if (!move) return;

    const accepted = onMove?.(move);
    if (accepted !== false) {
      setSelectedSquare(null);
      setLegalTargets([]);
    }
  };

  const handlePromotionSelect = (promotion: PromotionPiece) => {
    if (pendingPromotion) {
      const move = applyBoardMove(fen, { ...pendingPromotion, promotion });
      if (move) {
        onMove?.(move);
      }
      setPendingPromotion(null);
      setSelectedSquare(null);
      setLegalTargets([]);
    }
  };

  const handlePromotionCancel = () => {
    setPendingPromotion(null);
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
            aria-describedby={historyModel ? 'board-keyboard-help' : undefined}
          >
            {Array.from({ length: 8 }, (_, row) => (
              <div className="board-row" role="row" key={row}>
                {squares.slice(row * 8, row * 8 + 8).map((square, column) => {
                  const isSelected = square.name === activeSelectedSquare;
                  const isHighlighted =
                    isSelected || square.name === lastMove?.from || square.name === lastMove?.to;
                  const isLegalTarget = legalTargets.includes(square.name as Square);
                  const hasBadge = Boolean(lastMoveBadge && lastMoveBadge.square === square.name);

                  return (
                    <div
                      className={`board-square ${square.isLight ? 'square-light' : 'square-dark'}${isHighlighted ? ' square-highlighted' : ''}${isSelected ? ' square-selected' : ''}`}
                      role="gridcell"
                      aria-label={square.name}
                      data-square={square.name}
                      key={square.name}
                      onClick={() => handleSquareClick(square.name as Square)}
                      draggable={
                        isInteractive && Boolean(square.piece && square.piece.color === mover)
                      }
                      onDragStart={(e) => handleDragStart(e, square.name as Square)}
                      onDragOver={(e) => {
                        if (isInteractive) e.preventDefault();
                      }}
                      onDrop={(e) => handleDrop(e, square.name as Square)}
                    >
                      {column === 0 ? (
                        <span className="board-rank-label" aria-hidden="true">
                          {square.rank}
                        </span>
                      ) : null}
                      {square.piece ? <Piece piece={square.piece} square={square.name} /> : null}
                      {isLegalTarget ? (
                        <span
                          className={`legal-target-dot ${square.piece ? 'legal-target-dot--capture' : ''}`}
                          aria-hidden="true"
                        />
                      ) : null}
                      {hasBadge && lastMoveBadge ? (
                        <MoveClassificationBadge quality={lastMoveBadge.quality} size="square" />
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
          {pvArrow ? <BoardArrow move={pvArrow} orientation={orientation} /> : null}
        </div>
      </div>
      <PromotionDialog
        isOpen={pendingPromotion !== null}
        color={mover}
        onSelect={handlePromotionSelect}
        onCancel={handlePromotionCancel}
      />
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
