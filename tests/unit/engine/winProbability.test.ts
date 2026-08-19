import { describe, expect, it } from 'vitest';

import {
  lossToAccuracyEstimate,
  scoreToMoverExpectedPoints,
  scoreToMoverWinProbability,
  scoreToWhiteWinProbability,
  terminalMoverWinProbability,
} from '@/lib/engine/winProbability';

describe('engine win-probability and expected points estimates', () => {
  it('maps centipawn scores monotonically and safely at extremes', () => {
    expect(scoreToWhiteWinProbability({ kind: 'cp', value: 0 })).toBe(0.5);
    expect(scoreToWhiteWinProbability({ kind: 'cp', value: 400 })).toBeGreaterThan(0.9);
    expect(scoreToWhiteWinProbability({ kind: 'cp', value: 1_000_000 })).toBe(1);
    expect(scoreToWhiteWinProbability({ kind: 'cp', value: -1_000_000 })).toBe(0);
  });

  it('uses direct terminal probabilities for exact mate scores and keeps bounds indeterminate', () => {
    expect(scoreToWhiteWinProbability({ kind: 'mate', value: 4 })).toBe(1);
    expect(scoreToMoverWinProbability({ kind: 'mate', value: 4 }, 'black')).toBe(0);
    expect(scoreToWhiteWinProbability({ kind: 'cp', value: 50, bound: 'upper' })).toBeNull();
    expect(scoreToWhiteWinProbability({ kind: 'cp', value: Number.NaN })).toBeNull();
  });

  it('recognizes checkmate, stalemate, and insufficient material directly from complete FEN', () => {
    expect(terminalMoverWinProbability('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1', 'white')).toBe(1);
    expect(terminalMoverWinProbability('7k/5Q2/7K/8/8/8/8/8 b - - 0 1', 'white')).toBe(0.5);
    expect(terminalMoverWinProbability('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'black')).toBe(0.5);
  });

  it('converts expected points with rating context using neutral fallback', () => {
    const score = { kind: 'cp' as const, value: 100 };
    const neutral = scoreToMoverExpectedPoints(score, 'white');
    const withRatings = scoreToMoverExpectedPoints(score, 'white', {
      moverRating: 1500,
      opponentRating: 1600,
    });
    expect(neutral).not.toBeNull();
    expect(withRatings).toBe(neutral);
  });

  describe('lossToAccuracyEstimate', () => {
    it('returns 100 at zero or negative loss and 0 at full or excessive loss', () => {
      expect(lossToAccuracyEstimate(0)).toBe(100);
      expect(lossToAccuracyEstimate(-0.05)).toBe(100);
      expect(lossToAccuracyEstimate(1)).toBe(0);
      expect(lossToAccuracyEstimate(1.5)).toBe(0);
    });

    it('applies the approved nonlinear exponential curve with k=5', () => {
      // accuracy = 100 * (exp(-5 * loss) - exp(-5)) / (1 - exp(-5))
      // loss 0.02: 100 * (exp(-0.1) - exp(-5)) / (1 - exp(-5)) ≈ 90.42%
      expect(lossToAccuracyEstimate(0.02)).toBeCloseTo(90.42, 1);
      // loss 0.05: 100 * (exp(-0.25) - exp(-5)) / (1 - exp(-5)) ≈ 77.73%
      expect(lossToAccuracyEstimate(0.05)).toBeCloseTo(77.73, 1);
      // loss 0.10: 100 * (exp(-0.5) - exp(-5)) / (1 - exp(-5)) ≈ 60.39%
      expect(lossToAccuracyEstimate(0.1)).toBeCloseTo(60.39, 1);
      // loss 0.20: 100 * (exp(-1.0) - exp(-5)) / (1 - exp(-5)) ≈ 36.36%
      expect(lossToAccuracyEstimate(0.2)).toBeCloseTo(36.36, 1);
    });

    it('is strictly non-increasing and bounded within [0, 100]', () => {
      const losses = [0, 0.01, 0.05, 0.1, 0.2, 0.5, 0.8, 1.0];
      for (let i = 0; i < losses.length - 1; i++) {
        const acc1 = lossToAccuracyEstimate(losses[i]!);
        const acc2 = lossToAccuracyEstimate(losses[i + 1]!);
        expect(acc1).toBeGreaterThanOrEqual(acc2);
        expect(acc1).toBeGreaterThanOrEqual(0);
        expect(acc1).toBeLessThanOrEqual(100);
      }
    });

    it('handles non-finite values safely', () => {
      expect(lossToAccuracyEstimate(Number.NaN)).toBe(100);
      expect(lossToAccuracyEstimate(Number.POSITIVE_INFINITY)).toBe(0);
      expect(lossToAccuracyEstimate(Number.NEGATIVE_INFINITY)).toBe(100);
    });
  });
});
