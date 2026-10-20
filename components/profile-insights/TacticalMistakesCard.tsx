'use client';

import React from 'react';
import type { TacticalMistakeSummary } from '@/features/profile-insights/types';

export interface TacticalMistakesCardProps {
  tactics: TacticalMistakeSummary;
}

export function TacticalMistakesCard({ tactics }: TacticalMistakesCardProps): React.JSX.Element {
  const {
    totalEvaluatedMoves,
    avgAccuracy,
    blunders,
    mistakes,
    inaccuracies,
    misses,
    blundersPerGame,
  } = tactics;

  return (
    <div className="profile-insights-card profile-tactics-card">
      <div className="profile-card-header">
        <h3 className="profile-card-title">Tactical Accuracy & Mistakes</h3>
        <span className="profile-tactics-moves-meta">
          <strong>{totalEvaluatedMoves}</strong> evaluated moves
        </span>
      </div>

      <div className="profile-tactics-overview">
        <div className="profile-tactics-accuracy-banner">
          <span className="profile-tactics-accuracy-label">Average Move Accuracy</span>
          <span className="profile-tactics-accuracy-value">
            {avgAccuracy !== null ? `${avgAccuracy}%` : 'No evaluations yet'}
          </span>
          <span className="profile-tactics-accuracy-subtext">
            Based on Stockfish evaluation engine and ingested game results
          </span>
        </div>
      </div>

      <div className="profile-mistakes-grid">
        <div className="profile-mistake-pill profile-mistake-pill--blunder">
          <div className="profile-mistake-header">
            <span className="profile-mistake-dot profile-mistake-dot--blunder" />
            <span className="profile-mistake-title">Blunders</span>
          </div>
          <span className="profile-mistake-count">{blunders}</span>
          <span className="profile-mistake-rate">
            {blundersPerGame > 0 ? `${blundersPerGame} / game` : '0 / game'}
          </span>
        </div>

        <div className="profile-mistake-pill profile-mistake-pill--mistake">
          <div className="profile-mistake-header">
            <span className="profile-mistake-dot profile-mistake-dot--mistake" />
            <span className="profile-mistake-title">Mistakes</span>
          </div>
          <span className="profile-mistake-count">{mistakes}</span>
        </div>

        <div className="profile-mistake-pill profile-mistake-pill--inaccuracy">
          <div className="profile-mistake-header">
            <span className="profile-mistake-dot profile-mistake-dot--inaccuracy" />
            <span className="profile-mistake-title">Inaccuracies</span>
          </div>
          <span className="profile-mistake-count">{inaccuracies}</span>
        </div>

        <div className="profile-mistake-pill profile-mistake-pill--miss">
          <div className="profile-mistake-header">
            <span className="profile-mistake-dot profile-mistake-dot--miss" />
            <span className="profile-mistake-title">Misses</span>
          </div>
          <span className="profile-mistake-count">{misses}</span>
        </div>
      </div>
    </div>
  );
}
