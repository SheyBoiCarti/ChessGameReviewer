import type React from 'react';

import { moveQualityDetails } from '@/features/stockfish-analysis/presentation';
import type { MoveQuality } from '@/lib/engine/accuracy';

export interface MoveClassificationBadgeProps {
  quality: MoveQuality;
  size?: 'inline' | 'square' | 'summary' | undefined;
  ariaHidden?: boolean | undefined;
}

export function MoveClassificationBadge({
  quality,
  size = 'inline',
  ariaHidden = false,
}: MoveClassificationBadgeProps): React.JSX.Element {
  const details = moveQualityDetails(quality);
  const ariaLabel = quality === 'book' ? 'Book move' : `${details.label} move`;

  return (
    <span
      {...(ariaHidden
        ? { 'aria-hidden': 'true' as const }
        : { role: 'img', 'aria-label': ariaLabel })}
      title={details.description}
      className={`move-classification-badge ${details.colorClass} move-classification-badge--${size}`}
    >
      <span aria-hidden="true" className="move-classification-badge__symbol">
        {details.symbol}
      </span>
    </span>
  );
}
