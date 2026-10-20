'use client';

import React, { useState } from 'react';
import type { OpeningInsight } from '@/features/profile-insights/types';

export interface TopOpeningsCardProps {
  whiteOpenings: readonly OpeningInsight[];
  blackOpenings: readonly OpeningInsight[];
}

export function TopOpeningsCard({
  whiteOpenings,
  blackOpenings,
}: TopOpeningsCardProps): React.JSX.Element {
  const [selectedColor, setSelectedColor] = useState<'white' | 'black'>('white');

  const openings = selectedColor === 'white' ? whiteOpenings : blackOpenings;

  return (
    <div className="profile-insights-card profile-openings-card">
      <div className="profile-card-header">
        <h3 className="profile-card-title">Top Openings</h3>
        <div className="profile-segmented-control" role="tablist" aria-label="Openings by Color">
          <button
            type="button"
            role="tab"
            aria-selected={selectedColor === 'white'}
            className={`profile-segmented-btn ${selectedColor === 'white' ? 'profile-segmented-btn--active' : ''}`}
            onClick={() => setSelectedColor('white')}
          >
            As White ({whiteOpenings.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedColor === 'black'}
            className={`profile-segmented-btn ${selectedColor === 'black' ? 'profile-segmented-btn--active' : ''}`}
            onClick={() => setSelectedColor('black')}
          >
            As Black ({blackOpenings.length})
          </button>
        </div>
      </div>

      {openings.length === 0 ? (
        <div className="profile-empty-state">
          <p>No opening data recorded for this side.</p>
        </div>
      ) : (
        <div className="profile-table-container">
          <table className="profile-openings-table" aria-label={`Top Openings as ${selectedColor}`}>
            <thead>
              <tr>
                <th scope="col">Opening</th>
                <th scope="col">Moves</th>
                <th scope="col" className="text-right">
                  Played
                </th>
                <th scope="col" className="text-right">
                  Win Rate
                </th>
                <th scope="col">Outcomes</th>
              </tr>
            </thead>
            <tbody>
              {openings.map((op, idx) => {
                const winPct = op.played > 0 ? (op.wins / op.played) * 100 : 0;
                const drawPct = op.played > 0 ? (op.draws / op.played) * 100 : 0;
                const lossPct = op.played > 0 ? (op.losses / op.played) * 100 : 0;

                return (
                  <tr key={`${op.name}-${idx}`}>
                    <td>
                      <div className="profile-opening-name-cell">
                        {op.eco ? <span className="profile-eco-badge">{op.eco}</span> : null}
                        <span className="profile-opening-name">{op.name}</span>
                      </div>
                    </td>
                    <td className="profile-opening-moves">{op.moves || '—'}</td>
                    <td className="text-right font-mono">{op.played}</td>
                    <td className="text-right font-mono font-bold text-accent">{op.winRate}%</td>
                    <td>
                      <div
                        className="profile-mini-outcome-bar"
                        role="img"
                        aria-label={`${op.wins} wins, ${op.draws} draws, ${op.losses} losses`}
                      >
                        {winPct > 0 ? (
                          <div
                            className="profile-outcome-seg profile-outcome-seg--win"
                            style={{ width: `${winPct}%` }}
                          />
                        ) : null}
                        {drawPct > 0 ? (
                          <div
                            className="profile-outcome-seg profile-outcome-seg--draw"
                            style={{ width: `${drawPct}%` }}
                          />
                        ) : null}
                        {lossPct > 0 ? (
                          <div
                            className="profile-outcome-seg profile-outcome-seg--loss"
                            style={{ width: `${lossPct}%` }}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
