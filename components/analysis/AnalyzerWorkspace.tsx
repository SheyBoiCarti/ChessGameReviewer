'use client';

import type { GameAnalysisResult } from '@/features/stockfish-analysis/analyzeGame';
import { analysisPreset } from '@/features/stockfish-analysis/presentation';
import type { AnalysisStrength } from '@/features/workspace/types';
import type { SideAccuracy } from '@/lib/api/contracts';
import { ACCURACY_HEURISTIC_VERSION } from '@/lib/engine/accuracy';
import type { EngineCapability } from '@/lib/engine/capabilities';

import { AnalysisMoveList } from './AnalysisMoveList';
import { AnalysisSettings } from './AnalysisSettings';
import { EngineAnnotationPanel } from './EngineAnnotationPanel';
import { EngineStatus } from './EngineStatus';
import { GameReviewSummaryCard } from './GameReviewSummaryCard';
import { MoveAccuracyGraph } from './MoveAccuracyGraph';

export interface AnalyzerWorkspaceProps {
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
  const selectedAnnotation =
    result?.annotations.find((annotation) => annotation.ply === selectedPly) ?? null;

  return (
    <section className="analyzer-workspace" aria-labelledby="analyzer-heading">
      <span className={`status-label status-label--${status}`}>
        Analysis status: {analyzerStatusLabel(status)}
      </span>
      <h3 id="analyzer-heading">Local Stockfish analysis</h3>
      <p>Review key moments with Stockfish. Results stay on this device.</p>
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
      )}
      {!unavailable ? (
        <>
          <AnalysisSettings
            strength={strength}
            disabled={status === 'running'}
            onChange={onStrengthChange}
          />
          {status === 'running' ? (
            <button type="button" className="button-secondary" onClick={onCancel}>
              Cancel analysis
            </button>
          ) : status === 'partial' || status === 'cancelled' ? (
            <button type="button" className="button-primary" onClick={onResume}>
              Resume analysis
            </button>
          ) : (
            <button type="button" className="button-primary" onClick={() => onStart(strength)}>
              Start analysis
            </button>
          )}
        </>
      ) : null}
      {progress ? (
        <p role="status" aria-live="polite">
          {progress.analyzedPlies} of {progress.totalPlies} eligible plies analysed.
        </p>
      ) : null}
      {status === 'partial' ? (
        <p role="alert">Partial analysis: completed positions remain cached and can be resumed.</p>
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
      {result && result.annotations.length > 0 ? (
        <>
          <GameReviewSummaryCard result={result} upstreamAccuracies={upstreamAccuracies} />
          <MoveAccuracyGraph annotations={result.annotations} onSelectPly={onSelectPly} />
          <AnalysisMoveList
            id="analysis-move-list"
            annotations={result.annotations}
            selectedPly={selectedPly}
            onSelectPly={onSelectPly}
          />
          {selectedAnnotation ? (
            <EngineAnnotationPanel
              annotation={selectedAnnotation}
              startFen={fenByPly[selectedAnnotation.ply]}
              onSelectPly={onSelectPly}
              onExplorePv={onExplorePv}
            />
          ) : (
            <div className="annotation-panel-empty" role="note">
              <p>Select a move from the graph or move list to view detailed engine analysis.</p>
            </div>
          )}
        </>
      ) : null}
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
