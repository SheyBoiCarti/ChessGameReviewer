import { describe, expect, it } from 'vitest';

import { resolveDatePreset } from '@/features/ingestion/datePresets';

describe('resolveDatePreset', () => {
  it('resolves exact UTC dates for now = 2026-09-05T12:00:00Z', () => {
    const now = new Date('2026-09-05T12:00:00Z');

    expect(resolveDatePreset('last30', now)).toEqual({
      dateFrom: '2026-08-07',
      dateTo: '2026-09-05',
    });

    expect(resolveDatePreset('thisMonth', now)).toEqual({
      dateFrom: '2026-09-01',
      dateTo: '2026-09-05',
    });

    expect(resolveDatePreset('all', now)).toEqual({
      dateFrom: '',
      dateTo: '',
    });
  });

  it('handles January year rollover for last30 correctly in UTC', () => {
    const now = new Date('2026-01-15T00:00:00Z');

    expect(resolveDatePreset('last30', now)).toEqual({
      dateFrom: '2025-12-17',
      dateTo: '2026-01-15',
    });

    expect(resolveDatePreset('thisMonth', now)).toEqual({
      dateFrom: '2026-01-01',
      dateTo: '2026-01-15',
    });
  });

  it('handles leap-year February correctly in UTC', () => {
    const leapYearNow = new Date('2024-03-01T08:30:00Z');

    expect(resolveDatePreset('last30', leapYearNow)).toEqual({
      dateFrom: '2024-02-01',
      dateTo: '2024-03-01',
    });

    const nonLeapYearNow = new Date('2023-03-01T08:30:00Z');

    expect(resolveDatePreset('last30', nonLeapYearNow)).toEqual({
      dateFrom: '2023-01-31',
      dateTo: '2023-03-01',
    });
  });

  it('does not mutate the input Date object', () => {
    const now = new Date('2026-09-05T12:00:00Z');
    const timeBefore = now.getTime();

    resolveDatePreset('last30', now);
    resolveDatePreset('thisMonth', now);
    resolveDatePreset('all', now);

    expect(now.getTime()).toBe(timeBefore);
  });
});
