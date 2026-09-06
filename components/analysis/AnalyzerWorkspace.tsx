'use client';

import { useMemo } from 'react';

import type { GameAnalysisResult } from '@/features/stockfish-analysis/analyzeGame';
import { analysisPreset } from '@/features/stockfish-analysis/presentation';
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
    | 'partial'
    | 'cancelled'
    | 'failed'
    | 'complete';
  result: GameAnalysisResult | null;
  progress: { analyzedPlies: number; totalPlies: number } | null;
  strength: AnalysisStrength;
  onStrengthChange(value: AnalysisStrength): void;
  onStart(value: AnalysisStrength): void;
  onCancel(): void;
  onResume(): void;
  onSelectPly(ply: number): void;
  selectedPly: number;
  fenByPly: Readonly<Record<number, string>>;
  upstreamAccuracies?: SideAccuracy | undefined;
  onExplorePv?(startFen: string, uciMoves: readonly string[]): void;
}

export function AnalyzerWorkspace({
  mode = 'review',
  game,
  players,
  isVariationActive = false,
  onReturnToGame,
  capability,
  status,
  result,
  progress,
  strength,
  onStrengthChange,
  onStart,
  onCancel,
  onResume,
  onSelectPly,
  selectedPly,
  fenByPly,
  upstreamAccuracies,
  onExplorePv,
}: AnalyzerWorkspaceProps) {
  const preset = analysisPreset(strength);
  const limitLabel = preset.limit.depth
    ? `Depth ${preset.limit.depth}`
    : `${preset.limit.movetimeMs ?? 0} ms per position`;
  const engineBuild = result?.annotations[0]?.settings.engineBuild ?? 'Stockfish 18';
  const unavailable = !capability || capability.mode === 'unavailable';
  const probing = status === 'probing' || capability === null;

  const selectedAnnotation =
    result?.annotations.find((annotation) => annotation.ply === selectedPly) ?? null;

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
      <span className={`status-label status-label--${status}`}>
        Analysis status: {analyzerStatusLabel(status)}
      </span>
      <h3 id="analyzer-heading">Local Stockfish analysis</h3>
      <p className="visually-hidden">
        Review key moments with Stockfish. Results stay on this device.
      </p>

      {/* Lifecycle row */}
      <div className="analyzer-lifecycle-row">
        <div className="analyzer-lifecycle-status">
          {unavailable ? (
            <p className="analyzer-lifecycle-text">Analysis is unavailable on this device.</p>
          ) : probing ? (
            <p className="analyzer-lifecycle-text">Checking analysis engine…</p>
          ) : status === 'idle' ? (
            <p className="analyzer-lifecycle-text">Ready to review</p>
          ) : status === 'running' ? (
            <p className="analyzer-lifecycle-text">
              {progress && progress.totalPlies > 0
                ? `Analysing ${progress.analyzedPlies} of ${progress.totalPlies} positions`
                : 'Analysing positions…'}
            </p>
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
          ) : null}
        </div>
      </div>

      {unavailable || !capability ? (
        <EngineStatus
          capability={capability}
          engineBuild={engineBuild}
          limitLabel={limitLabel}
          multiPv={preset.multiPv}
          heuristicVersion={ACCURACY_HEURISTIC_VERSION}
          jobStatus={status}
        />
      ) : (
        <details className="analysis-settings-disclosure">
          <summary>Settings</summary>
          <div className="analysis-settings-body">
            <AnalysisSettings
              strength={strength}
              disabled={status === 'running'}
              onChange={onStrengthChange}
            />
            <details className="analysis-engine-details">
              <summary>Engine details</summary>
              <EngineStatus
                capability={capability}
                engineBuild={engineBuild}
                limitLabel={limitLabel}
                multiPv={preset.multiPv}
                heuristicVersion={ACCURACY_HEURISTIC_VERSION}
                jobStatus={status}
              />
            </details>
          </div>
        </details>
      )}

      {progress ? (
        <p role="status" aria-live="polite">
          {progress.analyzedPlies} of {progress.totalPlies} eligible plies analysed.
        </p>
      ) : null}

      {status === 'partial' ? (
        <p role="alert">Partial analysis: completed positions remain cached and can be resumed.</p>
      ) : null}
      {(status === 'partial' || status === 'cancelled') && result ? (
        <p className="analysis-coverage-notice" role="status">
          Partial review: {result.analyzedPlies}/{result.totalPlies} positions analysed
          <span className="visually-hidden">
            Coverage: {result.analyzedPlies} of {result.totalPlies} eligible plies
          </span>
        </p>
      ) : null}
      {status === 'failed' ? (
        <p role="alert">Analysis failed. Completed cached positions remain available.</p>
      ) : null}
      {result?.warnings.length ? (
        <p className="analysis-cache-warning" role="status">
          Analysis completed, but some results could not be saved locally. A resumed review may need
          to analyse them again.
        </p>
      ) : null}

      {mode === 'review' ? (
        /* Review Mode Order */
        <>
          {hasResults ? (
            <>
              <GameReviewSummaryCard
                result={result!}
                upstreamAccuracies={upstreamAccuracies}
                players={players}
              />
              <MoveAccuracyGraph
                annotations={result!.annotations}
                onSelectPly={handleSelectPly}
                title="Evaluation"
                className="accuracy-graph--review"
              />
            </>
          ) : null}
          <ReviewFeedback
            annotation={selectedAnnotation}
            selectedPly={selectedPly}
            startFen={fenByPly[selectedPly]}
            nextMistake={nextMistake}
            onSelectPly={handleSelectPly}
            hasAnnotations={hasResults}
          />
          <AnalysisMoveList
            id="analysis-move-list"
            moves={game?.plies}
            annotations={result?.annotations}
            selectedPly={selectedPly}
            onSelectPly={handleSelectPly}
          />
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
              onSelectPly={handleSelectPly}
              title={isVariationActive ? 'Original game evaluation' : 'Evaluation'}
              className="accuracy-graph--analysis"
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function analyzerStatusLabel(status: AnalyzerWorkspaceProps['status']): string {
  switch (status) {
    case 'unavailable':
      return 'Unavailable';
    case 'partial':
      return 'Partial';
    case 'failed':
      return 'Failed';
    case 'running':
      return 'Running';
    case 'cancelled':
      return 'Cancelled';
    case 'complete':
      return 'Complete';
    case 'probing':
      return 'Checking engine';
    case 'idle':
      return 'Ready';
  }
}
