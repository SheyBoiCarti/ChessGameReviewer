import { describe, it, expect } from 'vitest';
import {
  planArchiveMonths,
  fingerprintQuery,
  parseArchiveMonth,
} from '../../../features/ingestion/archivePlanner';
import { GameQuery, PlayerColor, TimeClass } from '../../../lib/api/contracts';

function query(
  timeClasses: TimeClass[] = ['blitz'],
  colors: PlayerColor[] = ['white', 'black']
): GameQuery {
  return {
    username: 'janedoe',
    dateFrom: '2026-01-31',
    dateTo: '2026-02-01',
    maxGames: 500,
    timeClasses,
    colors,
  };
}

describe('planArchiveMonths', () => {
  it('intersects inclusive UTC bounds and sorts newest first', () => {
    expect(
      planArchiveMonths(['2025-12', '2026-02', '2026-01', 'bad'], {
        username: 'janedoe',
        dateFrom: '2026-01-31',
        dateTo: '2026-02-01',
        maxGames: 500,
        timeClasses: ['blitz'],
        colors: ['white', 'black'],
      })
    ).toEqual(['2026-02', '2026-01']);
  });

  it('creates the same fingerprint for semantically equal set ordering', () => {
    expect(fingerprintQuery(query(['rapid', 'blitz'], ['black', 'white']))).toBe(
      fingerprintQuery(query(['blitz', 'rapid'], ['white', 'black']))
    );
  });

  it('accepts only the exact normalized player archive URL family', () => {
    expect(
      parseArchiveMonth('https://api.chess.com/pub/player/janedoe/games/2026/08', 'JaneDoe')
    ).toBe('2026-08');
    expect(() =>
      parseArchiveMonth('https://example.com/pub/player/janedoe/games/2026/08', 'janedoe')
    ).toThrow('INVALID_ARCHIVE_URL');
    expect(() =>
      parseArchiveMonth('https://api.chess.com/pub/player/janedoe/games/2026/8?raw=1', 'janedoe')
    ).toThrow('INVALID_ARCHIVE_URL');
  });

  it('keeps unbounded valid months and handles a December year boundary', () => {
    const unbounded = { ...query(), dateFrom: undefined, dateTo: undefined };
    expect(planArchiveMonths(['2026-12', '2026-01', '2026-13', 'bad'], unbounded)).toEqual([
      '2026-12',
      '2026-01',
    ]);
  });
});
