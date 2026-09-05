'use client';

import type React from 'react';
import type { OutcomeBreakdown, OutcomePerspective } from '@/features/opening-tree/selectors';

export interface OutcomeBarProps {
  breakdown: OutcomeBreakdown;
  perspective: OutcomePerspective;
}

export function OutcomeBar({ breakdown, perspective }: OutcomeBarProps): React.JSX.Element {
  if (breakdown.sampleSize === 0) {
    return (
      <div className="outcome-bar-wrapper" role="img" aria-label="No games">
        <div className="outcome-bar outcome-bar--empty" />
        <span className="outcome-bar__label">No games</span>
      </div>
    );
  }

  const { wins, draws, losses, sampleSize, winRate, drawRate, lossRate } = breakdown;
  const winFraction = winRate ?? 0;
  const drawFraction = drawRate ?? 0;
  const lossFraction = lossRate ?? 0;

  const winPercent = winFraction * 100;
  const drawPercent = drawFraction * 100;
  const lossPercent = lossFraction * 100;

  const winLabel = Math.round(winPercent);
  const drawLabel = Math.round(drawPercent);
  const lossLabel = Math.round(lossPercent);

  const accessibleLabel =
    perspective === 'user'
      ? `User wins ${wins}, draws ${draws}, losses ${losses}, from ${sampleSize} games`
      : `White wins ${wins}, draws ${draws}, Black wins ${losses}, from ${sampleSize} games`;

  return (
    <div className="outcome-bar-wrapper" role="img" aria-label={accessibleLabel}>
      <div className={`outcome-bar outcome-bar--${perspective}`}>
        {winPercent > 0 ? (
          <div
            className="outcome-bar__segment outcome-bar__segment--win"
            style={{ width: `${winPercent}%` }}
            data-testid="outcome-segment-win"
          />
        ) : null}
        {drawPercent > 0 ? (
          <div
            className="outcome-bar__segment outcome-bar__segment--draw"
            style={{ width: `${drawPercent}%` }}
            data-testid="outcome-segment-draw"
          />
        ) : null}
        {lossPercent > 0 ? (
          <div
            className="outcome-bar__segment outcome-bar__segment--loss"
            style={{ width: `${lossPercent}%` }}
            data-testid="outcome-segment-loss"
          />
        ) : null}
      </div>
      <span className="outcome-bar__label">
        {winLabel}% / {drawLabel}% / {lossLabel}%
      </span>
    </div>
  );
}
