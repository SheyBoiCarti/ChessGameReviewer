import { describe, it, expect } from 'vitest';
import { filterGames } from '../../features/profile-insights/filterGames';
import type { InsightFilters } from '../../features/profile-insights/types';
import type { GameRecord } from '../../lib/db/schema';

function makeGame(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: 'https://www.chess.com/game/live/100',
    username: 'testuser',
    url: 'https://www.chess.com/game/live/100',
    userColor: 'white',
    result: 'win',
    endedAt: 1700000000,
    timeClass: 'rapid',
    rated: true,
    userRating: 1500,
    opponentRating: 1480,
    whitePlayer: { username: 'testuser', rating: 1500 },
    blackPlayer: { username: 'opponent', rating: 1480 },
    pgn: '1. e4 e5 2. Nf3 Nc6 1-0',
    rules: 'chess',
    ...overrides,
  };
}

describe('filterGames', () => {
  const baseNow = 1700000000 * 1000; // in milliseconds

  it('returns all games when filters are set to all', () => {
    const games = [
      makeGame({ id: '1', timeClass: 'rapid', userColor: 'white' }),
      makeGame({ id: '2', timeClass: 'blitz', userColor: 'black' }),
      makeGame({ id: '3', timeClass: 'bullet', userColor: 'white' }),
    ];

    const filters: InsightFilters = {
      timeClass: 'all',
      color: 'all',
      dateRange: 'all',
    };

    const result = filterGames(games, filters, baseNow);
    expect(result).toHaveLength(3);
  });

  it('filters by timeClass correctly', () => {
    const games = [
      makeGame({ id: '1', timeClass: 'rapid' }),
      makeGame({ id: '2', timeClass: 'blitz' }),
      makeGame({ id: '3', timeClass: 'bullet' }),
      makeGame({ id: '4', timeClass: 'daily' }),
    ];

    expect(
      filterGames(games, { timeClass: 'blitz', color: 'all', dateRange: 'all' }, baseNow)
    ).toEqual([games[1]]);
    expect(
      filterGames(games, { timeClass: 'bullet', color: 'all', dateRange: 'all' }, baseNow)
    ).toEqual([games[2]]);
  });

  it('filters by userColor correctly', () => {
    const games = [
      makeGame({ id: '1', userColor: 'white' }),
      makeGame({ id: '2', userColor: 'black' }),
      makeGame({ id: '3', userColor: 'white' }),
    ];

    expect(
      filterGames(games, { timeClass: 'all', color: 'white', dateRange: 'all' }, baseNow)
    ).toHaveLength(2);
    expect(
      filterGames(games, { timeClass: 'all', color: 'black', dateRange: 'all' }, baseNow)
    ).toHaveLength(1);
  });

  it('filters by dateRange (30d, 90d, 365d) correctly', () => {
    const nowSec = 1700000000;
    const day = 86400;

    const games = [
      makeGame({ id: 'recent', endedAt: nowSec - 5 * day }),
      makeGame({ id: 'month-old', endedAt: nowSec - 35 * day }),
      makeGame({ id: 'quarter-old', endedAt: nowSec - 100 * day }),
      makeGame({ id: 'two-years-old', endedAt: nowSec - 700 * day }),
    ];

    const res30d = filterGames(
      games,
      { timeClass: 'all', color: 'all', dateRange: '30d' },
      baseNow
    );
    expect(res30d.map((g) => g.id)).toEqual(['recent']);

    const res90d = filterGames(
      games,
      { timeClass: 'all', color: 'all', dateRange: '90d' },
      baseNow
    );
    expect(res90d.map((g) => g.id)).toEqual(['recent', 'month-old']);

    const res365d = filterGames(
      games,
      { timeClass: 'all', color: 'all', dateRange: '365d' },
      baseNow
    );
    expect(res365d.map((g) => g.id)).toEqual(['recent', 'month-old', 'quarter-old']);
  });

  it('combines multiple active filters', () => {
    const nowSec = 1700000000;
    const games = [
      makeGame({ id: '1', timeClass: 'rapid', userColor: 'white', endedAt: nowSec - 1000 }),
      makeGame({ id: '2', timeClass: 'rapid', userColor: 'black', endedAt: nowSec - 1000 }),
      makeGame({ id: '3', timeClass: 'blitz', userColor: 'white', endedAt: nowSec - 1000 }),
      makeGame({ id: '4', timeClass: 'rapid', userColor: 'white', endedAt: nowSec - 40 * 86400 }),
    ];

    const result = filterGames(
      games,
      { timeClass: 'rapid', color: 'white', dateRange: '30d' },
      baseNow
    );

    expect(result.map((g) => g.id)).toEqual(['1']);
  });
});
