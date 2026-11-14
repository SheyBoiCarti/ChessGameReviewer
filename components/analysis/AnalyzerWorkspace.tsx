'use client';

import { useMemo } from 'react';

import type { GameAnalysisResult } from '@/features/stockfish-analysis/analyzeGame';
import { analysisPreset, selectMovePresentation } from '@/features/stockfish-analysis/presentation';
import { nextMistakePly } from '@/features/stockfish-analysis/reviewNavigation';
import type { AnalysisStrength } from '@/features/workspace/types';
import type { PlayerMetadata, SideAccuracy } from '@/lib/api/contracts';
import type { ParsedGame } from '@/lib/chess/pgnParser';
import { ACCURACY_HEURISTIC_VERSION } from '@/lib/engine/accuracy';
import type { EngineCapability } from '@/lib/engine/capabilities';
import type { ReviewMode } from '@/components/workspace/WorkspaceTabs';

import { AnalysisMoveList } from './AnalysisMoveList';
import { AnalysisSettings } from './AnalysisSettings';
import { EngineAnnotationPanel } from './EngineAnnotationPanel';
import { EngineStatus } from './EngineStatus';
import { GameReviewSummaryCard } from './GameReviewSummaryCard';
import { MoveAccuracyGraph } from './MoveAccuracyGraph';
import { ReviewFeedback } from './ReviewFeedback';

export interface AnalyzerWorkspaceProps {
  mode?: ReviewMode | undefined;
  feedbackInLayout?: boolean | undefined;
  game?: ParsedGame | undefined;
  players?:
    | {
        white: PlayerMetadata;
        black: PlayerMetadata;
      }
    | undefined;
  isVariationActive?: boolean | undefined;
  onReturnToGame?: (() => void) | undefined;
  capability: EngineCapability | null;
  status:
    | 'idle'
    | 'probing'
    | 'unavailable'
    | 'running'
    | 'stopping'
    | 'partial'
    | 'cancelled'
    | 'failed'
    | 'complete';
  result: GameAnalysisResult | null;
  showingPrevious?: boolean | undefined;
  previousStrength?: AnalysisStrength | null | undefined;
  progress: { analyzedPlies: number; totalPlies: number } | null;
  strength: AnalysisStrength;
  onStrengthChange(value: AnalysisStrength): void;
  onStart(value: AnalysisStrength): void;
  onCancel(): void;
  onResume(): void;
  onRetryEngine?(): void;
  onSelectPly(ply: number): void;
  selectedPly: number;
  fenByPly: Readonly<Record<number, string>>;
  upstreamAccuracies?: SideAccuracy | undefined;
  onExplorePv?(startFen: string, uciMoves: readonly string[]): void;
}

export function AnalyzerWorkspace({
  mode = 'review',
  feedbackInLayout = false,
  game,
  players,
  isVariationActive = false,
  onReturnToGame,
  capability,
  status,
  result,
  showingPrevious = false,
  previousStrength,
  progress,
  strength,
  onStrengthChange,
  onStart,
  onCancel,
  onResume,
  onRetryEngine,
  onSelectPly,
  selectedPly,
  fenByPly,
  upstreamAccuracies,
  onExplorePv,
}: AnalyzerWorkspaceProps) {
  const preset = result?.annotations[0]?.settings ?? analysisPreset(strength);
  const limitLabel = preset.limit.depth
    ? `Depth ${preset.limit.depth}`
    : `${preset.limit.movetimeMs ?? 0} ms per position`;
  const engineBuild = result?.annotations[0]?.settings.engineBuild ?? 'Stockfish 18';
  const probing = status === 'probing' || (capability === null && !result);
  const unavailable = !probing && capability?.mode === 'unavailable';

  const selected = game ? selectMovePresentation(game, result, selectedPly) : null;
  const selectedAnnotation =
    selected && selected.state !== 'starting'
      ? selected.annotation
      : (result?.annotations.find((annotation) => annotation.ply === selectedPly) ?? null);

  const hasResults = Boolean(result && result.annotations.length > 0);

  const nextMistake = useMemo(() => {
    if (!result || result.annotations.length === 0) return null;
    return nextMistakePly(result.annotations, selectedPly);
  }, [result, selectedPly]);

  const handleSelectPly = (ply: number) => {
    if (isVariationActive && onReturnToGame) {
      onReturnToGame();
    }
    onSelectPly(ply);
  };

  return (
    <section className="analyzer-workspace" aria-labelledby="analyzer-heading">
      <h3 id="analyzer-heading">Local Stockfish analysis</h3>
      <p className="visually-hidden">
        Review key moments with Stockfish. Results stay on this device.
      </p>

      {/* Lifecycle row */}
      <div className="analyzer-lifecycle-row">
        <div className="analyzer-lifecycle-status" role="status" aria-live="polite">
          {unavailable ? (
            <p className="analyzer-lifecycle-text">Analysis is unavailable on this device.</p>
          ) : probing ? (
            <p className="analyzer-lifecycle-text">Checking analysis engine…</p>
          ) : status === 'idle' ? (
            <p className="analyzer-lifecycle-text">Ready to review</p>
          ) : status === 'stopping' ? (
            <p className="analyzer-lifecycle-text">Stopping analysis…</p>
          ) : status === 'running' ? (
            <p className="analyzer-lifecycle-text">Analysing positions…</p>
          ) : status === 'partial' || status === 'cancelled' ? (
            <p className="analyzer-lifecycle-text">Partial review</p>
          ) : status === 'failed' ? (
            <p className="analyzer-lifecycle-text">
              Analysis failed. Completed positions remain available.
            </p>
          ) : status === 'complete' ? (
            <p className="analyzer-lifecycle-text">Review complete</p>
          ) : (
            <p className="analyzer-lifecycle-text">Ready to review</p>
          )}
        </div>

        <div className="analyzer-lifecycle-action">
          {!unavailable ? (
            probing ? (
              <button
                type="button"
                className="button-primary"
                disabled
                aria-label="Run review (disabled)"
              >
                Run review
              </button>
            ) : status === 'idle' ? (
              <button
                type="button"
                className="button-primary"
                onClick={() => onStart(strength)}
                aria-label="Run review (Start analysis)"
              >
                Run review
              </button>
            ) : status === 'stopping' ? (
              <button type="button" className="button-secondary" disabled>
                Stopping…
              </button>
            ) : status === 'running' ? (
              <button
                type="button"
                className="button-secondary"
                onClick={onCancel}
                aria-label="Cancel analysis"
              >
                Cancel analysis
              </button>
            ) : status === 'partial' || status === 'cancelled' ? (
              <button
                type="button"
                className="button-primary"
                onClick={onResume}
                aria-label="Resume analysis"
              >
                Resume analysis
              </button>
            ) : status === 'failed' ? (
              <button
                type="button"
                className="button-primary"
                onClick={() => onStart(strength)}
                aria-label="Retry analysis (Start analysis)"
              >
                Retry analysis
              </button>
            ) : status === 'complete' ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => onStart(strength)}
                aria-label="Run again"
              >
                Run again
              </button>
            ) : null
          ) : onRetryEngine ? (
            <button type="button" className="button-primary" onClick={onRetryEngine}>
              Retry engine
            </button>
          ) : null}
        </div>
      </div>

      {showingPrevious ? (
        <p className="analysis-coverage-notice">Previous {previousStrength ?? 'saved'} review.</p>
      ) : null}
      {unavailable ? (
        <p className="analysis-coverage-notice">Playback and Openings remain available.</p>
      ) : null}

      <div
        className={`analysis-progress-slot${mode === 'review' ? ' analysis-progress-slot--review' : ''}`}
      >
        {status === 'running' || status === 'stopping' ? (
          <progress
            className="analysis-progress"
            aria-label="Review progress"
            aria-valuemin={0}
            aria-valuemax={progress?.totalPlies || game?.plies.length || 1}
            aria-valuenow={progress?.analyzedPlies ?? 0}
            max={progress?.totalPlies || game?.plies.length || 1}
            value={progress?.analyzedPlies ?? 0}
          >
            {progress?.analyzedPlies ?? 0} positions analysed
          </progress>
        ) : null}
      </div>
      {(status === 'partial' || status === 'cancelled') && result && !showingPrevious ? (
        <p className="analysis-coverage-notice">
          Coverage: {result.analyzedPlies} of {result.totalPlies} eligible plies
        </p>
      ) : null}
      {result?.warnings && result.warnings.length ? (
        <p className="analysis-cache-warning" role="status">
          Analysis completed, but some results could not be saved locally. A resumed review may need
          to analyse them again.
        </p>
      ) : null}

      {mode === 'review' ? (
        /* Review Mode Order */
        <>
          {!feedbackInLayout ? (
            <ReviewFeedback
              annotation={selectedAnnotation}
              selectedPly={selectedPly}
              startFen={fenByPly[selectedPly]}
              nextMistake={nextMistake}
              onSelectPly={handleSelectPly}
              hasAnnotations={hasResults}
              showingPrevious={showingPrevious}
              previousStrength={previousStrength}
            />
          ) : null}
          <AnalysisMoveList
            id="analysis-move-list"
            moves={game?.plies}
            annotations={result?.annotations}
            selectedPly={selectedPly}
            onSelectPly={handleSelectPly}
          />
          {hasResults ? (
            <MoveAccuracyGraph
              annotations={result!.annotations}
              totalPlies={game?.plies.length ?? result!.totalPlies}
              selectedPly={selectedPly}
              onSelectPly={handleSelectPly}
              title="Evaluation"
              className="accuracy-graph--review"
            />
          ) : null}
          <details className="review-summary">
            <summary>Summary</summary>
            {result ? (
              <GameReviewSummaryCard
                result={result}
                upstreamAccuracies={upstreamAccuracies}
                players={players}
              />
            ) : (
              <p>No completed positions yet.</p>
            )}
          </details>
        </>
      ) : (
        /* Analysis Mode Order */
        <>
          {isVariationActive ? (
            <div className="variation-active-banner surface-panel">
              <h4>Exploring a variation</h4>
              {onReturnToGame ? (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={onReturnToGame}
                  aria-label="Return to game"
                >
                  Return to game
                </button>
              ) : null}
            </div>
          ) : selectedPly === 0 ? (
            <div className="annotation-panel-empty" role="note">
              <p>Select a move to inspect its analysis.</p>
            </div>
          ) : !selectedAnnotation ? (
            <div className="annotation-panel-empty" role="note">
              <p>This move has not been analysed yet.</p>
            </div>
          ) : (
            <EngineAnnotationPanel
              annotation={selectedAnnotation}
              startFen={fenByPly[selectedAnnotation.ply]}
              onSelectPly={handleSelectPly}
              onExplorePv={onExplorePv}
            />
          )}
          <AnalysisMoveList
            id="analysis-move-list"
            moves={game?.plies}
            annotations={result?.annotations}
            selectedPly={selectedPly}
            onSelectPly={handleSelectPly}
            tableLabel={isVariationActive ? 'Original game move list' : 'Move list'}
          />
          {hasResults ? (
            <MoveAccuracyGraph
              annotations={result!.annotations}
              totalPlies={game?.plies.length ?? result!.totalPlies}
              selectedPly={selectedPly}
              onSelectPly={handleSelectPly}
              title={isVariationActive ? 'Original game evaluation' : 'Evaluation'}
              className="accuracy-graph--analysis"
            />
          ) : null}
        </>
      )}

      <details className="analysis-settings-disclosure">
        <summary>Settings</summary>
        <div className="analysis-settings-body">
          <AnalysisSettings
            strength={strength}
            disabled={probing || unavailable || status === 'running' || status === 'stopping'}
            onChange={onStrengthChange}
          />
          <details className="analysis-engine-details">
            <summary>Engine details</summary>
            <EngineStatus
              capability={probing ? null : capability}
              engineBuild={engineBuild}
              limitLabel={limitLabel}
              multiPv={preset.multiPv}
              heuristicVersion={ACCURACY_HEURISTIC_VERSION}
              jobStatus={status}
            />
          </details>
        </div>
      </details>
    </section>
  );
}
