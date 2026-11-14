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
