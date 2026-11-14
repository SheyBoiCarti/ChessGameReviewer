import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  defaultGameListState,
  GameSelector,
  type GameListState,
} from '@/components/analysis/GameSelector';
import type { GameRecord } from '@/lib/db/schema';

import { makeGameRecord } from '../../helpers/phase1Fixtures';

const games: GameRecord[] = [
  game('older', 1_700_000_000, 'Magnus Carlsen', 'loss'),
  game('newer', 1_710_000_000, 'Judit Polgar', 'win'),
];

describe('GameSelector', () => {
  it('sorts a copy, displays required metadata, and selects by stable game id without starting analysis', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onReview = vi.fn();
    const originalOrder = games.map(({ id }) => id);
    render(
      <GameSelector games={games} selectedGameId={null} onSelect={onSelect} onReview={onReview} />
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

    // Clicking row calls onSelect but NOT onReview
    await user.click(screen.getByRole('button', { name: /magnus carlsen/i }));
    expect(onSelect).toHaveBeenCalledWith('older');
    expect(onReview).not.toHaveBeenCalled();
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
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Games (1 of 2)');
    window.matchMedia = originalMatchMedia;
  });

  it('keeps the original selection stable when a filter omits it and explains the out-of-filter preview', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onReview = vi.fn();
    render(
      <GameSelector games={games} selectedGameId="older" onSelect={onSelect} onReview={onReview} />
    );

    // Initial heading
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Games (2)');
    expect(screen.getByText('player-one (1800) vs Magnus Carlsen (1850)')).toBeInTheDocument();

    // Filter to Judit (which filters out the selected 'older' game)
    await user.type(screen.getByLabelText(/filter games/i), 'Judit');

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Games (1 of 2)');
    // Typing a filter must not silently replace the selected game.
    expect(onSelect).not.toHaveBeenCalled();
    // The selected game stays selected, and its preview explains that it is outside the filter.
    expect(screen.getByText('player-one (1800) vs Magnus Carlsen (1850)')).toBeInTheDocument();
    expect(screen.getByText('Selected game is outside this filter.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review game' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /judit polgar/i })).toBeInTheDocument();
  });

  it('accepts controlled list state and resets page without touching the selection on filter changes', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onListStateChange = vi.fn();
    const initial: GameListState = { filter: '', sort: 'newest', page: 3, scrollTop: 240 };
    const { rerender } = render(
      <GameSelector
        games={games}
        selectedGameId="older"
        onSelect={onSelect}
        listState={initial}
        onListStateChange={onListStateChange}
      />
    );

    await user.type(screen.getByLabelText(/filter games/i), 'a');
    expect(onListStateChange).toHaveBeenLastCalledWith({
      filter: 'a',
      sort: 'newest',
      page: 1,
      scrollTop: 0,
    });
    expect(onSelect).not.toHaveBeenCalled();

    rerender(
      <GameSelector
        games={games}
        selectedGameId="older"
        onSelect={onSelect}
        listState={{ filter: 'a', sort: 'newest', page: 1, scrollTop: 0 }}
        onListStateChange={onListStateChange}
      />
    );
    expect(onListStateChange).toHaveBeenCalledTimes(1);
  });

  it('does not select a game merely from typing a filter (representative regression)', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <GameSelector games={[makeGameRecord()]} selectedGameId={null} onSelect={onSelect} hasLoaded />
    );
    await user.type(screen.getByLabelText('Filter games'), 'opponent');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('saves list viewport scroll on leave and restores it after the matching rows mount', async () => {
    const manyGames: GameRecord[] = Array.from({ length: 40 }, (_, index) =>
      game(`bulk-${index}`, 1_700_000_000 + index, `Bulk Opponent ${index}`, 'win')
    );
    const onListStateChange = vi.fn();
    const { unmount } = render(
      <GameSelector
        games={manyGames}
        selectedGameId={null}
        onSelect={vi.fn()}
        listState={defaultGameListState}
        onListStateChange={onListStateChange}
      />
    );
    const viewport = screen.getByRole('region', { name: 'Game results' });
    viewport.scrollTop = 320;
    viewport.dispatchEvent(new Event('scroll', { bubbles: true }));
    unmount();
    expect(onListStateChange).toHaveBeenLastCalledWith({
      filter: '',
      sort: 'newest',
      page: 1,
      scrollTop: 320,
    });

    const restored = vi.fn();
    render(
      <GameSelector
        games={manyGames}
        selectedGameId={null}
        onSelect={vi.fn()}
        listState={{ filter: '', sort: 'newest', page: 1, scrollTop: 320 }}
        onListStateChange={restored}
      />
    );
    expect(screen.getByRole('region', { name: 'Game results' }).scrollTop).toBe(320);
  });

  it('shows an unbounded empty state when the filter matches no games', async () => {
    const user = userEvent.setup();
    render(
      <GameSelector games={games} selectedGameId="older" onSelect={vi.fn()} onReview={vi.fn()} />
    );

    await user.type(screen.getByLabelText(/filter games/i), 'No such opponent');

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Games (0 of 2)');
    expect(screen.queryByRole('button', { name: /magnus carlsen/i })).not.toBeInTheDocument();
    expect(
      screen.getByText('No games match this filter. Try another opponent name.')
    ).toBeInTheDocument();
    // The selected game remains selected and its preview explains it is outside this filter.
    expect(screen.getByText('Selected game is outside this filter.')).toBeInTheDocument();
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

  it('displays matchup detail line and calls onReview exactly once on Review game click', async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    render(
      <GameSelector games={games} selectedGameId="newer" onSelect={vi.fn()} onReview={onReview} />
    );

    expect(screen.getByText('player-one (1800) vs Judit Polgar (1850)')).toBeInTheDocument();
    const reviewButton = screen.getByRole('button', { name: 'Review game' });
    expect(reviewButton).toBeEnabled();

    await user.click(reviewButton);
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(onReview).toHaveBeenCalledWith('newer');
  });

  it('disables Review game and shows warning when reviewDisabledReason is provided', async () => {
    const user = userEvent.setup();
    const onReview = vi.fn();
    render(
      <GameSelector
        games={games}
        selectedGameId="newer"
        onSelect={vi.fn()}
        onReview={onReview}
        reviewDisabledReason="This game has no reviewable moves."
      />
    );

    const reviewButton = screen.getByRole('button', { name: 'Review game' });
    expect(reviewButton).toBeDisabled();
    expect(screen.getByText('This game has no reviewable moves.')).toBeInTheDocument();

    await user.click(reviewButton);
    expect(onReview).not.toHaveBeenCalled();
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
