import { describe, expect, it } from 'vitest';
import {
  openingFrequencyBand,
  arrowPaletteForScope,
  selectOpeningArrows,
  type CandidateMove,
} from '@/features/opening-tree/selectors';
import { describeOutcome } from '@/lib/metrics/descriptive';

describe('openingFrequencyBand', () => {
  it('strictly adheres to frequency band boundaries (>0.8 strong, >0.3 medium, <=0.3 rare)', () => {
    expect(openingFrequencyBand(8, 10)).toBe('medium');
    expect(openingFrequencyBand(3, 10)).toBe('rare');
    expect(openingFrequencyBand(9, 10)).toBe('strong');

    expect(openingFrequencyBand(0, 10)).toBe('rare');
    expect(openingFrequencyBand(0, 0)).toBe('rare');
    expect(openingFrequencyBand(80, 100)).toBe('medium');
    expect(openingFrequencyBand(81, 100)).toBe('strong');
    expect(openingFrequencyBand(30, 100)).toBe('rare');
    expect(openingFrequencyBand(31, 100)).toBe('medium');
  });
});

describe('arrowPaletteForScope', () => {
  it('selects own/opponent palette relative to scope and side to move; both is neutral', () => {
    expect(arrowPaletteForScope('white', 'white')).toBe('own');
    expect(arrowPaletteForScope('white', 'black')).toBe('opponent');

    expect(arrowPaletteForScope('black', 'black')).toBe('own');
    expect(arrowPaletteForScope('black', 'white')).toBe('opponent');

    expect(arrowPaletteForScope('both', 'white')).toBe('neutral');
    expect(arrowPaletteForScope('both', 'black')).toBe('neutral');

    expect(arrowPaletteForScope(null, 'white')).toBe('neutral');
    expect(arrowPaletteForScope(undefined, 'black')).toBe('neutral');
  });
});

describe('selectOpeningArrows', () => {
  const dummyCandidate = (uci: string, sampleSize: number): CandidateMove => ({
    uci,
    san: uci,
    targetKey: 'key',
    continuationShare: 0.5,
    metrics: describeOutcome({
      games: sampleSize,
      userWins: 0,
      draws: 0,
      userLosses: 0,
      whiteWins: 0,
      blackWins: 0,
      opponentRatingSum: 0,
      opponentRatingCount: 0,
    }),
  });

  it('generates opening arrows with correct frequency band and palette', () => {
    const candidates = [
      dummyCandidate('e2e4', 10),
      dummyCandidate('d2d4', 5),
      dummyCandidate('c2c4', 2),
    ];

    const arrows = selectOpeningArrows(candidates, 'e2e4', 'white', 'white');
    expect(arrows).toHaveLength(3);

    expect(arrows[0]).toEqual({
      from: 'e2',
      to: 'e4',
      uci: 'e2e4',
      band: 'strong',
      palette: 'own',
      active: true,
    });

    expect(arrows[1]).toEqual({
      from: 'd2',
      to: 'd4',
      uci: 'd2d4',
      band: 'medium',
      palette: 'own',
      active: false,
    });

    expect(arrows[2]).toEqual({
      from: 'c2',
      to: 'c4',
      uci: 'c2c4',
      band: 'rare',
      palette: 'own',
      active: false,
    });
  });

  it('keeps opponent palette after black scope when White moves', () => {
    const candidates = [dummyCandidate('e2e4', 10)];
    const arrows = selectOpeningArrows(candidates, null, 'black', 'white');
    expect(arrows[0]!.palette).toBe('opponent');
  });

  it('keeps own palette after black scope when Black moves', () => {
    const candidates = [dummyCandidate('e7e5', 10)];
    const arrows = selectOpeningArrows(candidates, null, 'black', 'black');
    expect(arrows[0]!.palette).toBe('own');
  });
});
