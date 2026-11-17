import { useId, useMemo, useRef, useState } from 'react';

import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { moveNotation, toGraphPoints } from '@/features/stockfish-analysis/presentation';

export interface MoveAccuracyGraphProps {
  annotations: readonly GameAnnotation[];
  totalPlies: number;
  selectedPly: number;
  onSelectPly?: ((ply: number) => void) | undefined;
  title?: string | undefined;
  className?: string | undefined;
}

export function MoveAccuracyGraph({
  annotations,
  totalPlies,
  selectedPly,
  onSelectPly,
  title = 'Evaluation',
  className,
}: MoveAccuracyGraphProps) {
  const id = useId();
  const targets = useRef(new Map<number, SVGCircleElement>());
  const [focus, setFocus] = useState<{ selection: number; ply: number } | null>(null);
  const points = useMemo(
    () =>
      toGraphPoints(
        [...annotations]
          .sort((a, b) => a.ply - b.ply)
          .map((annotation) => ({ ply: annotation.ply, evaluation: annotation.after.score }))
      ),
    [annotations]
  );
  const segments = useMemo(() => graphSegments(points, totalPlies), [points, totalPlies]);
  const coords = useMemo(
    () =>
      pointCoordinates(points, totalPlies).filter((p): p is NonNullable<typeof p> => p !== null),
    [points, totalPlies]
  );
  const focusPly =
    focus?.selection === selectedPly && coords.some((p) => p.ply === focus.ply)
      ? focus.ply
      : (coords.find((p) => p.ply === selectedPly)?.ply ?? coords[0]?.ply);
  const selected = coords.find((p) => p.ply === selectedPly);
  const annotationByPly = new Map(annotations.map((a) => [a.ply, a]));
  const description = (ply: number, label: string) => {
    const a = annotationByPly.get(ply)!;
    return `${moveNotation(ply, a.san, a.mover)} · ${label} · White perspective`;
  };
  const focusPoint = (index: number) => {
    const point = coords[Math.max(0, Math.min(coords.length - 1, index))];
    if (point) {
      setFocus({ selection: selectedPly, ply: point.ply });
      targets.current.get(point.ply)?.focus();
    }
  };

  return (
    <section className={className} aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`}>{title}</h4>
      <p id={`${id}-instructions`} className="visually-hidden">
        Arrow keys move between available evaluations. Home and End go to the first and last. Enter
        or Space selects a move. Tab leaves the graph.
      </p>
      <svg
        className="accuracy-graph"
        viewBox="0 0 100 48"
        preserveAspectRatio="none"
        role="group"
        aria-label="Evaluation graph"
        aria-describedby={`${id}-instructions`}
        onClick={(event) => {
          if (!onSelectPly || !coords.length) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - bounds.left) / bounds.width) * 100;
          const nearest = coords.reduce((best, p) =>
            Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best
          );
          setFocus({ selection: selectedPly, ply: nearest.ply });
          onSelectPly(nearest.ply);
        }}
      >
        <line
          className="accuracy-graph__axis"
          x1="0"
          y1="24"
          x2="100"
          y2="24"
          strokeDasharray="2 2"
          strokeWidth="0.5"
        />
        {segments.map((segment, index) => (
          <polyline key={index} points={segment} fill="none" vectorEffect="non-scaling-stroke" />
        ))}
        {selectedPly > 0 && selectedPly <= totalPlies ? (
          <line
            className="accuracy-graph__cursor"
            x1={(selectedPly / Math.max(1, totalPlies)) * 100}
            x2={(selectedPly / Math.max(1, totalPlies)) * 100}
            y1="0"
            y2="48"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {coords.map((p, index) => (
          <g key={p.ply}>
            <circle
              ref={(node) => {
                if (node) targets.current.set(p.ply, node);
                else targets.current.delete(p.ply);
              }}
              cx={p.x}
              cy={p.y}
              r="2"
              className="accuracy-graph__hit"
              vectorEffect="non-scaling-stroke"
              role={onSelectPly ? 'button' : undefined}
              tabIndex={onSelectPly ? (p.ply === focusPly ? 0 : -1) : undefined}
              aria-label={`Graph evaluation point ${p.ply}: ${description(p.ply, p.label)}`}
              aria-current={p.ply === selectedPly ? 'step' : undefined}
              onFocus={() => setFocus({ selection: selectedPly, ply: p.ply })}
              onClick={(event) => {
                if (event.detail === 0) {
                  event.stopPropagation();
                  onSelectPly?.(p.ply);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectPly?.(p.ply);
                } else if (
                  ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(
                    event.key
                  )
                ) {
                  event.preventDefault();
                  focusPoint(
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? coords.length - 1
                        : index + (event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : -1)
                  );
                }
              }}
            >
              <title>{description(p.ply, p.label)}</title>
            </circle>
            <circle
              cx={p.x}
              cy={p.y}
              r={p.ply === selectedPly ? 2 : 1.2}
              className="accuracy-graph__point"
              aria-hidden="true"
            />
          </g>
        ))}
      </svg>
      <p className="accuracy-graph__description" aria-live="polite">
        {selected
          ? description(selected.ply, selected.label)
          : selectedPly === 0
            ? 'Starting position'
            : `Move ${selectedPly}: evaluation unavailable`}
      </p>
    </section>
  );
}

function pointCoordinates(points: ReturnType<typeof toGraphPoints>, totalPlies?: number) {
  const maximumPly = Math.max(1, totalPlies ?? 0, ...points.map(({ ply }) => ply));
  return points.map((point) => {
    if (point.value === null) return null;
    const x = (point.ply / maximumPly) * 100;
    const y = 24 - Math.max(-12, Math.min(12, point.value)) * 2;
    return { ...point, x, y };
  });
}

function graphSegments(points: ReturnType<typeof toGraphPoints>, totalPlies?: number): string[] {
  const maximumPly = Math.max(1, totalPlies ?? 0, ...points.map(({ ply }) => ply));
  const segments: string[][] = [];
  let current: string[] = [];
  let previousPly: number | null = null;
  for (const point of points) {
    if (previousPly !== null && point.ply !== previousPly + 1) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    previousPly = point.ply;
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
