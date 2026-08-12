import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GameSelector } from '@/components/analysis/GameSelector';
import type { GameRecord } from '@/lib/db/schema';

const games: GameRecord[] = [
  game('older', 1_700_000_000, 'Magnus Carlsen', 'loss'),
  game('newer', 1_710_000_000, 'Judit Polgar', 'win'),
];

describe('GameSelector', () => {
  it('sorts a copy, displays required metadata, and selects by stable game id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const originalOrder = games.map(({ id }) => id);
    render(<GameSelector games={games} selectedGameId={null} onSelect={onSelect} />);

    const buttons = screen.getAllByRole('button', { name: /select game versus/i });
    expect(buttons[0]).toHaveAccessibleName(/judit polgar/i);
    expect(screen.getAllByText(/rapid/i)).toHaveLength(2);
    expect(screen.getAllByText(/rated/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not analysed/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /select game versus magnus carlsen/i }));

    expect(onSelect).toHaveBeenCalledWith('older');
    expect(games.map(({ id }) => id)).toEqual(originalOrder);
  });

  it('filters without removing the responsive compact representation', async () => {
    const user = userEvent.setup();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(max-width: 42rem)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    render(<GameSelector games={games} selectedGameId="newer" onSelect={vi.fn()} />);

    await user.type(screen.getByLabelText(/filter games/i), 'Judit');
    expect(screen.getByRole('list', { name: /compact games/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /magnus/i })).not.toBeInTheDocument();
    window.matchMedia = originalMatchMedia;
  });
});

function game(
  id: string,
  endedAt: number,
  opponent: string,
  result: GameRecord['result']
): GameRecord {
  return {
    id,
    username: 'player-one',
    url: `https://www.chess.com/game/live/${id}`,
    userColor: 'white',
    result,
    endedAt,
    timeClass: 'rapid',
    rated: true,
    userRating: 1800,
    opponentRating: 1850,
    pgn: `[White "player-one"]\n[Black "${opponent}"]\n[Result "1-0"]\n\n1. e4 e5 1-0`,
    rules: 'chess',
  };
}
