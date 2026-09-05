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
  it('sorts a copy, displays required metadata, and selects by stable game id without starting analysis', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onAnalyze = vi.fn();
    const originalOrder = games.map(({ id }) => id);
    render(
      <GameSelector games={games} selectedGameId={null} onSelect={onSelect} onAnalyze={onAnalyze} />
    );

    const gameResults = screen.getByRole('region', { name: 'Game results' });
    expect(gameResults).toHaveAttribute('tabindex', '0');
    const renderedCollection = screen.getByRole('list', { name: 'Games' });
    expect(gameResults).toContainElement(renderedCollection);
    expect(gameResults).not.toContainElement(screen.getByLabelText(/filter games/i));
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName(/judit polgar/i);
    expect(buttons[0]).toHaveAccessibleName(/white/i);
    expect(buttons[0]).toHaveAccessibleName(/1800/i);
    expect(buttons[0]).toHaveAccessibleName(/1850/i);
    expect(screen.getAllByText(/rapid/i)).toHaveLength(2);
    expect(screen.getAllByText(/rated/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not reviewed/i).length).toBeGreaterThan(0);

    // Clicking row calls onSelect but NOT onAnalyze
    await user.click(screen.getByRole('button', { name: /magnus carlsen/i }));
    expect(onSelect).toHaveBeenCalledWith('older');
    expect(onAnalyze).not.toHaveBeenCalled();
    expect(games.map(({ id }) => id)).toEqual(originalOrder);
  });

  it('filters the consistently detailed game cards', async () => {
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
    expect(screen.getByRole('list', { name: 'Games' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /magnus/i })).not.toBeInTheDocument();
    window.matchMedia = originalMatchMedia;
  });

  it('shows an unbounded empty state when the filter matches no games', async () => {
    const user = userEvent.setup();
    render(<GameSelector games={games} selectedGameId={null} onSelect={vi.fn()} />);

    await user.type(screen.getByLabelText(/filter games/i), 'No such opponent');

    expect(
      screen.getByText('No games match this filter. Try another opponent name.')
    ).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: /displaycasedopponent/i })).toBeInTheDocument();
  });

  it('displays matchup detail line and calls onAnalyze exactly once on Review game click', async () => {
    const user = userEvent.setup();
    const onAnalyze = vi.fn();
    render(
      <GameSelector games={games} selectedGameId="newer" onSelect={vi.fn()} onAnalyze={onAnalyze} />
    );

    expect(screen.getByText('player-one (1800) vs Judit Polgar (1850)')).toBeInTheDocument();
    const reviewButton = screen.getByRole('button', { name: 'Review game' });
    expect(reviewButton).toBeEnabled();

    await user.click(reviewButton);
    expect(onAnalyze).toHaveBeenCalledTimes(1);
    expect(onAnalyze).toHaveBeenCalledWith('newer');
  });

  it('disables Review game and shows warning when reviewDisabledReason is provided', async () => {
    const user = userEvent.setup();
    const onAnalyze = vi.fn();
    render(
      <GameSelector
        games={games}
        selectedGameId="newer"
        onSelect={vi.fn()}
        onAnalyze={onAnalyze}
        reviewDisabledReason="This game has no reviewable moves."
      />
    );

    const reviewButton = screen.getByRole('button', { name: 'Review game' });
    expect(reviewButton).toBeDisabled();
    expect(screen.getByText('This game has no reviewable moves.')).toBeInTheDocument();

    await user.click(reviewButton);
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it('distinguishes analysis result statuses: Reviewed, Partial review, Review failed, Analysing…', () => {
    const { rerender } = render(
      <GameSelector
        games={games}
        selectedGameId="newer"
        onSelect={vi.fn()}
        analysisStatus={{
          older: 'Reviewed',
          newer: 'Partial review',
        }}
      />
    );

    expect(screen.getByText('Reviewed')).toBeInTheDocument();
    expect(screen.getByText('Partial review')).toBeInTheDocument();

    rerender(
      <GameSelector
        games={games}
        selectedGameId="newer"
        onSelect={vi.fn()}
        analysisStatus={{
          older: 'Review failed',
          newer: 'Analysing…',
        }}
      />
    );

    expect(screen.getByText('Review failed')).toBeInTheDocument();
    expect(screen.getByText('Analysing…')).toBeInTheDocument();
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
