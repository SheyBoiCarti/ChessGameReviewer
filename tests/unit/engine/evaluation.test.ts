import { describe, expect, it } from 'vitest';

import {
  calculateCentipawnLoss,
  normalizeUciScoreToWhite,
  parseFenSideToMove,
  toMoverPerspective,
} from '@/lib/engine/evaluation';

describe('engine evaluation normalization', () => {
  const whiteToMove = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
  const blackToMove = '4k3/8/8/8/8/8/8/4K3 b - - 0 1';

  it('requires a valid complete FEN when reading the active colour', () => {
    expect(parseFenSideToMove(whiteToMove)).toBe('white');
    expect(parseFenSideToMove(blackToMove)).toBe('black');
    expect(() => parseFenSideToMove('4k3/8/8/8/8/8/8/4K3 w - -')).toThrow('INVALID_FEN');
  });

  it('normalizes UCI scores to a White perspective regardless of active colour', () => {
    expect(normalizeUciScoreToWhite({ kind: 'cp', value: 83 }, whiteToMove)).toEqual({
      kind: 'cp',
      value: 83,
    });
    expect(normalizeUciScoreToWhite({ kind: 'cp', value: -83 }, blackToMove)).toEqual({
      kind: 'cp',
      value: 83,
    });
    expect(normalizeUciScoreToWhite({ kind: 'mate', value: -3 }, blackToMove)).toEqual({
      kind: 'mate',
      value: 3,
    });
  });

  it('uses mover perspective before calculating equivalent White and Black losses', () => {
    expect(toMoverPerspective({ kind: 'cp', value: 120 }, 'black')).toEqual({
      kind: 'cp',
      value: -120,
    });
    expect(
      calculateCentipawnLoss({ kind: 'cp', value: 120 }, { kind: 'cp', value: 70 }, 'white')
    ).toBe(50);
    expect(
      calculateCentipawnLoss({ kind: 'cp', value: -120 }, { kind: 'cp', value: -70 }, 'black')
    ).toBe(50);
    expect(
      calculateCentipawnLoss({ kind: 'cp', value: -20 }, { kind: 'cp', value: -60 }, 'black')
    ).toBe(0);
  });

  it('keeps mate and bound scores explicit and rejects non-finite scores', () => {
    expect(
      normalizeUciScoreToWhite({ kind: 'cp', value: 20, bound: 'lower' }, whiteToMove)
    ).toEqual({
      kind: 'cp',
      value: 20,
      bound: 'lower',
    });
    expect(
      calculateCentipawnLoss({ kind: 'mate', value: 2 }, { kind: 'mate', value: 1 }, 'white')
    ).toBeNull();
    expect(
      normalizeUciScoreToWhite({ kind: 'cp', value: Number.POSITIVE_INFINITY }, whiteToMove)
    ).toBeNull();
  });
});
