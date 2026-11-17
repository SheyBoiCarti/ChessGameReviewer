'use client';

import { convertPvToSan } from '@/features/stockfish-analysis/presentation';
import type { PositionAnalysis } from '@/features/stockfish-analysis/usePositionAnalysis';
import { normalizeUciScoreToWhite } from '@/lib/engine/evaluation';
import { formatEvaluationScore } from '@/features/board/evaluationBar';

export function OpeningPositionAnalysis({
  fen,
  analysis,
  enabled,
  onEnabledChange,
  onPlayMove,
  paused = false,
}: {
  fen: string;
  analysis: PositionAnalysis;
  enabled: boolean;
  onEnabledChange(enabled: boolean): void;
  onPlayMove(uci: string): void;
  paused?: boolean;
}) {
  return (
    <section className="surface-panel position-engine" aria-label="Stockfish position analysis">
      <label className="position-engine__heading">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onEnabledChange(event.target.checked)}
        />{' '}
        Stockfish analysis
      </label>
      {enabled ? (
        <>
          <p className="field-help">Top engine moves · Evaluations from White’s perspective</p>
          <div role="status">
            {paused
              ? 'Live analysis resumes when the game review finishes.'
              : analysis.loading
                ? 'Analysing this position…'
                : analysis.error}
          </div>
          {!paused && !analysis.loading && !analysis.error ? (
            analysis.lines.length ? (
              <ol className="position-engine__lines" aria-label="Top engine moves">
                {analysis.lines.map((line, index) => {
                  const moves = convertPvToSan(fen, line.pv).moves;
                  const score = normalizeUciScoreToWhite(line.score, fen);
                  return (
                    <li key={line.multiPv}>
                      <button
                        type="button"
                        className="position-engine__line"
                        onClick={() => line.pv[0] && onPlayMove(line.pv[0])}
                        disabled={!line.pv[0] || !moves.length}
                        aria-label={`Play engine choice ${index + 1}: ${moves[0] ?? 'unavailable'}`}
                      >
                        <strong className="tabular-nums">
                          {score?.kind === 'cp'
                            ? `${score.value >= 0 ? '+' : ''}${(score.value / 100).toFixed(2)}`
                            : formatEvaluationScore(score ?? undefined)}
                        </strong>
                        <span className="position-engine__moves">{moves.join(' ')}</span>
                        <span className="field-help">Depth {line.depth}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p>No legal engine continuation in this position.</p>
            )
          ) : null}
        </>
      ) : null}
    </section>
  );
}
