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
        onDeleteUsername={onDeleteUsername}
        onClearAll={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /delete player-one data/i }));
    expect(onDeleteUsername).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /delete local data/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm delete/i }));

    expect(onDeleteUsername).toHaveBeenCalledWith('player-one');
    expect(await screen.findByRole('status')).toHaveTextContent(/deleted 12 games/i);
  });

  it('reports deletion failures as urgent recoverable errors', async () => {
    const user = userEvent.setup();
    render(
      <LocalDataSettings
        users={[]}
        onDeleteUsername={vi.fn()}
        onClearAll={vi.fn(async () => {
          throw new Error('Storage is unavailable.');
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: /clear all local data/i }));
    await user.click(screen.getByRole('button', { name: /confirm clear all/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/storage is unavailable/i);
  });

  it('traps focus, closes with Escape, and restores the trigger', async () => {
    const user = userEvent.setup();
    render(<LocalDataSettings users={[]} onDeleteUsername={vi.fn()} onClearAll={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: /clear all local data/i });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: /delete local data/i });
    expect(dialog).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(dialog).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
