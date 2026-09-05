import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GameReviewSummaryCard } from '@/components/analysis/GameReviewSummaryCard';
import type { GameAnalysisResult } from '@/features/stockfish-analysis/analyzeGame';
import type { MoveBreakdown } from '@/lib/engine/accuracy';

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

describe('GameReviewSummaryCard', () => {
  const baseResult: GameAnalysisResult = {
    status: 'complete',
    annotations: [],
    analyzedPlies: 20,
    totalPlies: 20,
    warnings: [],
    summary: {
      white: {
        accuracyEstimate: 85.3,
        eligibleMoves: 10,
        excludedMoves: 0,
        breakdown: { ...emptyBreakdown(), best: 5 },
      },
      black: {
        accuracyEstimate: null, // missing estimate
        eligibleMoves: 10,
        excludedMoves: 0,
        breakdown: { ...emptyBreakdown(), mistake: 2 },
      },
    },
  };

  it('renders default White and Black labels when players are omitted', () => {
    render(<GameReviewSummaryCard result={baseResult} />);

    expect(screen.getByText('White Local estimate')).toBeInTheDocument();
    expect(screen.getByText('Black Local estimate')).toBeInTheDocument();
    expect(screen.getByText('85.3%')).toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('renders custom player names when players prop is provided', () => {
    const players = {
      white: { username: 'Hikaru', rating: 2800 },
      black: { username: 'Magnus', rating: 2850 },
    };

    render(<GameReviewSummaryCard result={baseResult} players={players} />);

    expect(screen.getByText('Hikaru Local estimate')).toBeInTheDocument();
    expect(screen.getByText('Magnus Local estimate')).toBeInTheDocument();
  });

  it('displays the partial review label when result status is not complete', () => {
    const partialResult: GameAnalysisResult = {
      ...baseResult,
      status: 'partial',
      analyzedPlies: 8,
      totalPlies: 20,
    };

    render(<GameReviewSummaryCard result={partialResult} />);

    expect(screen.getByText(/Partial review:\s*8\/20 positions analysed/)).toBeInTheDocument();
    expect(screen.getByText(/Coverage: 8 of 20 eligible plies/)).toBeInTheDocument();
  });

  it('renders upstream Chess.com accuracy cards when upstreamAccuracies are provided', () => {
    render(
      <GameReviewSummaryCard
        result={baseResult}
        upstreamAccuracies={{ white: 89.4, black: 78.1 }}
      />
    );

    expect(screen.getByText('White Chess.com accuracy')).toBeInTheDocument();
    expect(screen.getByText('Black Chess.com accuracy')).toBeInTheDocument();
    expect(screen.getByText('89.4%')).toBeInTheDocument();
    expect(screen.getByText('78.1%')).toBeInTheDocument();
  });

  it('contains the Move breakdown disclosure with all quality classifications', () => {
    render(<GameReviewSummaryCard result={baseResult} />);

    expect(screen.getByText('Move breakdown')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
