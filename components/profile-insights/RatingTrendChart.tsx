'use client';

import React from 'react';
import type { RatingHistoryPoint } from '@/features/profile-insights/types';

export interface RatingTrendChartProps {
  points: readonly RatingHistoryPoint[];
  width?: number;
  height?: number;
}

export function RatingTrendChart({
  points,
  width = 640,
  height = 240,
}: RatingTrendChartProps): React.JSX.Element {
  if (points.length === 0) {
    return (
      <div className="profile-insights-card profile-rating-card">
        <h3 className="profile-card-title">Rating Trajectory</h3>
        <div className="profile-empty-state">
          <p>No rating history available for this selection.</p>
        </div>
      </div>
    );
  }

  const ratings = points.map((p) => p.rating);
  const minR = Math.min(...ratings);
  const maxR = Math.max(...ratings);

  const yMin = Math.floor((minR - 15) / 25) * 25;
  const yMax = Math.ceil((maxR + 15) / 25) * 25;
  const yRange = yMax - yMin || 1;

  const padLeft = 50;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const coords = points.map((p, i) => {
    const x =
      points.length === 1 ? padLeft + plotW / 2 : padLeft + (i / (points.length - 1)) * plotW;
    const y = padTop + plotH - ((p.rating - yMin) / yRange) * plotH;
    return { x, y, point: p };
  });

  const polylinePoints = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  const areaPoints =
    `${coords[0]!.x.toFixed(1)},${(padTop + plotH).toFixed(1)} ` +
    polylinePoints +
    ` ${coords[coords.length - 1]!.x.toFixed(1)},${(padTop + plotH).toFixed(1)}`;

  const firstRating = points[0]!.rating;
  const lastRating = points[points.length - 1]!.rating;
  const delta = lastRating - firstRating;
  const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
  const deltaClass =
    delta > 0
      ? 'profile-rating-delta--positive'
      : delta < 0
        ? 'profile-rating-delta--negative'
        : 'profile-rating-delta--neutral';

  const midRating = Math.round((yMin + yMax) / 2);

  const accessibleLabel = `Rating progression from ${firstRating} to ${lastRating} across ${points.length} games. Net change: ${deltaStr}`;

  return (
    <div className="profile-insights-card profile-rating-card">
      <div className="profile-card-header">
        <h3 className="profile-card-title">Rating Trajectory</h3>
        <div className="profile-rating-meta">
          <span className="profile-rating-current">
            Current: <strong>{lastRating}</strong>
          </span>
          <span className={`profile-rating-delta ${deltaClass}`}>{deltaStr}</span>
        </div>
      </div>

      <div className="profile-chart-container">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="profile-rating-svg"
          role="img"
          aria-label={accessibleLabel}
        >
          <defs>
            <linearGradient id="ratingAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--action-bg, #81b64c)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--action-bg, #81b64c)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid lines and rating labels */}
          <line
            x1={padLeft}
            y1={padTop}
            x2={width - padRight}
            y2={padTop}
            className="profile-chart-grid"
          />
          <text x={padLeft - 8} y={padTop + 4} textAnchor="end" className="profile-chart-axis-text">
            {yMax}
          </text>

          <line
            x1={padLeft}
            y1={padTop + plotH / 2}
            x2={width - padRight}
            y2={padTop + plotH / 2}
            className="profile-chart-grid"
          />
          <text
            x={padLeft - 8}
            y={padTop + plotH / 2 + 4}
            textAnchor="end"
            className="profile-chart-axis-text"
          >
            {midRating}
          </text>

          <line
            x1={padLeft}
            y1={padTop + plotH}
            x2={width - padRight}
            y2={padTop + plotH}
            className="profile-chart-grid"
          />
          <text
            x={padLeft - 8}
            y={padTop + plotH + 4}
            textAnchor="end"
            className="profile-chart-axis-text"
          >
            {yMin}
          </text>

          {/* Area fill */}
          <polygon points={areaPoints} fill="url(#ratingAreaGradient)" />

          {/* Main trend line */}
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="var(--action-bg, #81b64c)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data point dots */}
          {coords.map((c, i) => (
            <circle
              key={c.point.gameId || i}
              cx={c.x}
              cy={c.y}
              r={points.length > 50 ? 2 : 3.5}
              className="profile-chart-dot"
            >
              <title>{`${new Date(c.point.date * 1000).toLocaleDateString()}: Rating ${c.point.rating} (${c.point.result})`}</title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  );
}
