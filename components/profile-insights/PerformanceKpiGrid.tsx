'use client';

import React from 'react';

export interface PerformanceKpiGridProps {
  totalGames: number;
  winRate: number;
  currentStreak: { type: 'win' | 'loss' | 'draw' | 'none'; count: number };
  avgAccuracy: number | null;
  peakRating?: number | null | undefined;
}

export function PerformanceKpiGrid({
  totalGames,
  winRate,
  currentStreak,
  avgAccuracy,
  peakRating,
}: PerformanceKpiGridProps): React.JSX.Element {
  const formatStreak = () => {
    if (currentStreak.type === 'none' || currentStreak.count === 0) {
      return 'None';
    }
    const label =
      currentStreak.type === 'win'
        ? currentStreak.count === 1
          ? 'Win'
          : 'Wins'
        : currentStreak.type === 'loss'
          ? currentStreak.count === 1
            ? 'Loss'
            : 'Losses'
          : 'Draws';
    return `${currentStreak.count} ${label}`;
  };

  const streakClass =
    currentStreak.type === 'win'
      ? 'profile-kpi-badge--win'
      : currentStreak.type === 'loss'
        ? 'profile-kpi-badge--loss'
        : 'profile-kpi-badge--neutral';

  return (
    <div className="profile-kpi-grid" role="region" aria-label="Performance KPIs">
      <div className="profile-kpi-card" data-testid="kpi-total-games">
        <span className="profile-kpi-label">Total Games</span>
        <span className="profile-kpi-value">{totalGames}</span>
      </div>

      <div className="profile-kpi-card" data-testid="kpi-win-rate">
        <span className="profile-kpi-label">Win Rate</span>
        <span className="profile-kpi-value profile-kpi-value--accent">{winRate}%</span>
      </div>

      <div className="profile-kpi-card" data-testid="kpi-streak">
        <span className="profile-kpi-label">Current Streak</span>
        <span className={`profile-kpi-value ${streakClass}`}>{formatStreak()}</span>
      </div>

      <div className="profile-kpi-card" data-testid="kpi-accuracy">
        <span className="profile-kpi-label">Average Accuracy</span>
        <span className="profile-kpi-value">
          {avgAccuracy !== null ? `${avgAccuracy}%` : 'N/A'}
        </span>
      </div>

      <div className="profile-kpi-card" data-testid="kpi-peak-rating">
        <span className="profile-kpi-label">Peak Rating</span>
        <span className="profile-kpi-value">
          {peakRating !== null && peakRating !== undefined ? `${peakRating}` : 'N/A'}
        </span>
      </div>
    </div>
  );
}
