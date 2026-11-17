import { describe, expect, it } from 'vitest';

import { formatEvaluationScore, normalizeEvaluationBar } from '@/features/board/evaluationBar';

describe('normalizeEvaluationBar', () => {
  it('maps finite White centipawn advantage monotonically and symmetrically', () => {
    const losing = normalizeEvaluationBar({ kind: 'cp', value: -300 });
    const equal = normalizeEvaluationBar({ kind: 'cp', value: 0 });
    const winning = normalizeEvaluationBar({ kind: 'cp', value: 300 });

    expect(losing.kind === 'cp' && equal.kind === 'cp' && winning.kind === 'cp').toBe(true);
    if (losing.kind !== 'cp' || equal.kind !== 'cp' || winning.kind !== 'cp') return;
    expect(losing.whitePercent).toBeLessThan(equal.whitePercent);
    expect(equal.whitePercent).toBe(50);
    expect(winning.whitePercent).toBeGreaterThan(equal.whitePercent);
    expect(losing.whitePercent + winning.whitePercent).toBeCloseTo(100, 5);
  });

  it('preserves mate separately from centipawns', () => {
    expect(normalizeEvaluationBar({ kind: 'mate', value: -3 })).toEqual({
      kind: 'mate',
      value: -3,
      whitePercent: 0,
      text: 'Black has mate in 3',
    });
    expect(normalizeEvaluationBar({ kind: 'mate', value: 2 })).toMatchObject({
      whitePercent: 100,
      text: 'White has mate in 2',
    });
    expect(normalizeEvaluationBar({ kind: 'mate', value: 0 })).toMatchObject({
      whitePercent: 50,
      text: 'White has mate in 0',
    });
  });

  it.each([undefined, { kind: 'cp', value: Number.POSITIVE_INFINITY } as const])(
    'renders %s as unknown without NaN or Infinity',
    (score) => {
      expect(normalizeEvaluationBar(score)).toEqual({
        kind: 'unknown',
        whitePercent: 50,
        text: 'Evaluation unavailable',
      });
    }
  );
});

describe('formatEvaluationScore', () => {
  it('formats positive, neutral, and negative centipawn evaluations', () => {
    expect(formatEvaluationScore({ kind: 'cp', value: 150 })).toBe('+1.5');
    expect(formatEvaluationScore({ kind: 'cp', value: 300 })).toBe('+3.0');
    expect(formatEvaluationScore({ kind: 'cp', value: 0 })).toBe('0.0');
    expect(formatEvaluationScore({ kind: 'cp', value: 2 })).toBe('0.0');
    expect(formatEvaluationScore({ kind: 'cp', value: -120 })).toBe('-1.2');
    expect(formatEvaluationScore({ kind: 'cp', value: -350 })).toBe('-3.5');
  });

  it('formats mate scores for both sides', () => {
    expect(formatEvaluationScore({ kind: 'mate', value: 2 })).toBe('M2');
    expect(formatEvaluationScore({ kind: 'mate', value: 1 })).toBe('M1');
    expect(formatEvaluationScore({ kind: 'mate', value: -3 })).toBe('-M3');
    expect(formatEvaluationScore({ kind: 'mate', value: -1 })).toBe('-M1');
    expect(formatEvaluationScore({ kind: 'mate', value: 0 })).toBe('M0');
  });

  it('handles undefined and non-finite scores safely', () => {
    expect(formatEvaluationScore(undefined)).toBe('0.0');
    expect(formatEvaluationScore({ kind: 'cp', value: Number.NaN })).toBe('0.0');
    expect(formatEvaluationScore({ kind: 'cp', value: Number.POSITIVE_INFINITY })).toBe('0.0');
  });
});
