'use client';

import { useState, type ReactNode } from 'react';

import type { OpeningGraphSnapshot } from '@/lib/chess/graph/openingGraph';
import { navigateCandidate, type GraphNavigationState } from '@/features/opening-tree/navigation';
import {
  selectCandidateMoves,
  selectOutcomeBreakdown,
  type MoveSort,
  type OutcomePerspective,
} from '@/features/opening-tree/selectors';

import { OutcomeBar } from './OutcomeBar';
import { PathBreadcrumbs } from './PathBreadcrumbs';

export interface OpeningTreeTableProps {
  graph: OpeningGraphSnapshot;
  navigation: GraphNavigationState;
  perspective: OutcomePerspective;
  excludedGameCount?: number;
  diagnosticCodes?: readonly string[];
  onNavigate(value: GraphNavigationState): void;
  moveOrdersAction?: ReactNode;
}

export function OpeningTreeTable({
  graph,
  navigation,
  perspective,
  excludedGameCount = 0,
  diagnosticCodes = [],
  onNavigate,
  moveOrdersAction,
}: OpeningTreeTableProps) {
  const [sort, setSort] = useState<MoveSort>('games');
  const node = graph.positions.get(navigation.positionKey);
  if (!node) {
    return <p role="alert">The selected graph position is unavailable. Return to the root.</p>;
  }
  const candidates = selectCandidateMoves(node, sort, perspective);
  const scoreLabel = perspective === 'user' ? 'Expected user score' : 'Expected White score';
  const winRateLabel = perspective === 'user' ? 'Win rate' : 'White win rate';

  const isHorizonReached =
    navigation.history.length > 0 && navigation.history.length - 1 >= graph.openingHorizon;

  return (
    <section className="opening-tree surface-panel" aria-labelledby="opening-tree-heading">
      <h3 id="opening-tree-heading">Openings</h3>

      {excludedGameCount > 0 ? (
        <div className="limited-notice" role="status">
          <p>
            {excludedGameCount} {excludedGameCount === 1 ? 'game was' : 'games were'} excluded while
            building this opening graph.{' '}
            {diagnosticCodes.length > 0 ? `Categories: ${diagnosticCodes.join(', ')}.` : ''}
          </p>
          {diagnosticCodes.length > 0 ? (
            <details className="exclusion-diagnostic-details">
              <summary>Diagnostic codes</summary>
              <p>{diagnosticCodes.join(', ')}</p>
            </details>
          ) : null}
        </div>
      ) : null}

      {graph.status === 'limited' ? (
        <p className="limited-notice" role="status">
          This graph reached the {limitName(graph.reachedLimit)} resource limit.{' '}
          {graph.includedGameCount} included games; {graph.remainingGameCount} remaining games were
          not added.
        </p>
      ) : null}

      <PathBreadcrumbs graph={graph} navigation={navigation} onNavigate={onNavigate} />

      <label className="sort-candidates-label">
        Sort candidate moves
        <select value={sort} onChange={(event) => setSort(event.currentTarget.value as MoveSort)}>
          <option value="games">Games</option>
          <option value="score">Expected score</option>
          <option value="san">Move</option>
        </select>
      </label>
      <p className="sr-only" aria-live="polite">
        Candidate moves sorted by {sort}.
      </p>

      {candidates.length === 0 ? (
        isHorizonReached ? (
          <p className="opening-tree__empty">
            Opening depth limit reached. Increase the opening depth in Game filters and import
            again.
          </p>
        ) : (
          <p className="opening-tree__empty">
            No further moves in these games.
            <span className="visually-hidden"> No candidate moves are available.</span>
          </p>
        )
      ) : (
        <div
          className="result-viewport opening-candidate-results"
          role="region"
          aria-label="Opening candidate results"
          tabIndex={0}
        >
          <table className="opening-candidate-table" aria-label="Opening candidates">
            <thead>
              <tr>
                <th scope="col" className="opening-col--move">
                  Move
                </th>
                <th scope="col" className="opening-col--games">
                  Games
                </th>
                <th scope="col" className="opening-col--results">
                  Results
                </th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => {
                const edge = node.outgoing.get(candidate.uci);
                const breakdown = edge ? selectOutcomeBreakdown(edge.aggregate, perspective) : null;
                return (
                  <tr key={candidate.uci} className="opening-candidate-row">
                    <td className="opening-cell--move">
                      <button
                        type="button"
                        className="opening-candidate-btn"
                        onClick={() => onNavigate(navigateCandidate(graph, navigation, edge!))}
                        aria-label={`Play ${candidate.san}, ${candidate.metrics.sampleSize} games`}
                      >
                        {candidate.san}
                      </button>
                    </td>
                    <td className="opening-cell--games">
                      <span className="tabular-nums">{candidate.metrics.sampleSize}</span>
                    </td>
                    <td className="opening-cell--results">
                      {breakdown ? (
                        <OutcomeBar breakdown={breakdown} perspective={perspective} />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {candidates.length > 0 ? (
        <details className="more-statistics-disclosure">
          <summary>More statistics</summary>
          <div className="more-statistics-content">
            <p className="field-help">
              The configured horizon is {graph.openingHorizon} plies; the supported maximum is 40
              plies.
            </p>
            <div
              className="detailed-statistics-region"
              role="region"
              aria-label="Detailed opening statistics"
              tabIndex={0}
            >
              <table
                className="context-table detailed-opening-table"
                aria-label="Detailed opening statistics"
              >
                <thead>
                  <tr>
                    <th scope="col">Move</th>
                    <th scope="col">{winRateLabel}</th>
                    <th scope="col">{scoreLabel}</th>
                    <th scope="col">Draw rate</th>
                    <th scope="col">Average opponent rating</th>
                    <th scope="col">Sample size</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => {
                    const score =
                      perspective === 'user'
                        ? candidate.metrics.userScore
                        : candidate.metrics.whiteScore;
                    const winRate =
                      perspective === 'user'
                        ? candidate.metrics.userWinRate
                        : candidate.metrics.whiteWinRate;
                    return (
                      <tr key={candidate.uci}>
                        <td>
                          <span className="detailed-move-san">{candidate.san}</span>
                        </td>
                        <td>{percent(winRate)}</td>
                        <td>{percent(score)}</td>
                        <td>{percent(candidate.metrics.drawRate)}</td>
                        <td>{candidate.metrics.averageOpponentRating?.toFixed(0) ?? '—'}</td>
                        <td>{candidate.metrics.sampleSize}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      ) : null}

      {moveOrdersAction ? <div className="opening-tree-actions">{moveOrdersAction}</div> : null}
    </section>
  );
}

function percent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function limitName(value: OpeningGraphSnapshot['reachedLimit']): string {
  if (value === 'maxPositions') return 'position';
  if (value === 'maxEdges') return 'edge';
  if (value === 'maxPathNodes') return 'path';
  if (value === 'maxSnapshotBytes') return 'snapshot size';
  return 'configured';
}
