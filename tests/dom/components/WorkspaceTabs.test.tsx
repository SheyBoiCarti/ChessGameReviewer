import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';

describe('WorkspaceTabs', () => {
  it('follows the WAI-ARIA arrow, Home, and End keyboard pattern', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(<WorkspaceTabs selected="games" onSelect={onSelect} />);

    const games = screen.getByRole('tab', { name: /games/i });
    games.focus();
    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenLastCalledWith('opening');

    rerender(<WorkspaceTabs selected="analysis" onSelect={onSelect} />);
    const analysis = screen.getByRole('tab', { name: /analysis/i });
    analysis.focus();
    await user.keyboard('{Home}');
    expect(onSelect).toHaveBeenLastCalledWith('games');
    await user.keyboard('{End}');
    expect(onSelect).toHaveBeenLastCalledWith('settings');
  });

  it('exposes selected state and associated panel ids', () => {
    render(<WorkspaceTabs selected="opening" onSelect={vi.fn()} />);
    expect(screen.getByRole('tab', { name: /opening tree/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: /opening tree/i })).toHaveAttribute(
      'aria-controls',
      'workspace-panel-opening'
    );
  });
});
