'use client';

import type { JSX } from 'react';

import { AppIcon } from '@/components/ui/AppIcon';

export interface MoveHistoryControlsProps {
  currentPly: number;
  totalPlies: number;
  onPlyChange(ply: number): void;
  onFlipOrientation?: (() => void) | undefined;
}

export function MoveHistoryControls({
  currentPly,
  totalPlies,
  onPlyChange,
  onFlipOrientation,
}: MoveHistoryControlsProps): JSX.Element {
  const visibleLabel =
    currentPly === 0
      ? 'Start'
      : `${Math.ceil(currentPly / 2)}${currentPly % 2 !== 0 ? '.' : '...'} / ${Math.ceil(totalPlies / 2)}`;

  return (
    <div className="move-history-controls" aria-label="Move history controls">
      <button
        type="button"
        className="move-history-controls__btn"
        aria-label="First position"
        onClick={() => onPlyChange(0)}
        disabled={currentPly === 0}
      >
        <AppIcon name="first" className="move-history-controls__icon" />
      </button>

      <button
        type="button"
        className="move-history-controls__btn"
        aria-label="Previous move"
        onClick={() => onPlyChange(Math.max(0, currentPly - 1))}
        disabled={currentPly === 0}
      >
        <AppIcon name="previous" className="move-history-controls__icon" />
      </button>

      <span
        className="move-history-controls__ply tabular-nums"
        aria-live="polite"
        aria-label={`Position ${currentPly} of ${totalPlies}`}
      >
        {visibleLabel}
      </span>

      <button
        type="button"
        className="move-history-controls__btn"
        aria-label="Next move"
        onClick={() => onPlyChange(Math.min(totalPlies, currentPly + 1))}
        disabled={currentPly >= totalPlies}
      >
        <AppIcon name="next" className="move-history-controls__icon" />
      </button>

      <button
        type="button"
        className="move-history-controls__btn"
        aria-label="Last position"
        onClick={() => onPlyChange(totalPlies)}
        disabled={currentPly >= totalPlies}
      >
        <AppIcon name="last" className="move-history-controls__icon" />
      </button>

      <button
        type="button"
        className="move-history-controls__btn move-history-controls__flip-btn"
        aria-label="Flip board"
        onClick={onFlipOrientation}
        disabled={!onFlipOrientation}
      >
        <AppIcon name="flip" className="move-history-controls__icon" />
        <span className="sr-only">Flip board</span>
      </button>
    </div>
  );
}
