import { GameQuery } from '../../lib/api/contracts';

export function fingerprintQuery(query: GameQuery): string {
  const stable = {
    colors: [...query.colors].sort(),
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    maxGames: query.maxGames,
    rated: query.rated,
    timeClasses: [...query.timeClasses].sort(),
    username: query.username.toLowerCase(),
  };
  return JSON.stringify(stable);
}

export function parseArchiveMonth(url: string, username: string): string {
  const normUser = username.toLowerCase();
  const prefix = `https://api.chess.com/pub/player/${normUser}/games/`;
  if (!url.startsWith(prefix)) {
    throw new Error('INVALID_ARCHIVE_URL');
  }
  const suffix = url.substring(prefix.length);
  const match = suffix.match(/^(\d{4})\/(\d{2})$/);
  if (!match) {
    throw new Error('INVALID_ARCHIVE_URL');
  }
  return `${match[1]}-${match[2]}`;
}

export function planArchiveMonths(months: readonly string[], query: GameQuery): string[] {
  let fromMillis = -Infinity;
  let toMillis = Infinity;

  if (query.dateFrom) {
    fromMillis = Date.parse(`${query.dateFrom}T00:00:00.000Z`);
  }
  if (query.dateTo) {
    toMillis = Date.parse(`${query.dateTo}T23:59:59.999Z`);
  }

  const valid = months.filter((m) => {
    if (!/^\d{4}-\d{2}$/.test(m)) return false;

    const monthStart = Date.parse(`${m}-01T00:00:00.000Z`);
    if (isNaN(monthStart)) return false;

    const [yStr, mStr] = m.split('-');
    let year = parseInt(yStr as string, 10);
    let month = parseInt(mStr as string, 10);

    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }

    const nextMonthStr = nextMonth.toString().padStart(2, '0');
    const monthEnd = Date.parse(`${nextYear}-${nextMonthStr}-01T00:00:00.000Z`) - 1;

    return monthStart <= toMillis && monthEnd >= fromMillis;
  });

  return valid.sort((a, b) => b.localeCompare(a));
}
