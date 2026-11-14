import { describe, expect, it } from 'vitest';
import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { nextMistakePly } from '@/features/stockfish-analysis/reviewNavigation';

function createMockAnnotation(
  ply: number,
  qualityOrStatus:
    | 'mistake'
    | 'blunder'
    | 'miss'
    | 'inaccuracy'
    | 'forced'
    | 'good'
    | 'indeterminate'
): GameAnnotation {
  return {
    ply,
    san: 'e4',
    uci: 'e2e4',
    mover: ply % 2 === 1 ? 'white' : 'black',
    before: {
      score: { kind: 'cp', value: 20 },
      depth: 12,
      pv: ['e2e4'],
      bestMove: 'e2e4',
      candidates: [],
    },
    after: {
      score: { kind: 'cp', value: 15 },
      depth: 12,
      pv: ['e7e5'],
      bestMove: 'e7e5',
      candidates: [],
    },
    accuracy:
      qualityOrStatus === 'indeterminate'
        ? { status: 'indeterminate', reason: 'non-finite-score' }
        : {
            status: 'classified',
            quality: qualityOrStatus,
            probabilityLoss: 0.1,
            accuracyEstimate: 95,
            heuristicVersion: 'analyzer-accuracy-v3',
          },
    settings: {
      engineBuild: 'stockfish-18',
      networkHash: 'nnue-test',
      limit: { depth: 12 },
      multiPv: 1,
      threads: 1,
      hashMb: 32,
      analysisVersion: 'analyzer-accuracy-v3',
      normalizationVersion: 'normalization-v1',
    },
  };
}

describe('nextMistakePly', () => {
  it('returns null for an empty array of annotations', () => {
    expect(nextMistakePly([], 0)).toBeNull();
  });

  it('finds the earliest mistake ply greater than selectedPly even when annotations are unsorted', () => {
    const annotations = Object.freeze([
      createMockAnnotation(9, 'blunder'),
      createMockAnnotation(3, 'mistake'),
      createMockAnnotation(7, 'good'),
      createMockAnnotation(1, 'good'),
    ]);

    // From ply 0, next mistake is 3
    expect(nextMistakePly(annotations, 0)).toBe(3);
    // From ply 3, next mistake is 9
    expect(nextMistakePly(annotations, 3)).toBe(9);
    // From ply 9, no further mistakes exist -> null (no wrapping)
    expect(nextMistakePly(annotations, 9)).toBeNull();
    // From ply 10, null
    expect(nextMistakePly(annotations, 10)).toBeNull();
  });

  it('includes mistake, blunder, and miss classifications', () => {
    const annotations = [
      createMockAnnotation(2, 'mistake'),
      createMockAnnotation(4, 'blunder'),
      createMockAnnotation(6, 'miss'),
    ];

    expect(nextMistakePly(annotations, 0)).toBe(2);
    expect(nextMistakePly(annotations, 2)).toBe(4);
    expect(nextMistakePly(annotations, 4)).toBe(6);
    expect(nextMistakePly(annotations, 6)).toBeNull();
  });

  it('excludes inaccuracies, forced moves, good moves, and indeterminate statuses', () => {
    const annotations = [
      createMockAnnotation(1, 'inaccuracy'),
      createMockAnnotation(2, 'forced'),
      createMockAnnotation(3, 'indeterminate'),
      createMockAnnotation(4, 'good'),
      createMockAnnotation(5, 'blunder'),
    ];

    expect(nextMistakePly(annotations, 0)).toBe(5);
  });

  it('does not mutate the input array', () => {
    const annotations = Object.freeze([
      createMockAnnotation(5, 'blunder'),
      createMockAnnotation(2, 'mistake'),
    ]);
    const clone = [...annotations];

    const result = nextMistakePly(annotations, 0);
    expect(result).toBe(2);
    expect(annotations).toEqual(clone);
  });
});

it('starts at five and stops without wrapping in a partial or full game', async () => {
  const { createLongGameAnalysisResult } = await import('../../fixtures/longAnalysisFixture');
  const { previousMistakePly } = await import('@/features/stockfish-analysis/reviewNavigation');
  const result = createLongGameAnalysisResult(15);
  expect(nextMistakePly(result.annotations, 0)).toBe(5);
  expect(nextMistakePly(result.annotations, 15)).toBeNull();
  expect(previousMistakePly(result.annotations, 0)).toBeNull();
  expect(previousMistakePly(result.annotations, 15)).toBe(14);
});

it('filters only completed classifications by player and quality in original order', async () => {
  const { filterReviewPlies } = await import('@/features/stockfish-analysis/reviewNavigation');
  const { createLongGameAnalysisResult } = await import('../../fixtures/longAnalysisFixture');
  const result = createLongGameAnalysisResult(15);
  expect(filterReviewPlies(result.annotations, { mover: 'white', quality: 'mistake' })).toEqual([
    5, 15,
  ]);
  expect(filterReviewPlies([createMockAnnotation(3, 'indeterminate')], {})).toEqual([]);
  expect(filterReviewPlies([...result.annotations].reverse(), { quality: 'mistake' })).toEqual([
    5, 10, 15,
  ]);
});

it('includes a restrained set of notable existing grades and keeps navigation in the filter', async () => {
  const { reviewMomentNavigation } = await import('@/features/stockfish-analysis/reviewNavigation');
  const annotations = [1, 2, 3, 4, 5].map((ply) => ({
    ...createMockAnnotation(ply, 'good'),
    accuracy: {
      ...createMockAnnotation(ply, 'good').accuracy,
      status: 'classified' as const,
      quality: 'best' as const,
      probabilityLoss: 0,
      accuracyEstimate: 100,
      heuristicVersion: 'analyzer-accuracy-v3' as const,
    },
  }));
  expect(reviewMomentNavigation(annotations, 0, {}).plies).toEqual([1, 2, 3]);
  expect(reviewMomentNavigation(annotations, 1, { mover: 'white', quality: 'best' })).toMatchObject(
    { next: 3, previous: null, plies: [1, 3, 5] }
  );
  expect(
    reviewMomentNavigation(annotations, 5, { mover: 'white', quality: 'best' }).next
  ).toBeNull();
});
