import type React from 'react';

import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';
import type { GameAnalysisResult } from '@/features/stockfish-analysis/analyzeGame';
import { moveQualityDetails } from '@/features/stockfish-analysis/presentation';
import { REVIEW_MOVE_QUALITIES } from '@/lib/engine/accuracy';

export interface GameReviewSummaryCardProps {
  result: GameAnalysisResult;
}

export function GameReviewSummaryCard({ result }: GameReviewSummaryCardProps): React.JSX.Element {
  const whiteSummary = result.summary.white;
  const blackSummary = result.summary.black;

  return (
    <section className="game-review-summary surface-panel" aria-labelledby="game-review-heading">
      <h3 id="game-review-heading">Game Review Summary</h3>
      {result.status !== 'complete' ? (
        <p className="game-review-summary__coverage" role="status">
          Coverage: {result.analyzedPlies} of {result.totalPlies} eligible plies
        </p>
      ) : null}
      <div className="game-review-summary__accuracies">
        <div className="game-review-summary__accuracy-card">
          <span className="game-review-summary__player-label">White accuracy</span>
          <span className="game-review-summary__player-value">
            {formatEstimate(whiteSummary.accuracyEstimate)}
          </span>
        </div>
        <div className="game-review-summary__accuracy-card">
          <span className="game-review-summary__player-label">Black accuracy</span>
          <span className="game-review-summary__player-value">
            {formatEstimate(blackSummary.accuracyEstimate)}
          </span>
        </div>
      </div>
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
    </section>
  );
}

function formatEstimate(value: number | null): string {
  return value === null ? 'unavailable' : `${value.toFixed(1)}%`;
}
