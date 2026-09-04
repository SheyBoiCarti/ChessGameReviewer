import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LocalDataSettings } from '@/components/controls/LocalDataSettings';

describe('LocalDataSettings', () => {
  it('requires confirmation before deleting one username and reports success', async () => {
    const user = userEvent.setup();
    const onDeleteUsername = vi.fn(async () => ({ gamesDeleted: 12 }));
    render(
      <LocalDataSettings
        users={[{ username: 'player-one', approximateBytes: 4096 }]}
        maintenance={{ status: 'idle', error: null }}
        onDeleteUsername={onDeleteUsername}
        onClearAll={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /delete player-one data/i }));
    expect(onDeleteUsername).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /delete local data/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^delete local data$/i }));

    expect(onDeleteUsername).toHaveBeenCalledWith('player-one');
    expect(await screen.findByRole('status')).toHaveTextContent(/deleted 12 games/i);
  });

  it('reports deletion failures as urgent recoverable errors', async () => {
    const user = userEvent.setup();
    render(
      <LocalDataSettings
        users={[]}
        maintenance={{ status: 'idle', error: null }}
        onDeleteUsername={vi.fn()}
        onClearAll={vi.fn(async () => {
          throw new Error('Storage is unavailable.');
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: /clear all local data/i }));
    await user.click(screen.getByRole('button', { name: /delete everything/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/storage is unavailable/i);
  });

  it('traps focus, closes with Escape, and restores the trigger', async () => {
    const user = userEvent.setup();
    render(
      <LocalDataSettings
        users={[]}
        maintenance={{ status: 'idle', error: null }}
        onDeleteUsername={vi.fn()}
        onClearAll={vi.fn()}
      />
    );

    const trigger = screen.getByRole('button', { name: /clear all local data/i });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: /delete local data/i });
    expect(dialog).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(dialog).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('disables destructive controls and reports active maintenance', () => {
    render(
      <LocalDataSettings
        users={[{ username: 'alice' }]}
        maintenance={{ status: 'deleting-user', error: null }}
        onDeleteUsername={vi.fn()}
        onClearAll={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /delete alice data/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /clear all local data/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Deleting local data');
  });

  it('renders the safe maintenance failure without raw storage details', () => {
    render(
      <LocalDataSettings
        users={[]}
        maintenance={{ status: 'idle', error: 'Local data could not be deleted.' }}
        onDeleteUsername={vi.fn()}
        onClearAll={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Local data could not be deleted.');
    expect(screen.getByRole('alert')).not.toHaveTextContent(/quota|indexeddb/i);
  });
});
