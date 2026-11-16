'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import type { Square } from 'chess.js';

import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';
import { Piece } from '@/components/board/Piece';
import { getBoardTransitionMoves, type AnimationPosition } from '@/features/board/animation';
import { PromotionDialog } from '@/components/board/PromotionDialog';
import {
  applyBoardMove,
  legalDestinations,
  promotionRequired,
  type AppliedBoardMove,
  type PromotionPiece,
} from '@/features/board/moves';
import { boardSquares, InvalidBoardPositionError } from '@/features/board/position';
import type { OpeningArrow } from '@/features/opening-tree/selectors';
import type { PlayerMetadata } from '@/lib/api/contracts';
import type { MoveQuality } from '@/lib/engine/accuracy';
import {
  parseFenSideToMove,
  type EvaluationScore,
  type PlayerColor,
} from '@/lib/engine/evaluation';

import { EvaluationBar } from './EvaluationBar';
import { MoveHistoryControls } from './MoveHistoryControls';
import { PlayerStrip } from './PlayerStrip';

export interface MoveHistoryModel {
  currentPly: number;
  totalPlies: number;
  onPlyChange(ply: number): void;
}

export interface ChessboardViewProps {
  fen: string;
  orientation: 'white' | 'black';
  isInteractive?: boolean | undefined;
  /** Keep square focus navigation available when opening piece input is disabled. */
  squareNavigation?: boolean | undefined;
  onMove?: ((move: AppliedBoardMove) => boolean) | undefined;
  lastMove?: { from: Square; to: Square } | undefined;
  lastMoveBadge?: { square: Square; quality: MoveQuality } | undefined;
  pvArrow?: { from: Square; to: Square } | undefined;
  openingArrows?: readonly OpeningArrow[] | undefined;
  history?: MoveHistoryModel | undefined;
  evaluationScore?: EvaluationScore | undefined;
  currentPly?: number | undefined;
  totalPlies?: number | undefined;
  onPlyChange?: ((ply: number) => void) | undefined;
  selectedSquare?: string | undefined;
  players?:
    | {
        white: PlayerMetadata;
        black: PlayerMetadata;
      }
    | undefined;
  onFlipOrientation?: (() => void) | undefined;
}

export function ChessboardView({
  fen,
  orientation,
  isInteractive = false,
  squareNavigation = isInteractive,
  onMove,
  lastMove,
  lastMoveBadge,
  pvArrow,
  openingArrows,
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
  const isMobile = useIsMobile();

  useEffect(() => {
    setSelectedSquare(null);
    setFocusedSquare(null);
    setLegalTargets([]);
    setPendingPromotion(null);
    setAnnouncement('');
  }, [fen, orientation, isInteractive]);

  const previousPositionRef = useRef<
    (AnimationPosition & { orientation: 'white' | 'black' }) | null
  >(null);
  const moveFrom = lastMove?.from;
  const moveTo = lastMove?.to;

  useLayoutEffect(() => {
    const previous = previousPositionRef.current;
    const next = {
      fen,
      orientation,
      lastMove: moveFrom && moveTo ? { from: moveFrom, to: moveTo } : undefined,
    };
    previousPositionRef.current = next;
    if (
      !previous ||
      previous.fen === fen ||
      previous.orientation !== orientation ||
      prefersReducedMotion()
    ) {
      return;
    }

    const cleanups: Array<() => void> = [];
    for (const move of getBoardTransitionMoves(previous, next)) {
      const squareEl = boardRef.current?.querySelector<HTMLElement>(`[data-square="${move.to}"]`);
      const pieceEl = squareEl?.querySelector<HTMLElement>('.chess-piece');
      if (!squareEl || !pieceEl || typeof pieceEl.animate !== 'function') continue;

      const { deltaX, deltaY } = calculateMoveDelta(move.from, move.to, orientation);
      squareEl.style.zIndex = '10';
      pieceEl.style.willChange = 'transform';
      const animation = pieceEl.animate(
        [
          { transform: `translate3d(${deltaX}%, ${deltaY}%, 0)` },
          { transform: 'translate3d(0, 0, 0)' },
        ],
        { duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }
      );
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        animation.cancel();
        squareEl.style.zIndex = '';
        pieceEl.style.willChange = '';
      };
      // Animation completion follows its real start, including delayed frames.
      // Cancellation is handled too, without allowing an old promise to clear
      // styles belonging to a newer transition.
      void animation.finished.then(cleanup, cleanup);
      cleanups.push(cleanup);
    }
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [fen, orientation, moveFrom, moveTo]);

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
    const target = event.target instanceof Element ? event.target : null;
    if (
      event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      pendingPromotion ||
      target?.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="dialog"]'
      ) ||
      document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')
    ) {
      return;
    }

    if (event.key === 'Escape') {
      if (selectedSquare) {
        event.preventDefault();
        setSelectedSquare(null);
        setLegalTargets([]);
        setAnnouncement('Selection cleared.');
      }
      return;
    }

    // T39: inside the board, Alt+Left/Right traverses history; plain arrows
    // retain square navigation. Editable fields and dialogs never see this.
    if (event.altKey) {
      if (historyModel && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        const next =
          event.key === 'ArrowLeft'
            ? Math.max(0, historyModel.currentPly - 1)
            : Math.min(historyModel.totalPlies, historyModel.currentPly + 1);
        historyModel.onPlyChange(next);
      }
      return;
    }

    if (squareNavigation && !event.altKey) {
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
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        const next = offsetSquare(current, -fileStep, 0);
        setFocusedSquare(next);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        const next = offsetSquare(current, fileStep, 0);
        setFocusedSquare(next);
        return;
      }
      if (isInteractive && (event.key === 'Enter' || event.key === ' ')) {
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
      {players ? (
        <PlayerStrip
          color={topColor}
          player={topPlayer ?? { username: null, rating: null }}
          position="top"
        />
      ) : null}
      <div className="board-region">
        <div className={`board-stage${evaluationScore ? ' board-stage--with-evaluation' : ''}`}>
          {evaluationScore && !isMobile ? (
            <EvaluationBar score={evaluationScore} orientation={orientation} mode="vertical" />
          ) : !isMobile ? (
            <div className="evaluation-bar-placeholder" aria-hidden="true" />
          ) : null}
          <div className="chessboard-frame">
            <div
              ref={boardRef}
              className="chessboard"
              role="grid"
              aria-label="Chess board"
              data-orientation={orientation}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              aria-activedescendant={focusedSquare ? `square-${focusedSquare}` : undefined}
              aria-describedby={
                squareNavigation
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
                        id={`square-${square.name}`}
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
            {openingArrows && openingArrows.length > 0 ? (
              <OpeningArrows arrows={openingArrows} orientation={orientation} />
            ) : null}
            {pvArrow ? <BoardArrow move={pvArrow} orientation={orientation} /> : null}
          </div>
          {isMobile ? (
            evaluationScore ? (
              <EvaluationBar score={evaluationScore} orientation={orientation} mode="horizontal" />
            ) : (
              <div className="evaluation-bar-placeholder" aria-hidden="true" />
            )
          ) : null}
        </div>
        <PromotionDialog
          isOpen={pendingPromotion !== null}
          color={mover}
          onSelect={handlePromotionSelect}
          onCancel={handlePromotionCancel}
        />
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announcement}
        </div>
        <p id="board-keyboard-interactive-help" className="sr-only">
          Use Arrow keys to navigate squares across files and ranks.{' '}
          {isInteractive
            ? 'Press Enter or Space to select a piece and choose a legal destination. Press Escape to clear selection. '
            : 'Piece input is disabled at this position. '}
          Press Alt+ArrowLeft or Alt+ArrowRight to navigate history; Home and End also move through
          history.
        </p>
      </div>
      {players ? (
        <PlayerStrip
          color={bottomColor}
          player={bottomPlayer ?? { username: null, rating: null }}
          position="bottom"
        />
      ) : null}
      {historyModel || onFlipOrientation ? (
        <div className="board-playback-row">
          <p id="board-keyboard-help" className="sr-only">
            Use Left and Right Arrow to move through history. Home returns to the first position and
            End moves to the last.
          </p>
          {historyModel ? (
            <MoveHistoryControls
              currentPly={historyModel?.currentPly ?? 0}
              totalPlies={historyModel?.totalPlies ?? 0}
              onPlyChange={historyModel?.onPlyChange ?? (() => {})}
              onFlipOrientation={onFlipOrientation}
            />
          ) : (
            <button type="button" className="button-secondary" onClick={onFlipOrientation}>
              Flip board
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export interface ArrowPathResult {
  d: string;
  isKnight: boolean;
  shortenedTo: { x: number; y: number };
  corner?: { x: number; y: number };
}

export function computeArrowPath(
  from: { x: number; y: number; col: number; row: number },
  to: { x: number; y: number; col: number; row: number }
): ArrowPathResult {
  const deltaCol = to.col - from.col;
  const deltaRow = to.row - from.row;
  const absCol = Math.abs(deltaCol);
  const absRow = Math.abs(deltaRow);
  const isKnight = (absCol === 1 && absRow === 2) || (absCol === 2 && absRow === 1);

  if (isKnight) {
    const cornerX = absRow > absCol ? from.x : to.x;
    const cornerY = absRow > absCol ? to.y : from.y;
    const legDx = to.x - cornerX;
    const legDy = to.y - cornerY;
    const legDist = Math.hypot(legDx, legDy);
    const shortenedToX = legDist > 0 ? to.x - (legDx / legDist) * 48 : to.x;
    const shortenedToY = legDist > 0 ? to.y - (legDy / legDist) * 48 : to.y;
    return {
      d: `M ${from.x},${from.y} L ${cornerX},${cornerY} L ${shortenedToX},${shortenedToY}`,
      isKnight: true,
      corner: { x: cornerX, y: cornerY },
      shortenedTo: { x: shortenedToX, y: shortenedToY },
    };
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  const shortenedToX = d > 0 ? to.x - (dx / d) * 48 : to.x;
  const shortenedToY = d > 0 ? to.y - (dy / d) * 48 : to.y;
  return {
    d: `M ${from.x},${from.y} L ${shortenedToX},${shortenedToY}`,
    isKnight: false,
    shortenedTo: { x: shortenedToX, y: shortenedToY },
  };
}

function getOpeningArrowColor(arrow: OpeningArrow): string {
  if (arrow.active) return '#0284c7';
  const palette = arrow.palette ?? 'neutral';
  if (palette === 'own') {
    if (arrow.band === 'strong') return '#16a34a';
    if (arrow.band === 'medium') return '#22c55e';
    return '#86efac';
  }
  if (palette === 'opponent') {
    if (arrow.band === 'strong') return '#ea580c';
    if (arrow.band === 'medium') return '#f97316';
    return '#fdba74';
  }
  if (arrow.band === 'strong') return '#2563eb';
  if (arrow.band === 'medium') return '#3b82f6';
  return '#93c5fd';
}

function BoardArrow({
  move,
  orientation,
}: {
  move: { from: string; to: string };
  orientation: 'white' | 'black';
}) {
  const prefix = useId();
  const from = squareCenter(move.from, orientation);
  const to = squareCenter(move.to, orientation);
  if (!from || !to) return null;
  const markerId = `${prefix}-pv-arrow-head`;
  const { d } = computeArrowPath(from, to);
  const color = 'rgb(255 170 0 / 78%)';

  return (
    <svg
      className="board-arrow"
      viewBox="0 0 2048 2048"
      aria-label={`Principal variation ${move.from} to ${move.to}`}
      role="img"
      pointerEvents="none"
    >
      <defs>
        <marker
          id={markerId}
          markerWidth="2"
          markerHeight="2.5"
          refX="1.25"
          refY="1.25"
          orient="auto"
        >
          <polygon points="0.3 0, 2 1.25, 0.3 2.5" fill={color} />
        </marker>
      </defs>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={51.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={`url(#${markerId})`}
      />
    </svg>
  );
}

function OpeningArrows({
  arrows,
  orientation,
}: {
  arrows: readonly OpeningArrow[];
  orientation: 'white' | 'black';
}) {
  const prefix = useId();
  if (arrows.length === 0) return null;

  return (
    <svg className="opening-arrows" viewBox="0 0 2048 2048" pointerEvents="none" aria-hidden="true">
      <defs>
        {arrows.map((arrow) => {
          const markerId = `${prefix}-${arrow.uci}-arrow`;
          const color = getOpeningArrowColor(arrow);
          return (
            <marker
              key={arrow.uci}
              id={markerId}
              markerWidth="2"
              markerHeight="2.5"
              refX="1.25"
              refY="1.25"
              orient="auto"
            >
              <polygon
                points="0.3 0, 2 1.25, 0.3 2.5"
                fill={color}
                className={`arrow-head arrow-head--${arrow.band} arrow-head--${arrow.palette ?? 'neutral'} ${arrow.active ? 'arrow-head--active' : ''}`}
              />
            </marker>
          );
        })}
      </defs>
      {arrows.map((arrow) => {
        const from = squareCenter(arrow.from, orientation);
        const to = squareCenter(arrow.to, orientation);
        if (!from || !to) return null;
        const markerId = `${prefix}-${arrow.uci}-arrow`;
        const { d } = computeArrowPath(from, to);
        const color = getOpeningArrowColor(arrow);

        return (
          <path
            key={arrow.uci}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={51.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={`url(#${markerId})`}
            className={`opening-arrow opening-arrow--${arrow.band} opening-arrow--${arrow.palette ?? 'neutral'} ${arrow.active ? 'opening-arrow--active' : ''}`}
          />
        );
      })}
    </svg>
  );
}

export function squareCenter(square: string, orientation: 'white' | 'black') {
  if (!/^[a-h][1-8]$/.test(square)) return null;
  const fileIndex = square.charCodeAt(0) - 97;
  const rankIndex = Number(square[1]) - 1;
  const col = orientation === 'white' ? fileIndex : 7 - fileIndex;
  const row = orientation === 'white' ? 7 - rankIndex : rankIndex;
  const x = col * 256 + 128;
  const y = row * 256 + 128;
  return { x, y, col, row };
}

export function calculateMoveDelta(
  from: Square,
  to: Square,
  orientation: 'white' | 'black'
): { deltaX: number; deltaY: number } {
  const fromFile = from.charCodeAt(0) - 97;
  const fromRank = Number(from[1]) - 1;
  const toFile = to.charCodeAt(0) - 97;
  const toRank = Number(to[1]) - 1;

  const fromCol = orientation === 'white' ? fromFile : 7 - fromFile;
  const fromRow = orientation === 'white' ? 7 - fromRank : fromRank;
  const toCol = orientation === 'white' ? toFile : 7 - toFile;
  const toRow = orientation === 'white' ? 7 - toRank : toRank;

  const deltaX = (fromCol - toCol) * 100;
  const deltaY = (fromRow - toRow) * 100;

  return { deltaX, deltaY };
}

export { getCastlingRookMove } from '@/features/board/animation';

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia === 'function') {
      const media = window.matchMedia('(width < 768px)');
      const update = () => setIsMobile(media.matches);
      update();
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return isMobile;
}
