export type DatePreset = 'last30' | 'thisMonth' | 'all' | 'custom';

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolveDatePreset(
  preset: Exclude<DatePreset, 'custom'>,
  now: Date
): { dateFrom: string; dateTo: string } {
  if (preset === 'all') {
    return { dateFrom: '', dateTo: '' };
  }

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();

  const toDate = new Date(Date.UTC(year, month, date));

  if (preset === 'thisMonth') {
    const fromDate = new Date(Date.UTC(year, month, 1));
    return {
      dateFrom: formatUtcDate(fromDate),
      dateTo: formatUtcDate(toDate),
    };
  }

  // 'last30': today minus 29 days through UTC today, inclusive
  const fromDate = new Date(Date.UTC(year, month, date - 29));
  return {
    dateFrom: formatUtcDate(fromDate),
    dateTo: formatUtcDate(toDate),
  };
}
