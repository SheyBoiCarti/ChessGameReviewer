'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Chessboard } from 'react-chessboard';
import type {
  PieceDropHandlerArgs,
  PieceHandlerArgs,
  PieceRenderObject,
  SquareHandlerArgs,
  SquareRenderer,
} from 'react-chessboard';
import type { Square } from 'chess.js';

import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';
import { PromotionDialog } from '@/components/board/PromotionDialog';
import {
  applyBoardMove,
  legalDestinations,
  promotionRequired,
  type AppliedBoardMove,
  type PromotionPiece,
} from '@/features/board/moves';
import type { MoveQuality } from '@/lib/engine/accuracy';
import { parseFenSideToMove, type PlayerColor } from '@/lib/engine/evaluation';

export interface InteractiveChessboardProps {
  fen: string;
  orientation: 'white' | 'black';
  isInteractive?: boolean;
  onMove?(move: AppliedBoardMove): boolean;
  lastMove?: { from: Square; to: Square };
  lastMoveBadge?: { square: Square; quality: MoveQuality };
  pvArrow?: { from: Square; to: Square };
  onSelectionChange?(selection: {
    selectedSquare: Square | null;
    legalTargets: readonly Square[];
  }): void;
}

const localPieceRenderers: PieceRenderObject = {
  wP: () => (
    <img
      className="chess-piece piece-white"
      src="/chess-pieces/wp.svg"
      alt=""
      draggable={false}
    />
  ),
  wN: () => (
    <img
      className="chess-piece piece-white"
      src="/chess-pieces/wn.svg"
      alt=""
      draggable={false}
    />
  ),
  wB: () => (
    <img
      className="chess-piece piece-white"
      src="/chess-pieces/wb.svg"
      alt=""
      draggable={false}
    />
  ),
  wR: () => (
    <img
      className="chess-piece piece-white"
      src="/chess-pieces/wr.svg"
      alt=""
      draggable={false}
    />
  ),
  wQ: () => (
    <img
      className="chess-piece piece-white"
      src="/chess-pieces/wq.svg"
      alt=""
      draggable={false}
    />
  ),
  wK: () => (
    <img
      className="chess-piece piece-white"
      src="/chess-pieces/wk.svg"
      alt=""
      draggable={false}
    />
  ),
  bP: () => (
    <img
      className="chess-piece piece-black"
      src="/chess-pieces/bp.svg"
      alt=""
      draggable={false}
    />
  ),
  bN: () => (
    <img
      className="chess-piece piece-black"
      src="/chess-pieces/bn.svg"
      alt=""
      draggable={false}
    />
  ),
  bB: () => (
    <img
      className="chess-piece piece-black"
      src="/chess-pieces/bb.svg"
      alt=""
      draggable={false}
    />
  ),
  bR: () => (
    <img
      className="chess-piece piece-black"
      src="/chess-pieces/br.svg"
      alt=""
      draggable={false}
    />
  ),
  bQ: () => (
    <img
      className="chess-piece piece-black"
      src="/chess-pieces/bq.svg"
      alt=""
      draggable={false}
    />
  ),
  bK: () => (
    <img
      className="chess-piece piece-black"
      src="/chess-pieces/bk.svg"
      alt=""
      draggable={false}
    />
  ),
};

export function InteractiveChessboard({
  fen,
  orientation,
  isInteractive = false,
  onMove,
  lastMove,
  lastMoveBadge,
  pvArrow,
  onSelectionChange,
}: InteractiveChessboardProps): React.JSX.Element {
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
    onSelectionChange?.({ selectedSquare: null, legalTargets: [] });
  }, [fen, orientation, isInteractive, onSelectionChange]);

  let mover: PlayerColor = 'white';
  try {
    mover = parseFenSideToMove(fen);
  } catch {
    mover = 'white';
  }

  const canDragPiece = ({ piece }: PieceHandlerArgs): boolean => {
    if (!isInteractive) return false;
    const pieceColor = piece.pieceType.startsWith('w') ? 'white' : 'black';
    return pieceColor === mover;
  };

  const handleSquareClick = ({ square, piece }: SquareHandlerArgs) => {
    if (!isInteractive) return;
    const sq = square as Square;

    if (selectedSquare) {
      if (sq === selectedSquare) {
        setSelectedSquare(null);
        setLegalTargets([]);
        onSelectionChange?.({ selectedSquare: null, legalTargets: [] });
        return;
      }

      if (legalTargets.includes(sq)) {
        if (promotionRequired(fen, { from: selectedSquare, to: sq })) {
          setPendingPromotion({ from: selectedSquare, to: sq });
          return;
        }

        const move = applyBoardMove(fen, { from: selectedSquare, to: sq });
        if (move) {
          const accepted = onMove?.(move);
          if (accepted !== false) {
            setSelectedSquare(null);
            setLegalTargets([]);
            onSelectionChange?.({ selectedSquare: null, legalTargets: [] });
          }
        }
        return;
      }

      if (piece) {
        const pieceColor = piece.pieceType.startsWith('w') ? 'white' : 'black';
        if (pieceColor === mover) {
          const destinations = legalDestinations(fen, sq);
          setSelectedSquare(sq);
          setLegalTargets(destinations);
          onSelectionChange?.({ selectedSquare: sq, legalTargets: destinations });
          return;
        }
      }

      setSelectedSquare(null);
      setLegalTargets([]);
      onSelectionChange?.({ selectedSquare: null, legalTargets: [] });
    } else {
      if (piece) {
        const pieceColor = piece.pieceType.startsWith('w') ? 'white' : 'black';
        if (pieceColor === mover) {
          const destinations = legalDestinations(fen, sq);
          setSelectedSquare(sq);
          setLegalTargets(destinations);
          onSelectionChange?.({ selectedSquare: sq, legalTargets: destinations });
        }
      }
    }
  };

  const handlePieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean => {
    if (!isInteractive || !targetSquare || sourceSquare === targetSquare) return false;
    const from = sourceSquare as Square;
    const to = targetSquare as Square;

    if (promotionRequired(fen, { from, to })) {
      setPendingPromotion({ from, to });
      return false;
    }

    const move = applyBoardMove(fen, { from, to });
    if (!move) return false;

    const accepted = onMove?.(move);
    if (accepted === false) return false;

    setSelectedSquare(null);
    setLegalTargets([]);
    onSelectionChange?.({ selectedSquare: null, legalTargets: [] });
    return true;
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
      onSelectionChange?.({ selectedSquare: null, legalTargets: [] });
    }
  };

  const handlePromotionCancel = () => {
    setPendingPromotion(null);
  };

  const squareStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    squareStyles[lastMove.from] = {
      backgroundColor: 'rgba(242, 193, 78, 0.3)',
    };
    squareStyles[lastMove.to] = {
      backgroundColor: 'rgba(242, 193, 78, 0.4)',
    };
  }
  if (selectedSquare) {
    squareStyles[selectedSquare] = {
      backgroundColor: 'rgba(45, 212, 191, 0.4)',
    };
  }

  const squareRenderer: SquareRenderer = ({ piece, square, children }: SquareHandlerArgs & { children?: ReactNode }) => {
    const isLegalTarget = legalTargets.includes(square as Square);
    const isBadgeSquare = lastMoveBadge?.square === square;

    return (
      <div
        className="chessboard-square-wrapper"
        data-square-coord={square}
        style={{ position: 'relative', width: '100%', height: '100%' }}
      >
        {children}
        {isLegalTarget ? (
          <span
            className={`legal-target-dot ${piece ? 'legal-target-dot--capture' : ''}`}
            aria-hidden="true"
          />
        ) : null}
        {isBadgeSquare ? (
          <MoveClassificationBadge quality={lastMoveBadge.quality} size="square" />
        ) : null}
      </div>
    );
  };

  return (
    <>
      <div aria-hidden="true" className="interactive-chessboard">
        <Chessboard
          options={{
            id: 'analysis-board',
            position: fen,
            boardOrientation: orientation,
            pieces: localPieceRenderers,
            squareStyles,
            arrows: pvArrow
              ? [
                  {
                    startSquare: pvArrow.from,
                    endSquare: pvArrow.to,
                    color: 'var(--accent-gold, #f2c14e)',
                  },
                ]
              : [],
            squareRenderer,
            allowDragging: isInteractive,
            allowDragOffBoard: false,
            allowDrawingArrows: false,
            canDragPiece,
            onSquareClick: handleSquareClick,
            onPieceDrop: handlePieceDrop,
          }}
        />
      </div>
      <PromotionDialog
        isOpen={pendingPromotion !== null}
        color={mover}
        onSelect={handlePromotionSelect}
        onCancel={handlePromotionCancel}
      />
    </>
  );
}
