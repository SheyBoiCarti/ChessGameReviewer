import type { GameAnnotation } from './analyzeGame';

export function nextMistakePly(
  annotations: readonly GameAnnotation[],
  selectedPly: number
): number | null {
  return annotations
    .filter(
      (a) =>
        a.ply > selectedPly &&
        a.accuracy.status === 'classified' &&
        ['mistake', 'blunder', 'miss'].includes(a.accuracy.quality)
    )
    .reduce<number | null>((next, a) => (next === null ? a.ply : Math.min(next, a.ply)), null);
}

export function previousMistakePly(
  annotations: readonly GameAnnotation[],
  selectedPly: number
): number | null {
  return annotations
    .filter(
      (a) =>
        a.ply < selectedPly &&
        a.accuracy.status === 'classified' &&
        ['mistake', 'blunder', 'miss'].includes(a.accuracy.quality)
    )
    .reduce<number | null>((prev, a) => (prev === null ? a.ply : Math.max(prev, a.ply)), null);
}

export interface ReviewFilter {
  mover?: import('@/lib/engine/evaluation').PlayerColor | undefined;
  quality?: import('@/lib/engine/accuracy').MoveQuality | undefined;
}
export function filterReviewPlies(
  annotations: readonly GameAnnotation[],
  filter: ReviewFilter
): readonly number[] {
  return annotations
    .filter(
      (a) =>
        a.accuracy.status === 'classified' &&
        (!filter.mover || a.mover === filter.mover) &&
        (!filter.quality || a.accuracy.quality === filter.quality)
    )
    .map((a) => a.ply)
    .sort((a, b) => a - b);
}

/** Mistakes plus at most three notable good moves, using existing grades only. */
export function reviewMomentPlies(
  annotations: readonly GameAnnotation[],
  filter: ReviewFilter
): readonly number[] {
  if (filter.quality) return filterReviewPlies(annotations, filter);
  const eligible = filterReviewPlies(annotations, filter);
  const notable = annotations
    .filter(
      (a) =>
        eligible.includes(a.ply) &&
        a.accuracy.status === 'classified' &&
        ['brilliant', 'great', 'best'].includes(a.accuracy.quality)
    )
    .sort((a, b) => a.ply - b.ply)
    .slice(0, 3)
    .map((a) => a.ply);
  return eligible.filter(
    (ply) =>
      notable.includes(ply) ||
      annotations.some(
        (a) =>
          a.ply === ply &&
          a.accuracy.status === 'classified' &&
          ['mistake', 'blunder', 'miss'].includes(a.accuracy.quality)
      )
  );
}

export function reviewMomentNavigation(
  annotations: readonly GameAnnotation[],
  selectedPly: number,
  filter: ReviewFilter
) {
  const plies = reviewMomentPlies(annotations, filter);
  return {
    plies,
    first: plies[0] ?? null,
    next: plies.find((ply) => ply > selectedPly) ?? null,
    previous: [...plies].reverse().find((ply) => ply < selectedPly) ?? null,
  };
}
