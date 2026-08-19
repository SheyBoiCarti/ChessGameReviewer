'use client';

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
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
import type { PlayerMetadata } from '@/lib/api/contracts';
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
  players?: {
    white: PlayerMetadata;
    black: PlayerMetadata;
  } | undefined;
  onFlipOrientation?: (() => void) | undefined;
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
  players,
  onFlipOrientation,
}: ChessboardViewProps) {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [focusedSquare, setFocusedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<readonly Square[]>([]);
  const [announcement, setAnnouncement] = useState<string>('');
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: Square;
    to: Square;
  } | null>(null);

  const boardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelectedSquare(null);
    setFocusedSquare(null);
    setLegalTargets([]);
    setPendingPromotion(null);
    setAnnouncement('');
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

  const activeSelectedSquare = (controlledSelectedSquare as Square | undefined) ?? selectedSquare;

  const executeMove = (from: Square, to: Square, promotion?: PromotionPiece) => {
    if (promotionRequired(fen, { from, to }) && !promotion) {
      setPendingPromotion({ from, to });
      return;
    }

    const move = applyBoardMove(fen, { from, to, ...(promotion ? { promotion } : {}) });
    if (move) {
      const accepted = onMove?.(move);
      if (accepted !== false) {
        setSelectedSquare(null);
        setLegalTargets([]);
        setFocusedSquare(to);
        setAnnouncement(`Played ${move.san}.`);
      }
    }
  };

  const handleSquareClick = (squareName: Square) => {
    if (!isInteractive) return;

    setFocusedSquare(squareName);
    const squareObj = squares.find((s) => s.name === squareName);
    const piece = squareObj?.piece;

    if (selectedSquare) {
      if (squareName === selectedSquare) {
        setSelectedSquare(null);
        setLegalTargets([]);
        setAnnouncement('Selection cleared.');
        return;
      }

      if (legalTargets.includes(squareName)) {
        executeMove(selectedSquare, squareName);
        return;
      }

      if (piece && piece.color === mover) {
        const destinations = legalDestinations(fen, squareName);
        setSelectedSquare(squareName);
        setLegalTargets(destinations);
        setAnnouncement(
          `Selected ${squareName}. ${destinations.length} legal destinations: ${destinations.join(', ')}.`
        );
        return;
      }

      setSelectedSquare(null);
      setLegalTargets([]);
      setAnnouncement('Selection cleared.');
    } else {
      if (piece && piece.color === mover) {
        const destinations = legalDestinations(fen, squareName);
        setSelectedSquare(squareName);
        setLegalTargets(destinations);
        setAnnouncement(
          `Selected ${squareName}. ${destinations.length} legal destinations: ${destinations.join(', ')}.`
        );
      }
    }
  };

  const offsetSquare = (current: Square, deltaFile: number, deltaRank: number): Square => {
    const file = current.charCodeAt(0) - 97;
    const rank = Number(current[1]) - 1;
    const newFile = Math.max(0, Math.min(7, file + deltaFile));
    const newRank = Math.max(0, Math.min(7, rank + deltaRank));
    return `${String.fromCharCode(97 + newFile)}${newRank + 1}` as Square;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (selectedSquare) {
        event.preventDefault();
        setSelectedSquare(null);
        setLegalTargets([]);
        setAnnouncement('Selection cleared.');
      }
      return;
    }

    if (isInteractive) {
      const current = focusedSquare ?? (orientation === 'white' ? 'e2' : 'e7');
      const fileStep = orientation === 'white' ? 1 : -1;
      const rankStep = orientation === 'white' ? 1 : -1;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        const next = offsetSquare(current, 0, rankStep);
        setFocusedSquare(next);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        const next = offsetSquare(current, 0, -rankStep);
        setFocusedSquare(next);
        return;
      }
      if (event.key === 'ArrowLeft' && selectedSquare !== null) {
        event.preventDefault();
        const next = offsetSquare(current, -fileStep, 0);
        setFocusedSquare(next);
        return;
      }
      if (event.key === 'ArrowRight' && selectedSquare !== null) {
        event.preventDefault();
        const next = offsetSquare(current, fileStep, 0);
        setFocusedSquare(next);
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleSquareClick(current);
        return;
      }
    }

    if (historyModel && selectedSquare === null) {
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
    }
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>, squareName: Square) => {
    if (!isInteractive) return;
    const squareObj = squares.find((s) => s.name === squareName);
    if (!squareObj?.piece || squareObj.piece.color !== mover) return;
    e.dataTransfer.setData('text/plain', squareName);
    setSelectedSquare(squareName);
    setFocusedSquare(squareName);
    setLegalTargets(legalDestinations(fen, squareName));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, targetSquare: Square) => {
    if (!isInteractive) return;
    e.preventDefault();
    const from = e.dataTransfer.getData('text/plain') as Square;
    if (!from || from === targetSquare) return;
    executeMove(from, targetSquare);
  };

  const handlePromotionSelect = (promotion: PromotionPiece) => {
    if (pendingPromotion) {
      executeMove(pendingPromotion.from, pendingPromotion.to, promotion);
      setPendingPromotion(null);
    }
  };

  const handlePromotionCancel = () => {
    setPendingPromotion(null);
  };

  const topColor = orientation === 'white' ? 'black' : 'white';
  const bottomColor = orientation === 'white' ? 'white' : 'black';
  const topPlayer = orientation === 'white' ? players?.black : players?.white;
  const bottomPlayer = orientation === 'white' ? players?.white : players?.black;

  return (
    <div className="board-shell">
      {onFlipOrientation ? (
        <div className="board-toolbar">
          <button
            type="button"
            className="board-toolbar__flip-button"
            onClick={onFlipOrientation}
            aria-label="Flip board orientation"
          >
            Flip board
          </button>
        </div>
      ) : null}
      {players ? <PlayerRow color={topColor} player={topPlayer} position="top" /> : null}
      <div className="board-region">
        <div className={`board-stage${evaluationScore ? ' board-stage--with-evaluation' : ''}`}>
          {evaluationScore ? <EvaluationBar score={evaluationScore} /> : null}
          <div className="chessboard-frame">
            <div
              ref={boardRef}
              className="chessboard"
              role="grid"
              aria-label="Chess board"
              data-orientation={orientation}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              aria-describedby={
                isInteractive
                  ? 'board-keyboard-interactive-help'
                  : historyModel
                    ? 'board-keyboard-help'
                    : undefined
              }
            >
              {Array.from({ length: 8 }, (_, row) => (
                <div className="board-row" role="row" key={row}>
                  {squares.slice(row * 8, row * 8 + 8).map((square, column) => {
                    const isSelected = square.name === activeSelectedSquare;
                    const isHighlighted =
                      isSelected || square.name === lastMove?.from || square.name === lastMove?.to;
                    const isLegalTarget = legalTargets.includes(square.name as Square);
                    const isFocused = square.name === focusedSquare;
                    const hasBadge = Boolean(lastMoveBadge && lastMoveBadge.square === square.name);

                    return (
                      <div
                        className={`board-square ${square.isLight ? 'square-light' : 'square-dark'}${isHighlighted ? ' square-highlighted' : ''}${isSelected ? ' square-selected' : ''}${isFocused ? ' square-focused' : ''}`}
                        role="gridcell"
                        aria-label={square.name}
                        aria-selected={isSelected}
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
        {announcement ? (
          <span className="sr-only" role="status" aria-live="polite">
            {announcement}
          </span>
        ) : null}
        <p id="board-keyboard-interactive-help" className="sr-only">
          Use Arrow keys to navigate squares. Press Enter or Space to select a piece and choose a
          legal destination. Press Escape to clear selection. Left and Right Arrow navigate history
          when no piece is selected.
        </p>
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
      {players ? <PlayerRow color={bottomColor} player={bottomPlayer} position="bottom" /> : null}
    </div>
  );
}

function PlayerRow({
  color,
  player,
  position,
}: {
  color: 'white' | 'black';
  player: PlayerMetadata | undefined;
  position: 'top' | 'bottom';
}) {
  const colorLabel = color === 'white' ? 'White' : 'Black';
  const defaultName = `${colorLabel} player`;
  const name = player?.username?.trim() || defaultName;
  const rating =
    player?.rating !== null && player?.rating !== undefined ? `(${player.rating})` : null;

  return (
    <div
      className={`player-row player-row--${position} player-row--${color}`}
      aria-label={`${colorLabel}: ${name}${rating ? ` ${rating}` : ''}`}
    >
      <div className="player-row__info">
        <span
          className={`player-row__color-indicator player-row__color-indicator--${color}`}
          aria-hidden="true"
        />
        <span className="player-row__name">{name}</span>
        {rating ? <span className="player-row__rating">{rating}</span> : null}
      </div>
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
