import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkspaceNavigation } from '@/components/workspace/WorkspaceNavigation';

describe('WorkspaceNavigation', () => {
  it('maps all four view labels to existing tab values and sets aria-current on active view', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onOpenAbout = vi.fn();

    const { rerender } = render(
      <WorkspaceNavigation selected="games" onSelect={onSelect} onOpenAbout={onOpenAbout} />
    );

    const gamesBtn = screen.getByRole('button', { name: /^games/i });
    const reviewBtn = screen.getByRole('button', { name: /^review/i });
    const openingsBtn = screen.getByRole('button', { name: /^openings/i });
    const settingsBtn = screen.getByRole('button', { name: /^settings/i });
    const aboutBtn = screen.getByRole('button', { name: /^about/i });

    // Global navigation items are native buttons, NOT tabs
    expect(screen.queryByRole('tab')).toBeNull();

    // Active item has aria-current="page"
    expect(gamesBtn).toHaveAttribute('aria-current', 'page');
    expect(reviewBtn).not.toHaveAttribute('aria-current');

    await user.click(reviewBtn);
    expect(onSelect).toHaveBeenCalledWith('analysis');

    await user.click(openingsBtn);
    expect(onSelect).toHaveBeenCalledWith('opening');

    await user.click(settingsBtn);
    expect(onSelect).toHaveBeenCalledWith('settings');

    await user.click(aboutBtn);
    expect(onOpenAbout).toHaveBeenCalledOnce();

    rerender(
      <WorkspaceNavigation selected="analysis" onSelect={onSelect} onOpenAbout={onOpenAbout} />
    );
    expect(screen.getByRole('button', { name: /^review/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('button', { name: /^games/i })).not.toHaveAttribute('aria-current');
  });

  it('closes drawer and invokes onSelect when in drawer mode', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCloseDrawer = vi.fn();

    render(
      <WorkspaceNavigation
        selected="games"
        onSelect={onSelect}
        onOpenAbout={vi.fn()}
        isDrawer
        onCloseDrawer={onCloseDrawer}
      />
    );

    await user.click(screen.getByRole('button', { name: /^review/i }));
    expect(onSelect).toHaveBeenCalledWith('analysis');
    expect(onCloseDrawer).toHaveBeenCalledOnce();
  });
});
