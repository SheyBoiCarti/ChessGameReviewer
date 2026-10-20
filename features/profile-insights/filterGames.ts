import type { GameRecord } from '@/lib/db/schema';
import type { InsightFilters } from './types';

const SECONDS_PER_DAY = 86400;

export function filterGames(
  games: readonly GameRecord[],
  filters: InsightFilters,
  nowMs: number = Date.now()
): GameRecord[] {
  const nowSec = Math.floor(nowMs / 1000);

  let minEndedAtSec: number | null = null;
  if (filters.dateRange === '30d') {
    minEndedAtSec = nowSec - 30 * SECONDS_PER_DAY;
  } else if (filters.dateRange === '90d') {
    minEndedAtSec = nowSec - 90 * SECONDS_PER_DAY;
  } else if (filters.dateRange === '365d') {
    minEndedAtSec = nowSec - 365 * SECONDS_PER_DAY;
  }

  return games.filter((game) => {
    // 1. Time Class filter
    if (filters.timeClass !== 'all' && game.timeClass !== filters.timeClass) {
      return false;
    }

    // 2. Color filter
    if (filters.color !== 'all' && game.userColor !== filters.color) {
      return false;
    }

    // 3. Date Range filter
    if (minEndedAtSec !== null && game.endedAt < minEndedAtSec) {
      return false;
    }

    return true;
  });
}
