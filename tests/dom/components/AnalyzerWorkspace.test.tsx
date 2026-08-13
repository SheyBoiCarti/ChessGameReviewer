import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AnalyzerWorkspace } from '@/components/analysis/AnalyzerWorkspace';
import type { GameAnalysisResult, GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import type { EngineCapability } from '@/lib/engine/capabilities';

describe('AnalyzerWorkspace', () => {
  it('keeps the opening workspace usable when the engine is unavailable', () => {
    render(
      <AnalyzerWorkspace
        capability={capability('unavailable')}
        status="unavailable"
        result={null}
        progress={null}
        strength="balanced"
        onStrengthChange={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onResume={vi.fn()}
        onSelectPly={vi.fn()}
        fenByPly={{}}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/engine unavailable/i);
    expect(screen.getByText(/opening tree remains available/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start analysis/i })).not.toBeInTheDocument();
  });

  it('shows build/resources and starts a validated preset', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <AnalyzerWorkspace
        capability={capability('single-thread')}
        status="idle"
        result={null}
        progress={null}
        strength="quick"
        onStrengthChange={vi.fn()}
        onStart={onStart}
        onCancel={vi.fn()}
        onResume={vi.fn()}
        onSelectPly={vi.fn()}
        fenByPly={{}}
      />
    );

    expect(screen.getByText(/stockfish 18/i)).toBeInTheDocument();
    expect(screen.getByText(/single-thread/i)).toBeInTheDocument();
    expect(screen.getAllByText(/depth 10/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /start analysis/i }));
    expect(onStart).toHaveBeenCalledWith('quick');
  });

  it('supports cancel and partial resume while navigating real annotations', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onResume = vi.fn();
    const onSelectPly = vi.fn();
    const { rerender } = render(
      <AnalyzerWorkspace
        capability={capability('threaded')}
        status="running"
        result={null}
        progress={{ analyzedPlies: 3, totalPlies: 12 }}
        strength="balanced"
        onStrengthChange={vi.fn()}
        onStart={vi.fn()}
        onCancel={onCancel}
        onResume={onResume}
        onSelectPly={onSelectPly}
        fenByPly={{}}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(/3 of 12 eligible plies/i);
    await user.click(screen.getByRole('button', { name: /cancel analysis/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(
      <AnalyzerWorkspace
        capability={capability('threaded')}
        status="partial"
        result={analysisResult()}
        progress={{ analyzedPlies: 1, totalPlies: 2 }}
        strength="balanced"
        onStrengthChange={vi.fn()}
        onStart={vi.fn()}
        onCancel={onCancel}
        onResume={onResume}
        onSelectPly={onSelectPly}
        fenByPly={{
          1: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        }}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/partial analysis/i);
    await user.click(screen.getByRole('button', { name: /resume analysis/i }));
    await user.click(screen.getByRole('button', { name: /select ply 1/i }));
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onSelectPly).toHaveBeenCalledWith(1);
    expect(screen.getByText('e4 e5')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/chess\.com affiliation|parity/i);
  });
});

function capability(mode: EngineCapability['mode']): EngineCapability {
  return {
    mode,
    crossOriginIsolated: mode === 'threaded',
    sharedArrayBuffer: mode === 'threaded',
    simd: mode !== 'unavailable',
    engineInitialized: mode !== 'unavailable',
    ...(mode === 'unavailable' ? { reason: 'WebAssembly startup failed.' } : {}),
    threads: mode === 'threaded' ? 4 : mode === 'single-thread' ? 1 : 0,
    hashMb: 64,
  };
}

function analysisResult(): GameAnalysisResult {
  return {
    status: 'partial',
    annotations: [annotation()],
    analyzedPlies: 1,
    totalPlies: 2,
    summary: {
      white: { accuracyEstimate: 98, eligibleMoves: 1, excludedMoves: 0 },
      black: { accuracyEstimate: null, eligibleMoves: 0, excludedMoves: 0 },
    },
    error: 'Analysis was interrupted.',
  };
}

function annotation(): GameAnnotation {
  const settings: GameAnnotation['settings'] = {
    engineBuild: 'Stockfish 18',
    networkHash: '9067e33176e',
    limit: { depth: 14 },
    multiPv: 2,
    threads: 4,
    hashMb: 64,
    analysisVersion: 'analyzer-accuracy-v1',
    normalizationVersion: 'white-perspective-v1',
  };
  return {
    ply: 1,
    san: 'e4',
    uci: 'e2e4',
    mover: 'white',
    before: {
      score: { kind: 'cp', value: 20 },
      depth: 14,
      pv: ['e2e4', 'e7e5'],
      bestMove: 'e2e4',
    },
    after: {
      score: { kind: 'cp', value: 18 },
      depth: 14,
      pv: ['e7e5', 'g1f3'],
      bestMove: 'e7e5',
    },
    accuracy: {
      status: 'classified',
      quality: 'excellent',
      probabilityLoss: 0.01,
      accuracyEstimate: 99,
      heuristicVersion: 'analyzer-accuracy-v1',
    },
    settings,
  };
}
