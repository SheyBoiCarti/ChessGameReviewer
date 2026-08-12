import { describe, it, expect } from 'vitest';
import { planArchiveMonths, fingerprintQuery, parseArchiveMonth } from '../../../features/ingestion/archivePlanner';
import { GameQuery, PlayerColor, TimeClass } from '../../../lib/api/contracts';

function query(timeClasses: TimeClass[], colors: PlayerColor[]): GameQuery {
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
});
