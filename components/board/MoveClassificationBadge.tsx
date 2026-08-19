import type React from 'react';

import { moveQualityDetails, moveTagDetails } from '@/features/stockfish-analysis/presentation';
import type { MoveQuality, MoveTag } from '@/lib/engine/accuracy';

export interface MoveClassificationBadgeProps {
  quality?: MoveQuality | undefined;
  tag?: MoveTag | undefined;
  size?: 'inline' | 'square' | 'summary' | undefined;
  ariaHidden?: boolean | undefined;
}

export function MoveClassificationBadge({
  quality,
  tag,
  size = 'inline',
  ariaHidden = false,
}: MoveClassificationBadgeProps): React.JSX.Element {
  const details = quality ? moveQualityDetails(quality) : tag ? moveTagDetails(tag) : null;
  if (!details) return <></>;

  const ariaLabel = `${details.label} move`;

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
