import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';

describe('WorkspaceTabs', () => {
  it('follows the WAI-ARIA arrow, Home, and End keyboard pattern between Review and Analysis', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(<WorkspaceTabs selected="review" onSelect={onSelect} />);

    const review = screen.getByRole('tab', { name: /^review/i });
    review.focus();
    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenLastCalledWith('analysis');

    rerender(<WorkspaceTabs selected="analysis" onSelect={onSelect} />);
    const analysis = screen.getByRole('tab', { name: /^analysis/i });
    analysis.focus();
    await user.keyboard('{Home}');
    expect(onSelect).toHaveBeenLastCalledWith('review');
    await user.keyboard('{End}');
    expect(onSelect).toHaveBeenLastCalledWith('analysis');
  });

  it('exposes selected state and associated panel ids for Review and Analysis', () => {
    render(<WorkspaceTabs selected="analysis" onSelect={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /^analysis/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: /^analysis/i })).toHaveAttribute(
      'aria-controls',
      'review-panel-analysis'
    );
    expect(screen.getByRole('tab', { name: /^review/i })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('tab', { name: /^review/i })).toHaveAttribute(
      'aria-controls',
      'review-panel-review'
    );
  });
});
