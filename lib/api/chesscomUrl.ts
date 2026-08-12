const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,25}$/;
const YEAR_REGEX = /^\d{4}$/;

export function normalizeUsername(username: string): string {
  const trimmed = username.trim();
  if (!USERNAME_REGEX.test(trimmed)) {
    throw new Error('Invalid username segment');
  }
  return trimmed.toLowerCase();
}

export function formatYearMonth(
  year: string | number,
  month: string | number
): { yearStr: string; monthStr: string } {
  const yearStr = String(year).trim();
  if (!YEAR_REGEX.test(yearStr)) {
    throw new Error('Invalid year parameter: must be 4 digits');
  }
  const yearNum = parseInt(yearStr, 10);
  if (yearNum < 1900 || yearNum > 2100) {
    throw new Error('Invalid year value range');
  }

  let monthNum: number;
  if (typeof month === 'number') {
    monthNum = month;
  } else {
    const trimmedMonth = month.trim();
    if (!/^\d{1,2}$/.test(trimmedMonth)) {
      throw new Error('Invalid month parameter');
    }
    monthNum = parseInt(trimmedMonth, 10);
  }

  if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
    throw new Error('Invalid month value: must be between 1 and 12');
  }

  const monthStr = monthNum < 10 ? `0${monthNum}` : `${monthNum}`;
  return { yearStr, monthStr };
}

export function buildArchivesUrl(username: string): URL {
  const cleanUser = normalizeUsername(username);
  return new URL(
    `/pub/player/${encodeURIComponent(cleanUser)}/games/archives`,
    'https://api.chess.com'
  );
}

export function buildMonthlyUrl(
  username: string,
  year: string | number,
  month: string | number
): URL {
  const cleanUser = normalizeUsername(username);
  const { yearStr, monthStr } = formatYearMonth(year, month);
  return new URL(
    `/pub/player/${encodeURIComponent(cleanUser)}/games/${yearStr}/${monthStr}`,
    'https://api.chess.com'
  );
}

export function isValidRedirectUrl(
  urlStr: string,
  expectedType: 'archives' | 'monthly',
  username: string,
  year?: string | number,
  month?: string | number
): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.origin !== 'https://api.chess.com') {
      return false;
    }

    const cleanUser = normalizeUsername(username);
    let expectedPath: string;

    if (expectedType === 'archives') {
      expectedPath = `/pub/player/${encodeURIComponent(cleanUser)}/games/archives`;
    } else {
      if (year === undefined || month === undefined) {
        return false;
      }
      const { yearStr, monthStr } = formatYearMonth(year, month);
      expectedPath = `/pub/player/${encodeURIComponent(cleanUser)}/games/${yearStr}/${monthStr}`;
    }

    const trimTrailingSlashes = (path: string) => path.replace(/\/+$/, '');
    return (
      trimTrailingSlashes(parsed.pathname.toLowerCase()) ===
      trimTrailingSlashes(expectedPath.toLowerCase())
    );
  } catch {
    return false;
  }
}
