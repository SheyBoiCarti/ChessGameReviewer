'use client';

import { useState } from 'react';

import type { OpeningGraphSnapshot } from '@/lib/chess/graph/openingGraph';
import { navigateCandidate, type GraphNavigationState } from '@/features/opening-tree/navigation';
import {
  selectCandidateMoves,
  type MoveSort,
  type OutcomePerspective,
} from '@/features/opening-tree/selectors';

import { PathBreadcrumbs } from './PathBreadcrumbs';

export function OpeningTreeTable({
  graph,
  navigation,
  perspective,
  excludedGameCount = 0,
  diagnosticCodes = [],
  onNavigate,
}: {
  graph: OpeningGraphSnapshot;
  navigation: GraphNavigationState;
  perspective: OutcomePerspective;
  excludedGameCount?: number;
  diagnosticCodes?: readonly string[];
  onNavigate(value: GraphNavigationState): void;
}) {
  const [sort, setSort] = useState<MoveSort>('games');
  const node = graph.positions.get(navigation.positionKey);
  if (!node) {
    return <p role="alert">The selected graph position is unavailable. Return to the root.</p>;
  }
  const candidates = selectCandidateMoves(node, sort);
  const scoreLabel = perspective === 'user' ? 'Expected user score' : 'Expected White score';

  return (
    <section className="opening-tree surface-panel" aria-labelledby="opening-tree-heading">
      <h3 id="opening-tree-heading">Opening candidates</h3>
      {excludedGameCount > 0 ? (
        <p className="limited-notice" role="status">
          {excludedGameCount} {excludedGameCount === 1 ? 'game was' : 'games were'} excluded while
          building this opening graph. Categories: {diagnosticCodes.join(', ') || 'unknown'}.
        </p>
      ) : null}
      {graph.status === 'limited' ? (
        <p className="limited-notice" role="status">
          This graph reached the {limitName(graph.reachedLimit)} resource limit.{' '}
          {graph.includedGameCount} included games; {graph.remainingGameCount} remaining games were
          not added.
        </p>
      ) : null}
      <p className="field-help">
        The configured horizon is {graph.openingHorizon} plies; the supported maximum is 40 plies.
      </p>
      <PathBreadcrumbs graph={graph} navigation={navigation} onNavigate={onNavigate} />
      <label>
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
        <p>No candidate moves are available at this terminal, horizon, or unobserved position.</p>
      ) : (
        <div
          className="result-viewport opening-candidate-results"
          role="region"
          aria-label="Opening candidate results"
          tabIndex={0}
        >
          <table className="context-table opening-candidate-table">
            <thead>
              <tr>
                <th>Move</th>
                <th>Games</th>
                <th>{scoreLabel}</th>
                <th>Draw rate</th>
                <th>Average opponent rating</th>
                <th>Sample size</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((candidate) => {
                const score =
                  perspective === 'user'
                    ? candidate.metrics.userScore
                    : candidate.metrics.whiteScore;
                return (
                  <tr key={candidate.uci}>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate(
                            navigateCandidate(graph, navigation, node.outgoing.get(candidate.uci)!)
                          )
                        }
                      >
                        Play {candidate.san}
                      </button>
                    </td>
                    <td>{candidate.metrics.sampleSize}</td>
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
      )}
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
