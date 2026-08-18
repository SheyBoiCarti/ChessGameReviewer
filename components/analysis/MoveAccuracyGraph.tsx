import { useMemo } from 'react';

import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { toGraphPoints } from '@/features/stockfish-analysis/presentation';

export function MoveAccuracyGraph({
  annotations,
  onSelectPly,
}: {
  annotations: readonly GameAnnotation[];
  onSelectPly?: ((ply: number) => void) | undefined;
}) {
  const points = useMemo(
    () =>
      toGraphPoints(
        annotations.map((annotation) => ({
          ply: annotation.ply,
          evaluation: annotation.after.score,
        }))
      ),
    [annotations]
  );
  const segments = useMemo(() => graphSegments(points), [points]);
  return (
    <section aria-labelledby="accuracy-graph-title">
      <h4 id="accuracy-graph-title">White-perspective evaluation by move</h4>
      <svg
        className="accuracy-graph"
        viewBox="0 0 100 48"
        role="img"
        aria-label="Evaluation graph"
        aria-describedby="analysis-move-list"
      >
        {segments.map((segment, index) => (
          <polyline key={index} points={segment} fill="none" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    </section>
  );
}

function graphSegments(points: ReturnType<typeof toGraphPoints>): string[] {
  const maximumPly = Math.max(1, ...points.map(({ ply }) => ply));
  const segments: string[][] = [];
  let current: string[] = [];
  for (const point of points) {
    if (point.value === null) {
      if (current.length > 1) segments.push(current);
      current = [];
      continue;
    }
    const x = (point.ply / maximumPly) * 100;
    const y = 24 - Math.max(-12, Math.min(12, point.value)) * 2;
    current.push(`${x},${y}`);
  }
  if (current.length > 1) segments.push(current);
  return segments.map((segment) => segment.join(' '));
}
