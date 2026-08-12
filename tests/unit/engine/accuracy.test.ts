import { describe, expect, it } from 'vitest';

import {
  ACCURACY_ESTIMATE_NAME,
  ACCURACY_HEURISTIC_VERSION,
  classifyMoveAccuracy,
} from '@/lib/engine/accuracy';

describe('Analyzer accuracy estimate v1', () => {
  const white = (value: number) => ({ kind: 'cp' as const, value });

  it('is explicitly versioned and named as a project estimate', () => {
    expect(ACCURACY_HEURISTIC_VERSION).toBe('analyzer-accuracy-v1');
    expect(ACCURACY_ESTIMATE_NAME).toBe('Analyzer accuracy estimate');
  });

  it.each([
    [0, 'best'],
    [0.02, 'excellent'],
    [0.020001, 'good'],
    [0.05, 'good'],
    [0.050001, 'inaccuracy'],
    [0.1, 'inaccuracy'],
    [0.100001, 'mistake'],
    [0.2, 'mistake'],
    [0.200001, 'blunder'],
  ] as const)(
    'uses exhaustive non-overlapping probability-loss thresholds at %s',
    (loss, quality) => {
      expect(
        classifyMoveAccuracy({ beforeProbability: 1, afterProbability: 1 - loss })
      ).toMatchObject({
        status: 'classified',
        quality,
      });
    }
  );

  it('does not mislabel a good Black move after perspective conversion', () => {
    expect(
      classifyMoveAccuracy({ before: white(-100), after: white(-130), mover: 'black' })
    ).toMatchObject({
      status: 'classified',
      quality: 'best',
      probabilityLoss: 0,
    });
  });

  it('treats forced mates as explicit transitions rather than generic misses', () => {
    expect(
      classifyMoveAccuracy({
        before: { kind: 'mate', value: 3 },
        after: { kind: 'mate', value: 1 },
        mover: 'white',
      })
    ).toMatchObject({ quality: 'mate-retained' });
    expect(
      classifyMoveAccuracy({ before: { kind: 'mate', value: 3 }, after: white(0), mover: 'white' })
    ).toMatchObject({ quality: 'miss' });
    expect(
      classifyMoveAccuracy({ before: white(0), after: { kind: 'mate', value: 2 }, mover: 'white' })
    ).toMatchObject({ quality: 'mate-gained' });
    expect(
      classifyMoveAccuracy({
        before: white(80),
        after: { kind: 'mate', value: -2 },
        mover: 'white',
      })
    ).toMatchObject({ quality: 'mate-conceded' });
  });

  it('returns indeterminate instead of a definitive quality for bound or non-finite scores', () => {
    expect(
      classifyMoveAccuracy({
        before: { ...white(40), bound: 'lower' },
        after: white(20),
        mover: 'white',
      })
    ).toEqual({ status: 'indeterminate', reason: 'bound-score' });
    expect(
      classifyMoveAccuracy({ before: white(Number.NaN), after: white(20), mover: 'white' })
    ).toEqual({ status: 'indeterminate', reason: 'non-finite-score' });
  });
});
