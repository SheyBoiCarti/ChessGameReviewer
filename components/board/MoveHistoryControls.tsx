'use client';

import { useEffect, useRef, useState, type JSX } from 'react';

import { AppIcon } from '@/components/ui/AppIcon';

export interface MoveHistoryControlsProps {
  currentPly: number;
  totalPlies: number;
  onPlyChange(ply: number): void;
  onFlipOrientation?: (() => void) | undefined;
  autoplayIntervalMs?: number | undefined;
}

export function MoveHistoryControls({
  currentPly,
  totalPlies,
  onPlyChange,
  onFlipOrientation,
  autoplayIntervalMs = 1000,
}: MoveHistoryControlsProps): JSX.Element {
  const [isPlaying, setIsPlaying] = useState(false);
  const onPlyChangeRef = useRef(onPlyChange);

  useEffect(() => {
    onPlyChangeRef.current = onPlyChange;
  }, [onPlyChange]);

  useEffect(() => {
    if (!isPlaying) return;

    if (currentPly >= totalPlies) {
      setIsPlaying(false);
      return;
    }

    const timer = setInterval(() => {
      onPlyChangeRef.current(currentPly + 1);
    }, autoplayIntervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, currentPly, totalPlies, autoplayIntervalMs]);

  useEffect(() => {
    if (isPlaying && currentPly >= totalPlies) {
      setIsPlaying(false);
    }
  }, [currentPly, totalPlies, isPlaying]);

  const handleFirst = () => {
    setIsPlaying(false);
    onPlyChange(0);
  };

  const handlePrevious = () => {
    setIsPlaying(false);
    onPlyChange(Math.max(0, currentPly - 1));
  };

  const handleToggleAutoplay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (currentPly >= totalPlies) {
        onPlyChange(0);
      }
      setIsPlaying(true);
    }
  };

  const handleNext = () => {
    setIsPlaying(false);
    onPlyChange(Math.min(totalPlies, currentPly + 1));
  };

  const handleLast = () => {
    setIsPlaying(false);
    onPlyChange(totalPlies);
  };

  const visibleLabel =
    currentPly === 0
      ? 'Start'
      : `${Math.ceil(currentPly / 2)}${currentPly % 2 !== 0 ? '.' : '...'} / ${Math.ceil(totalPlies / 2)}`;

  return (
    <div className="move-history-controls" aria-label="Move history controls">
      <div
        className="move-history-controls__group"
        role="group"
        aria-label="Move playback controls"
      >
        <button
          type="button"
          className="move-history-controls__btn"
          aria-label="First position"
          title="First move"
          onClick={handleFirst}
          disabled={currentPly === 0}
        >
          <AppIcon name="first" className="move-history-controls__icon" />
        </button>

        <button
          type="button"
          className="move-history-controls__btn"
          aria-label="Previous move"
          title="Previous move"
          onClick={handlePrevious}
          disabled={currentPly === 0}
        >
          <AppIcon name="previous" className="move-history-controls__icon" />
        </button>

        <button
          type="button"
          className={`move-history-controls__btn move-history-controls__btn--autoplay${isPlaying ? ' is-playing' : ''}`}
          aria-label={isPlaying ? 'Pause' : 'Autoplay'}
          title={isPlaying ? 'Pause' : 'Autoplay'}
          onClick={handleToggleAutoplay}
          disabled={totalPlies === 0}
        >
          <AppIcon name={isPlaying ? 'pause' : 'play'} className="move-history-controls__icon" />
        </button>

        <button
          type="button"
          className="move-history-controls__btn"
          aria-label="Next move"
          title="Next move"
          onClick={handleNext}
          disabled={currentPly >= totalPlies}
        >
          <AppIcon name="next" className="move-history-controls__icon" />
        </button>

        <button
          type="button"
          className="move-history-controls__btn"
          aria-label="Last position"
          title="Last move"
          onClick={handleLast}
          disabled={currentPly >= totalPlies}
        >
          <AppIcon name="last" className="move-history-controls__icon" />
        </button>
      </div>

      <span
        className="move-history-controls__ply tabular-nums"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`Position ${currentPly} of ${totalPlies}`}
      >
        {visibleLabel}
      </span>

      <button
        type="button"
        className="move-history-controls__btn move-history-controls__flip-btn"
        aria-label="Flip board"
        title="Flip board"
        onClick={onFlipOrientation}
        disabled={!onFlipOrientation}
      >
        <AppIcon name="flip" className="move-history-controls__icon" />
        <span className="sr-only">Flip board</span>
      </button>
    </div>
  );
}
