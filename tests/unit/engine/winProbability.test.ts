import { describe, expect, it } from 'vitest';

import {
  scoreToMoverWinProbability,
  scoreToWhiteWinProbability,
  terminalMoverWinProbability,
} from '@/lib/engine/winProbability';

describe('engine win-probability estimates', () => {
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
});
