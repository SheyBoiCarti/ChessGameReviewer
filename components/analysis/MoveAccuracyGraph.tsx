import { useMemo } from 'react';

import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { toGraphPoints } from '@/features/stockfish-analysis/presentation';

export interface MoveAccuracyGraphProps {
  annotations: readonly GameAnnotation[];
  onSelectPly?: ((ply: number) => void) | undefined;
  title?: string | undefined;
  className?: string | undefined;
}

export function MoveAccuracyGraph({
  annotations,
  onSelectPly,
  title = 'Evaluation',
  className,
}: MoveAccuracyGraphProps) {
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
  const coords = useMemo(() => pointCoordinates(points), [points]);

  return (
    <section className={className} aria-labelledby="accuracy-graph-title">
      <h4 id="accuracy-graph-title">{title}</h4>
      <svg
        className="accuracy-graph"
        viewBox="0 0 100 48"
        role="group"
        aria-label="Evaluation graph"
        aria-describedby="analysis-move-list"
      >
        <line
          x1="0"
          y1="24"
          x2="100"
          y2="24"
          stroke="rgba(255, 255, 255, 0.15)"
          strokeDasharray="2 2"
          strokeWidth="0.5"
        />
        {segments.map((segment, index) => (
          <polyline key={index} points={segment} fill="none" vectorEffect="non-scaling-stroke" />
        ))}
        {coords
          .filter((p): p is NonNullable<typeof p> => p !== null)
          .map((p) => (
            <circle
              key={p.ply}
              cx={p.x}
              cy={p.y}
              r={onSelectPly ? 1.8 : 1.2}
              className="accuracy-graph__point"
              role={onSelectPly ? 'button' : undefined}
              tabIndex={onSelectPly ? 0 : undefined}
              aria-label={`Graph evaluation point ${p.ply}`}
              onClick={() => onSelectPly?.(p.ply)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectPly?.(p.ply);
                }
              }}
            />
          ))}
      </svg>
    </section>
  );
}

function pointCoordinates(points: ReturnType<typeof toGraphPoints>) {
  const maximumPly = Math.max(1, ...points.map(({ ply }) => ply));
  return points.map((point) => {
    if (point.value === null) return null;
    const x = (point.ply / maximumPly) * 100;
    const y = 24 - Math.max(-12, Math.min(12, point.value)) * 2;
    return { ...point, x, y };
  });
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
