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

    const gameResults = screen.getByRole('region', { name: 'Game results' });
    expect(gameResults).toHaveAttribute('tabindex', '0');
    const renderedCollection =
      screen.queryByRole('table', { name: 'Games' }) ??
      screen.getByRole('list', { name: 'Compact games' });
    expect(gameResults).toContainElement(renderedCollection);
    expect(gameResults).not.toContainElement(screen.getByLabelText(/filter games/i));
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

  it('shows an unbounded empty state when the filter matches no games', async () => {
    const user = userEvent.setup();
    render(<GameSelector games={games} selectedGameId={null} onSelect={vi.fn()} />);

    await user.type(screen.getByLabelText(/filter games/i), 'No such opponent');

    expect(screen.getByText('No games match the current filter.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Game results' })).not.toBeInTheDocument();
  });
  it('displays opponent name from explicit blackPlayer/whitePlayer metadata even without PGN headers', () => {
    const customGame: GameRecord = {
      id: 'no-pgn-header',
      username: 'player-one',
      url: 'https://www.chess.com/game/live/custom',
      userColor: 'white',
      result: 'win',
      endedAt: 1_720_000_000,
      timeClass: 'blitz',
      rated: true,
      userRating: 1900,
      opponentRating: 1950,
      whitePlayer: { username: 'Player-One', rating: 1900 },
      blackPlayer: { username: 'DisplayCasedOpponent', rating: 1950 },
      pgn: '1. e4 e5 1-0', // no headers
      rules: 'chess',
    };

    render(<GameSelector games={[customGame]} selectedGameId={null} onSelect={vi.fn()} />);
    expect(screen.getByRole('button', { name: /select game versus displaycasedopponent/i })).toBeInTheDocument();
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
    whitePlayer: { username: 'player-one', rating: 1800 },
    blackPlayer: { username: opponent, rating: 1850 },
    pgn: `[White "player-one"]\n[Black "${opponent}"]\n[Result "1-0"]\n\n1. e4 e5 1-0`,
    rules: 'chess',
  };
}
