import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AnalyzerWorkspace } from '@/components/analysis/AnalyzerWorkspace';
import type { GameAnalysisResult, GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { REVIEW_MOVE_QUALITIES, type MoveBreakdown } from '@/lib/engine/accuracy';
import type { EngineCapability } from '@/lib/engine/capabilities';
import { createLongGameAnalysisResult } from '../../fixtures/longAnalysisFixture';

describe('AnalyzerWorkspace', () => {
  it.each([
    ['unavailable', 'Unavailable'],
    ['partial', 'Partial'],
    ['failed', 'Failed'],
    ['running', 'Running'],
    ['cancelled', 'Cancelled'],
    ['complete', 'Complete'],
  ] as const)('shows a visible non-colour status label for %s analysis', (status, label) => {
    render(
      <AnalyzerWorkspace
        capability={capability(status === 'unavailable' ? 'unavailable' : 'single-thread')}
        status={status}
        result={null}
        progress={null}
        strength="balanced"
        onStrengthChange={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onResume={vi.fn()}
        onSelectPly={vi.fn()}
        selectedPly={0}
        fenByPly={{}}
      />
    );

    expect(screen.getByText(`Analysis status: ${label}`, { exact: true })).toBeVisible();
  });

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
        selectedPly={0}
        fenByPly={{}}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/engine unavailable/i);
    expect(screen.getByText('Analysis status: Unavailable', { exact: true })).toBeVisible();
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
        selectedPly={0}
        fenByPly={{}}
      />
    );

    expect(screen.getByText(/stockfish 18/i)).toBeInTheDocument();
    expect(screen.getByText(/single-thread/i)).toBeInTheDocument();
    expect(screen.getAllByText(/depth 10/i).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /start analysis/i }));
    expect(onStart).toHaveBeenCalledWith('quick');
  });

  it('renders GameReviewSummaryCard with all ten quality rows and player local estimates', () => {
    const completeResult: GameAnalysisResult = {
      status: 'complete',
      annotations: [annotation()],
      analyzedPlies: 2,
      totalPlies: 2,
      warnings: [],
      summary: {
        white: {
          accuracyEstimate: 94.5,
          eligibleMoves: 1,
          excludedMoves: 0,
          breakdown: { ...emptyBreakdown(), excellent: 1 },
        },
        black: {
          accuracyEstimate: 88.2,
          eligibleMoves: 1,
          excludedMoves: 0,
          breakdown: { ...emptyBreakdown(), good: 1 },
        },
      },
    };

    render(
      <AnalyzerWorkspace
        capability={capability('threaded')}
        status="complete"
        result={completeResult}
        progress={null}
        strength="balanced"
        onStrengthChange={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onResume={vi.fn()}
        onSelectPly={vi.fn()}
        selectedPly={1}
        fenByPly={{ 1: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }}
      />
    );

    expect(screen.getByText('Game Review Summary')).toBeInTheDocument();
    expect(screen.getByText('White Local estimate')).toBeInTheDocument();
    expect(screen.getByText('Black Local estimate')).toBeInTheDocument();
    expect(screen.getByText('94.5%')).toBeInTheDocument();
    expect(screen.getByText('88.2%')).toBeInTheDocument();

    for (const quality of REVIEW_MOVE_QUALITIES) {
      const label = quality.charAt(0).toUpperCase() + quality.slice(1);
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1);
    }

    expect(screen.getAllByRole('table').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('columnheader', { name: 'White' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Black' })).toBeInTheDocument();
  });

  it('renders separate Chess.com accuracy cards when upstreamAccuracies are provided', () => {
    const completeResult: GameAnalysisResult = {
      status: 'complete',
      annotations: [annotation()],
      analyzedPlies: 2,
      totalPlies: 2,
      warnings: [],
      summary: {
        white: {
          accuracyEstimate: 94.5,
          eligibleMoves: 1,
          excludedMoves: 0,
          breakdown: { ...emptyBreakdown(), excellent: 1 },
        },
        black: {
          accuracyEstimate: 88.2,
          eligibleMoves: 1,
          excludedMoves: 0,
          breakdown: { ...emptyBreakdown(), good: 1 },
        },
      },
    };

    render(
      <AnalyzerWorkspace
        capability={capability('threaded')}
        status="complete"
        result={completeResult}
        progress={null}
        strength="balanced"
        onStrengthChange={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onResume={vi.fn()}
        onSelectPly={vi.fn()}
        selectedPly={1}
        fenByPly={{ 1: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }}
        upstreamAccuracies={{ white: 93.1, black: 72.2 }}
      />
    );

    expect(screen.getByText('White Local estimate')).toBeInTheDocument();
    expect(screen.getByText('White Chess.com accuracy')).toBeInTheDocument();
    expect(screen.getByText('Black Chess.com accuracy')).toBeInTheDocument();
    expect(screen.getByText('93.1%')).toBeInTheDocument();
    expect(screen.getByText('72.2%')).toBeInTheDocument();
  });

  it('supports cancel and partial resume while navigating real annotations and displaying coverage', async () => {
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
        selectedPly={0}
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
        selectedPly={1}
        fenByPly={{
          1: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        }}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/partial analysis/i);
    expect(screen.getByText(/Coverage: 1 of 2 eligible plies/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /resume analysis/i }));
    expect(onResume).toHaveBeenCalledTimes(1);

    // Select ply 1 from the move list
    const plyButton = screen.getByRole('button', { name: /ply 1|1\.\s*e4/i });
    await user.click(plyButton);
    expect(onSelectPly).toHaveBeenCalledWith(1);
    expect(screen.getByText('e4 e5')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/chess\.com affiliation|parity/i);
  });

  it('announces non-fatal local cache persistence degradation', () => {
    render(
      <AnalyzerWorkspace
        capability={capability('threaded')}
        status="complete"
        result={{
          ...analysisResult(),
          status: 'complete',
          warnings: [{ code: 'EVALUATION_CACHE_WRITE_FAILED', message: 'raw detail' }],
        }}
        progress={null}
        strength="balanced"
        onStrengthChange={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onResume={vi.fn()}
        onSelectPly={vi.fn()}
        selectedPly={1}
        fenByPly={{ 1: 'start' }}
      />
    );

    expect(
      screen.getByText(/analysis completed, but some results could not be saved locally/i)
    ).toHaveTextContent(/analysis completed, but some results could not be saved locally/i);
    expect(document.body).not.toHaveTextContent('raw detail');
  });

  it('renders 41 compact move rows and at most one EngineAnnotationPanel for a 41-ply game', () => {
    const longResult = createLongGameAnalysisResult(41);

    const { rerender } = render(
      <AnalyzerWorkspace
        capability={capability('threaded')}
        status="complete"
        result={longResult}
        progress={null}
        strength="balanced"
        onStrengthChange={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onResume={vi.fn()}
        onSelectPly={vi.fn()}
        selectedPly={1}
        fenByPly={{ 1: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }}
      />
    );

    // Exactly one detailed EngineAnnotationPanel (role="article")
    const panels = screen.getAllByRole('article');
    expect(panels).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 4, name: /ply 1:\s*e4/i })).toBeInTheDocument();

    // Rerender with selectedPly = 15
    rerender(
      <AnalyzerWorkspace
        capability={capability('threaded')}
        status="complete"
        result={longResult}
        progress={null}
        strength="balanced"
        onStrengthChange={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onResume={vi.fn()}
        onSelectPly={vi.fn()}
        selectedPly={15}
        fenByPly={{ 15: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' }}
      />
    );

    const updatedPanels = screen.getAllByRole('article');
    expect(updatedPanels).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 4, name: /ply 15:/i })).toBeInTheDocument();
  });

  it('renders empty/instruction state when selectedPly is 0 and does not render any EngineAnnotationPanel', () => {
    const longResult = createLongGameAnalysisResult(41);

    render(
      <AnalyzerWorkspace
        capability={capability('threaded')}
        status="complete"
        result={longResult}
        progress={null}
        strength="balanced"
        onStrengthChange={vi.fn()}
        onStart={vi.fn()}
        onCancel={vi.fn()}
        onResume={vi.fn()}
        onSelectPly={vi.fn()}
        selectedPly={0}
        fenByPly={{}}
      />
    );

    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    expect(screen.getByText(/select a move/i)).toBeInTheDocument();
  });
});

function emptyBreakdown(): MoveBreakdown {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    miss: 0,
    forced: 0,
  };
}

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
      white: {
        accuracyEstimate: 98,
        eligibleMoves: 1,
        excludedMoves: 0,
        breakdown: { ...emptyBreakdown(), excellent: 1 },
      },
      black: {
        accuracyEstimate: null,
        eligibleMoves: 0,
        excludedMoves: 0,
        breakdown: emptyBreakdown(),
      },
    },
    warnings: [],
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
      candidates: [],
    },
    after: {
      score: { kind: 'cp', value: 18 },
      depth: 14,
      pv: ['e7e5', 'g1f3'],
      bestMove: 'e7e5',
      candidates: [],
    },
    accuracy: {
      status: 'classified',
      quality: 'excellent',
      probabilityLoss: 0.01,
      accuracyEstimate: 99,
      heuristicVersion: 'analyzer-accuracy-v3',
    },
    settings,
  };
}
