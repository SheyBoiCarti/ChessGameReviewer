import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';
import { REVIEW_MOVE_QUALITIES, type MoveQuality } from '@/lib/engine/accuracy';

describe('MoveClassificationBadge', () => {
  it.each(REVIEW_MOVE_QUALITIES)(
    'renders accessible badge for quality %s',
    (quality: MoveQuality) => {
      render(<MoveClassificationBadge quality={quality} size="inline" />);
      const expectedLabel = `${quality.charAt(0).toUpperCase()}${quality.slice(1)} move`;
      const badge = screen.getByRole('img', { name: expectedLabel });
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveClass('move-classification-badge');
    }
  );

  it('renders accessible badge for repertoire tag', () => {
    render(<MoveClassificationBadge tag="repertoire" size="inline" />);
    const badge = screen.getByRole('img', { name: 'Repertoire move' });
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('badge-repertoire');
  });

  it('renders different size classes', () => {
    const { rerender } = render(<MoveClassificationBadge quality="brilliant" size="inline" />);
    expect(screen.getByRole('img')).toHaveClass('move-classification-badge--inline');

    rerender(<MoveClassificationBadge quality="brilliant" size="square" />);
    expect(screen.getByRole('img')).toHaveClass('move-classification-badge--square');

    rerender(<MoveClassificationBadge quality="brilliant" size="summary" />);
    expect(screen.getByRole('img')).toHaveClass('move-classification-badge--summary');
  });
});
