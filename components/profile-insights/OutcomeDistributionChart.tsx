'use client';

import React from 'react';
import type { OutcomeCounts } from '@/features/profile-insights/types';

export interface OutcomeDistributionChartProps {
  overall: OutcomeCounts;
  asWhite: OutcomeCounts;
  asBlack: OutcomeCounts;
}

interface OutcomeRowProps {
  label: string;
  counts: OutcomeCounts;
}

function OutcomeRow({ label, counts }: OutcomeRowProps): React.JSX.Element {
  const { wins, losses, draws, total, winRate } = counts;

  const winPct = total > 0 ? (wins / total) * 100 : 0;
  const drawPct = total > 0 ? (draws / total) * 100 : 0;
  const lossPct = total > 0 ? (losses / total) * 100 : 0;

  const accessibleLabel = `${label}: ${wins} wins (${winRate}%), ${draws} draws, ${losses} losses out of ${total} games`;

  return (
    <div className="profile-outcome-row">
      <div className="profile-outcome-header">
        <span className="profile-outcome-label">{label}</span>
        <span className="profile-outcome-meta">
          <strong className="profile-outcome-winrate">{winRate}%</strong> ({wins}W / {draws}D /{' '}
          {losses}L)
        </span>
      </div>

      <div className="profile-outcome-bar" role="img" aria-label={accessibleLabel}>
        {total === 0 ? (
          <div
            className="profile-outcome-seg profile-outcome-seg--empty"
            style={{ width: '100%' }}
          />
        ) : (
          <>
            {winPct > 0 ? (
              <div
                className="profile-outcome-seg profile-outcome-seg--win"
                style={{ width: `${winPct}%` }}
                title={`Wins: ${wins} (${Math.round(winPct)}%)`}
              />
            ) : null}
            {drawPct > 0 ? (
              <div
                className="profile-outcome-seg profile-outcome-seg--draw"
                style={{ width: `${drawPct}%` }}
                title={`Draws: ${draws} (${Math.round(drawPct)}%)`}
              />
            ) : null}
            {lossPct > 0 ? (
              <div
                className="profile-outcome-seg profile-outcome-seg--loss"
                style={{ width: `${lossPct}%` }}
                title={`Losses: ${losses} (${Math.round(lossPct)}%)`}
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export function OutcomeDistributionChart({
  overall,
  asWhite,
  asBlack,
}: OutcomeDistributionChartProps): React.JSX.Element {
  return (
    <div className="profile-insights-card profile-outcome-card">
      <h3 className="profile-card-title">Outcome Distribution</h3>
      <div className="profile-outcome-list">
        <OutcomeRow label="Overall" counts={overall} />
        <OutcomeRow label="As White" counts={asWhite} />
        <OutcomeRow label="As Black" counts={asBlack} />
      </div>
      <div className="profile-outcome-legend">
        <span className="profile-legend-item">
          <span className="profile-legend-dot profile-legend-dot--win" /> Win
        </span>
        <span className="profile-legend-item">
          <span className="profile-legend-dot profile-legend-dot--draw" /> Draw
        </span>
        <span className="profile-legend-item">
          <span className="profile-legend-dot profile-legend-dot--loss" /> Loss
        </span>
      </div>
    </div>
  );
}
