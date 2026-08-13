import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { UtilityRail } from '@/components/workspace/UtilityRail';

function RailHarness() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <div data-modal-root>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        Open filters
      </button>
      <main>
        <button type="button">Background action</button>
      </main>
      <UtilityRail
        title="Game filters"
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) queueMicrotask(() => trigger.current?.focus());
        }}
        id="game-query-rail"
      >
        <label>
          Username
          <input />
        </label>
      </UtilityRail>
    </div>
  );
}

describe('UtilityRail', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('opens as a mobile filter dialog and restores the invoking trigger after Escape', async () => {
    const user = userEvent.setup();
    render(<RailHarness />);

    const trigger = screen.getByRole('button', { name: /open filters/i });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: /game filters/i });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('main')).toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: /close game filters/i })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(dialog).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
  });

  it('keeps focus inside the mobile rail when tabbing from its close control', async () => {
    const user = userEvent.setup();
    render(<RailHarness />);

    await user.click(screen.getByRole('button', { name: /open filters/i }));
    const close = screen.getByRole('button', { name: /close game filters/i });
    close.focus();
    await user.tab({ shift: true });

    expect(screen.getByLabelText(/username/i)).toHaveFocus();
  });

  it('moves focus to an updated ingestion result inside the open mobile drawer', async () => {
    const user = userEvent.setup();
    render(<CompletionRailHarness />);

    await user.click(screen.getByRole('button', { name: /finish loading/i }));

    expect(screen.getByRole('status', { name: /games loaded/i })).toHaveFocus();
  });

  it('does not refocus the result when an unrelated mobile rail control rerenders', async () => {
    const user = userEvent.setup();
    render(<CompletionRailHarness />);

    await user.click(screen.getByRole('button', { name: /finish loading/i }));

    const retry = screen.getByRole('button', { name: /retry import/i });
    retry.focus();
    await user.type(retry, ' ');

    expect(retry).toHaveFocus();
  });

  it('does not render a closed desktop rail, then lets the trigger reopen it', async () => {
    stubDesktopViewport();
    const user = userEvent.setup();
    render(<RailHarness />);

    expect(document.getElementById('game-query-rail')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /open filters/i }));
    expect(screen.getByRole('complementary', { name: /game filters/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close game filters/i }));
    expect(document.getElementById('game-query-rail')).not.toBeInTheDocument();
  });
});

function CompletionRailHarness() {
  const [complete, setComplete] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  return (
    <div data-modal-root>
      <UtilityRail
        title="Game filters"
        open
        onOpenChange={() => undefined}
        resultFocusVersion={complete ? 1 : 0}
      >
        {complete ? (
          <section data-utility-rail-result role="status" aria-label="Games loaded" tabIndex={-1}>
            Games loaded
            <button type="button" onClick={() => setRetryCount((count) => count + 1)}>
              Retry import ({retryCount})
            </button>
          </section>
        ) : (
          <button type="button" onClick={() => setComplete(true)}>
            Finish loading
          </button>
        )}
      </UtilityRail>
    </div>
  );
}

function stubDesktopViewport() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
}
