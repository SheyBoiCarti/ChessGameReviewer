import { useMemo } from 'react';

import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { qualityLabel, toGraphPoints } from '@/features/stockfish-analysis/presentation';

export function MoveAccuracyGraph({
  annotations,
  onSelectPly,
}: {
  annotations: readonly GameAnnotation[];
  onSelectPly(ply: number): void;
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
      <svg className="accuracy-graph" viewBox="0 0 100 48" role="img" aria-label="Evaluation graph">
        {segments.map((segment, index) => (
          <polyline key={index} points={segment} fill="none" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <table>
        <caption>Text alternative for the evaluation graph</caption>
        <thead>
          <tr>
            <th>Ply</th>
            <th>Played</th>
            <th>Evaluation</th>
            <th>Quality</th>
          </tr>
        </thead>
        <tbody>
          {annotations.map((annotation, index) => (
            <tr key={annotation.ply}>
              <td>
                <button type="button" onClick={() => onSelectPly(annotation.ply)}>
                  Select ply {annotation.ply}
                </button>
              </td>
              <td>{annotation.san}</td>
              <td>{points[index]?.label ?? 'Evaluation unavailable'}</td>
              <td>{qualityLabel(annotation.accuracy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
