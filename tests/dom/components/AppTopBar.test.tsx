import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppTopBar } from '@/components/workspace/AppTopBar';

describe('AppTopBar', () => {
  it('opens the complete local-data disclosure in a modal and restores its trigger on Escape', async () => {
    const user = userEvent.setup();
    render(
      <AppTopBar onOpenFilters={vi.fn()}>
        <main>
          <button type="button">Background action</button>
        </main>
      </AppTopBar>
    );

    const trigger = screen.getByRole('button', { name: /about local data and affiliation/i });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: /about this app/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveTextContent(
      /This application is completely unaffiliated with Chess\.com\./i
    );
    expect(dialog).toHaveTextContent(
      /official Chess\.com Published Data API via browser CORS requests/i
    );
    expect(dialog).toHaveTextContent(/stored locally on your device in browser IndexedDB/i);
    expect(dialog).toHaveTextContent(/ever uploaded to any server/i);
    expect(screen.getByRole('main')).toHaveAttribute('inert');

    await user.keyboard('{Escape}');

    expect(dialog).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
  });

  it('traps Tab focus inside the disclosure', async () => {
    const user = userEvent.setup();
    render(<AppTopBar onOpenFilters={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /about local data and affiliation/i }));
    const close = screen.getByRole('button', { name: /close product information/i });
    close.focus();
    await user.tab();

    expect(screen.getByRole('button', { name: /close product information/i })).toHaveFocus();
  });

  it('exposes the filter rail state and requests that the rail opens', async () => {
    const user = userEvent.setup();
    const onOpenFilters = vi.fn();
    render(
      <AppTopBar
        onOpenFilters={onOpenFilters}
        filtersOpen={false}
        filterControlsId="game-query-rail"
      />
    );

    const trigger = screen.getByRole('button', { name: /filters/i });
    expect(trigger).toHaveAttribute('aria-controls', 'game-query-rail');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);

    expect(onOpenFilters).toHaveBeenCalledOnce();
  });
});
