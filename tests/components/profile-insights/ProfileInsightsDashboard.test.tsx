import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileInsightsDashboard } from '../../../components/profile-insights/ProfileInsightsDashboard';
import type { GameRecord } from '../../../lib/db/schema';
import * as dbModule from '../../../lib/db/openDatabase';
import * as repoModule from '../../../lib/db/repositories';
import * as profileApi from '../../../lib/api/chesscomProfile';

function makeGame(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: 'https://www.chess.com/game/live/101',
    username: 'hikaru',
    url: 'https://www.chess.com/game/live/101',
    userColor: 'white',
    result: 'win',
    endedAt: 1700000000,
    timeClass: 'blitz',
    rated: true,
    userRating: 3200,
    opponentRating: 3150,
    whitePlayer: { username: 'hikaru', rating: 3200 },
    blackPlayer: { username: 'opponent', rating: 3150 },
    pgn: `[Event "Live Chess"]
[White "hikaru"]
[Black "opponent"]
[ECO "C00"]
[Opening "French Defense"]

1. e4 e6 2. d4 d5 1-0`,
    rules: 'chess',
    ...overrides,
  };
}

describe('ProfileInsightsDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders prompt when username is null', () => {
    render(<ProfileInsightsDashboard username={null} games={[]} analysisMap={{}} />);

    expect(screen.getByText(/No active player selected/i)).toBeInTheDocument();
  });

  it('renders empty games state with call to action when user has 0 games', () => {
    const onNavigate = vi.fn();
    render(
      <ProfileInsightsDashboard
        username="hikaru"
        games={[]}
        analysisMap={{}}
        onNavigateToGames={onNavigate}
      />
    );

    expect(screen.getByText(/No ingested games found for hikaru/i)).toBeInTheDocument();
    const btn = screen.getByRole('button', { name: /Load Games/i });
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('renders full dashboard and updates stats when filters change', async () => {
    const mockDb = {} as IDBDatabase;
    vi.spyOn(dbModule, 'openDatabase').mockResolvedValue(mockDb);
    vi.spyOn(repoModule, 'getPlayerProfile').mockResolvedValue({
      username: 'hikaru',
      profile: {
        username: 'hikaru',
        name: 'Hikaru Nakamura',
        title: 'GM',
        status: 'premium',
        url: 'https://www.chess.com/member/hikaru',
        joined: 1200000000,
      },
      stats: {
        chess_blitz: { last: { rating: 3200 }, best: { rating: 3350, date: 1650000000 } },
        chess_rapid: { last: { rating: 2850 } },
      },
      fetchedAt: 1700000000000,
    });

    const games = [
      makeGame({ id: '1', timeClass: 'blitz', userColor: 'white', result: 'win' }),
      makeGame({ id: '2', timeClass: 'rapid', userColor: 'black', result: 'loss' }),
    ];

    render(<ProfileInsightsDashboard username="hikaru" games={games} analysisMap={{}} />);

    await waitFor(() => {
      expect(screen.getByText('Hikaru Nakamura')).toBeInTheDocument();
    });

    expect(screen.getByText('GM')).toBeInTheDocument();
    expect(screen.getByText('Total Games')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // total games

    // Filter by Blitz only
    const blitzFilterBtn = screen.getByRole('radio', { name: /^Blitz/i });
    fireEvent.click(blitzFilterBtn);

    // After filtering by blitz, only 1 game matches
    await waitFor(() => {
      const kpiTotal = screen.getByTestId('kpi-total-games');
      expect(kpiTotal).toHaveTextContent('1');
    });
  });

  it('shows no matches message when filter excludes all games', async () => {
    const games = [makeGame({ timeClass: 'blitz' })];

    render(<ProfileInsightsDashboard username="hikaru" games={games} analysisMap={{}} />);

    const bulletBtn = screen.getByRole('radio', { name: /^Bullet/i });
    fireEvent.click(bulletBtn);

    expect(screen.getByText(/No games match the selected filters/i)).toBeInTheDocument();

    const resetBtn = screen.getByRole('button', { name: /Reset Filters/i });
    fireEvent.click(resetBtn);

    expect(screen.queryByText(/No games match the selected filters/i)).not.toBeInTheDocument();
  });
});
