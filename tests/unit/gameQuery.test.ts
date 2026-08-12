import { describe, expect, it } from 'vitest';
import { validateGameQuery } from '@/lib/validation/gameQuery';

describe('validateGameQuery', () => {
  it('accepts a minimal valid game query with defaults', () => {
    const input = {
      username: 'hikaru',
      timeClasses: ['blitz'],
      colors: ['white'],
    };

    const result = validateGameQuery(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        username: 'hikaru',
        maxGames: 500,
        timeClasses: ['blitz'],
        colors: ['white'],
      });
    }
  });

  it('normalizes username and set-like filters without duplicates', () => {
    const result = validateGameQuery({
      username: '  MagnusCarlsen  ',
      timeClasses: ['blitz', 'blitz', 'rapid'],
      colors: ['white', 'white'],
    });
    expect(result).toEqual({
      success: true,
      data: {
        username: 'magnuscarlsen',
        maxGames: 500,
        timeClasses: ['blitz', 'rapid'],
        colors: ['white'],
      },
    });
  });

  it('accepts a fully specified valid game query', () => {
    const input = {
      username: 'Magnus-Carlsen_99',
      dateFrom: '2024-01-01',
      dateTo: '2024-06-30',
      maxGames: 1000,
      timeClasses: ['bullet', 'blitz', 'rapid', 'daily'],
      colors: ['white', 'black'],
      rated: true,
    };

    const result = validateGameQuery(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxGames).toBe(1000);
      expect(result.data.rated).toBe(true);
    }
  });

  describe('username grammar and length validation', () => {
    it.each([
      ['ab', 'too short (<3 chars)'],
      ['a'.repeat(26), 'too long (>25 chars)'],
      ['user name', 'contains space'],
      ['user@chess', 'contains invalid char @'],
      ['', 'empty string'],
    ])('rejects invalid username %s (%s)', (username) => {
      const result = validateGameQuery({
        username,
        timeClasses: ['blitz'],
        colors: ['white'],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostics.some((d) => d.code === 'INVALID_USERNAME')).toBe(true);
      }
    });

    it.each(['abc', 'Hikaru_Nakamura', 'user-name-123', 'a_b-c'])(
      'accepts valid username %s',
      (username) => {
        const result = validateGameQuery({
          username,
          timeClasses: ['blitz'],
          colors: ['white'],
        });
        expect(result.success).toBe(true);
      }
    );
  });

  describe('UTC date bounds and inverted ranges', () => {
    it('rejects malformed dateFrom or dateTo strings', () => {
      const result1 = validateGameQuery({
        username: 'hikaru',
        dateFrom: '2024/01/01',
        timeClasses: ['blitz'],
        colors: ['white'],
      });
      expect(result1.success).toBe(false);

      const result2 = validateGameQuery({
        username: 'hikaru',
        dateTo: '2024-02-31', // invalid calendar date
        timeClasses: ['blitz'],
        colors: ['white'],
      });
      expect(result2.success).toBe(false);
    });

    it('rejects inverted date range (dateFrom > dateTo)', () => {
      const result = validateGameQuery({
        username: 'hikaru',
        dateFrom: '2024-06-01',
        dateTo: '2024-01-01',
        timeClasses: ['blitz'],
        colors: ['white'],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostics.some((d) => d.code === 'INVERTED_DATE_RANGE')).toBe(true);
      }
    });

    it('accepts equal dateFrom and dateTo', () => {
      const result = validateGameQuery({
        username: 'hikaru',
        dateFrom: '2024-01-15',
        dateTo: '2024-01-15',
        timeClasses: ['blitz'],
        colors: ['white'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('maxGames bounds (1 to 5000)', () => {
    it.each([0, -5, 5001, 10000, 1.5])('rejects invalid maxGames %s', (maxGames) => {
      const result = validateGameQuery({
        username: 'hikaru',
        maxGames,
        timeClasses: ['blitz'],
        colors: ['white'],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostics.some((d) => d.code === 'INVALID_MAX_GAMES')).toBe(true);
      }
    });

    it.each([1, 500, 5000])('accepts valid maxGames boundary %s', (maxGames) => {
      const result = validateGameQuery({
        username: 'hikaru',
        maxGames,
        timeClasses: ['blitz'],
        colors: ['white'],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('timeClasses and colors set validation', () => {
    it('rejects empty timeClasses set', () => {
      const result = validateGameQuery({
        username: 'hikaru',
        timeClasses: [],
        colors: ['white'],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostics.some((d) => d.code === 'INVALID_TIME_CLASSES')).toBe(true);
      }
    });

    it('rejects invalid timeClass values', () => {
      const result = validateGameQuery({
        username: 'hikaru',
        timeClasses: ['bullet', 'invalid_class' as any],
        colors: ['white'],
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty colors set', () => {
      const result = validateGameQuery({
        username: 'hikaru',
        timeClasses: ['blitz'],
        colors: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostics.some((d) => d.code === 'INVALID_COLORS')).toBe(true);
      }
    });
  });

  describe('rated status validation', () => {
    it('rejects non-boolean rated property', () => {
      const result = validateGameQuery({
        username: 'hikaru',
        timeClasses: ['blitz'],
        colors: ['white'],
        rated: 'yes' as any,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('unknown input narrowing', () => {
    it('rejects non-object input (null, undefined, number, string)', () => {
      expect(validateGameQuery(null).success).toBe(false);
      expect(validateGameQuery(undefined).success).toBe(false);
      expect(validateGameQuery(123).success).toBe(false);
      expect(validateGameQuery('hikaru').success).toBe(false);
    });
  });
});
