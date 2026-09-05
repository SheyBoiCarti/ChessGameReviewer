import type React from 'react';

import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';
import type { GameAnalysisResult } from '@/features/stockfish-analysis/analyzeGame';
import { moveQualityDetails } from '@/features/stockfish-analysis/presentation';
import type { PlayerMetadata, SideAccuracy } from '@/lib/api/contracts';
import { REVIEW_MOVE_QUALITIES } from '@/lib/engine/accuracy';

export interface GameReviewSummaryCardProps {
  result: GameAnalysisResult;
  upstreamAccuracies?: SideAccuracy | undefined;
  players?:
    | {
        white: PlayerMetadata;
        black: PlayerMetadata;
      }
    | undefined;
}

export function GameReviewSummaryCard({
  result,
  upstreamAccuracies,
  players,
}: GameReviewSummaryCardProps): React.JSX.Element {
  const whiteSummary = result.summary.white;
  const blackSummary = result.summary.black;

  const whiteLocalLabel = players?.white?.username
    ? `${players.white.username} Local estimate`
    : 'White Local estimate';
  const blackLocalLabel = players?.black?.username
    ? `${players.black.username} Local estimate`
    : 'Black Local estimate';

  const whiteUpstreamLabel = players?.white?.username
    ? `${players.white.username} Chess.com accuracy`
    : 'White Chess.com accuracy';
  const blackUpstreamLabel = players?.black?.username
    ? `${players.black.username} Chess.com accuracy`
    : 'Black Chess.com accuracy';

  const hasUpstream =
    upstreamAccuracies !== undefined &&
    (typeof upstreamAccuracies.white === 'number' || typeof upstreamAccuracies.black === 'number');

  return (
    <section className="game-review-summary surface-panel" aria-labelledby="game-review-heading">
      <h3 id="game-review-heading">Game Review Summary</h3>
      {result.status !== 'complete' ? (
        <p className="game-review-summary__coverage" role="status">
          Partial review: {result.analyzedPlies}/{result.totalPlies} positions analysed
          <span className="visually-hidden">
            Coverage: {result.analyzedPlies} of {result.totalPlies} eligible plies
          </span>
        </p>
      ) : null}
      <div className="game-review-summary__accuracies">
        <div className="game-review-summary__accuracy-card">
          <span className="game-review-summary__player-label">{whiteLocalLabel}</span>
          <span className="game-review-summary__player-value">
            {formatEstimate(whiteSummary.accuracyEstimate)}
          </span>
        </div>
        <div className="game-review-summary__accuracy-card">
          <span className="game-review-summary__player-label">{blackLocalLabel}</span>
          <span className="game-review-summary__player-value">
            {formatEstimate(blackSummary.accuracyEstimate)}
          </span>
        </div>
      </div>
      {hasUpstream ? (
        <div className="game-review-summary__accuracies game-review-summary__accuracies--upstream">
          <div className="game-review-summary__accuracy-card">
            <span className="game-review-summary__player-label">{whiteUpstreamLabel}</span>
            <span className="game-review-summary__player-value">
              {formatEstimate(upstreamAccuracies.white ?? null)}
            </span>
          </div>
          <div className="game-review-summary__accuracy-card">
            <span className="game-review-summary__player-label">{blackUpstreamLabel}</span>
            <span className="game-review-summary__player-value">
              {formatEstimate(upstreamAccuracies.black ?? null)}
            </span>
          </div>
        </div>
      ) : null}
      <details className="game-review-summary__breakdown">
        <summary>Move breakdown</summary>
        <div className="game-review-summary__table-container">
          <table className="game-review-summary__table">
            <thead>
              <tr>
                <th scope="col">Quality</th>
                <th scope="col">White</th>
                <th scope="col">Black</th>
              </tr>
            </thead>
            <tbody>
              {REVIEW_MOVE_QUALITIES.map((quality) => {
                const details = moveQualityDetails(quality);
                const whiteCount = whiteSummary.breakdown[quality];
                const blackCount = blackSummary.breakdown[quality];

                return (
                  <tr
                    key={quality}
                    className={`game-review-summary__row game-review-summary__row--${quality}`}
                  >
                    <th scope="row" className="game-review-summary__quality-cell">
                      <MoveClassificationBadge quality={quality} size="summary" />
                      <span className="game-review-summary__quality-label">{details.label}</span>
                    </th>
                    <td className="game-review-summary__count-cell">{whiteCount}</td>
                    <td className="game-review-summary__count-cell">{blackCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function formatEstimate(value: number | null): React.ReactNode {
  if (value === null) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="visually-hidden">Unavailable</span>
      </>
    );
  }
  return `${value.toFixed(1)}%`;
}
