import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ReviewFeedback } from '@/components/analysis/ReviewFeedback';
import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';

function createMockAnnotation(
  ply: number,
  san: string,
  quality: 'mistake' | 'blunder' | 'best' | 'indeterminate',
  bestMove: string = 'e2e4',
  fenBefore: string = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
): GameAnnotation {
  return {
    ply,
    san,
    uci: 'e2e4',
    mover: 'white',
    before: {
      score: { kind: 'cp', value: 20 },
      depth: 12,
      pv: [bestMove],
      bestMove,
      candidates: [],
    },
    after: {
      score: { kind: 'cp', value: 15 },
      depth: 12,
      pv: ['e7e5'],
      bestMove: 'e7e5',
      candidates: [],
    },
    accuracy:
      quality === 'indeterminate'
        ? { status: 'indeterminate', reason: 'non-finite-score' }
        : {
            status: 'classified',
            quality,
            probabilityLoss: 0.1,
            accuracyEstimate: 95,
            heuristicVersion: 'analyzer-accuracy-v3',
          },
    settings: {
      engineBuild: 'stockfish-18',
      networkHash: 'nnue-test',
      limit: { depth: 12 },
      multiPv: 1,
      threads: 1,
      hashMb: 32,
      analysisVersion: 'analyzer-accuracy-v3',
      normalizationVersion: 'normalization-v1',
    },
  };
}

describe('ReviewFeedback', () => {
  it('displays "Select a move to review it." at ply 0', () => {
    render(
      <ReviewFeedback
        annotation={null}
        selectedPly={0}
        nextMistake={null}
        onSelectPly={vi.fn()}
        hasAnnotations={true}
      />
    );

    expect(screen.getByText('Select a move to review it.')).toBeInTheDocument();
    expect(screen.queryByText('This move has not been analysed yet.')).not.toBeInTheDocument();
  });

  it('displays "This move has not been analysed yet." when annotation is missing at selected ply', () => {
    render(
      <ReviewFeedback
        annotation={null}
        selectedPly={3}
        nextMistake={null}
        onSelectPly={vi.fn()}
        hasAnnotations={true}
      />
    );

    expect(screen.getByText('This move has not been analysed yet.')).toBeInTheDocument();
  });

  it('renders classified move feedback with SAN, quality label, and converted best move', () => {
    const annotation = createMockAnnotation(1, 'e4', 'best', 'e2e4');
    render(
      <ReviewFeedback
        annotation={annotation}
        selectedPly={1}
        startFen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        nextMistake={5}
        onSelectPly={vi.fn()}
        hasAnnotations={true}
      />
    );

    expect(screen.getByText(/e4 — Best/)).toBeInTheDocument();
    expect(screen.getByText(/Best move:\s*e4/)).toBeInTheDocument();
  });

  it('renders "Move quality unavailable" for indeterminate accuracy', () => {
    const annotation = createMockAnnotation(1, 'e4', 'indeterminate', 'e2e4');
    render(
      <ReviewFeedback
        annotation={annotation}
        selectedPly={1}
        startFen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        nextMistake={null}
        onSelectPly={vi.fn()}
        hasAnnotations={true}
      />
    );

    expect(screen.getByText('Move quality unavailable')).toBeInTheDocument();
  });

  it('falls back to "Best move unavailable" if SAN conversion fails', () => {
    const annotation = createMockAnnotation(1, 'e4', 'mistake', 'invalid-uci');
    render(
      <ReviewFeedback
        annotation={annotation}
        selectedPly={1}
        startFen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        nextMistake={null}
        onSelectPly={vi.fn()}
        hasAnnotations={true}
      />
    );

    expect(screen.getByText(/Best move unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/invalid-uci/)).not.toBeInTheDocument();
  });

  it('calls onSelectPly with nextMistake when Next mistake button is clicked', async () => {
    const user = userEvent.setup();
    const onSelectPly = vi.fn();
    const annotation = createMockAnnotation(1, 'e4', 'best', 'e2e4');

    render(
      <ReviewFeedback
        annotation={annotation}
        selectedPly={1}
        startFen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        nextMistake={4}
        onSelectPly={onSelectPly}
        hasAnnotations={true}
      />
    );

    const button = screen.getByRole('button', { name: /Next mistake/i });
    expect(button).toBeEnabled();
    await user.click(button);

    expect(onSelectPly).toHaveBeenCalledWith(4);
  });

  it('disables Next mistake button and displays supporting text when nextMistake is null', () => {
    const annotation = createMockAnnotation(5, 'Nf3', 'blunder', 'e2e4');

    render(
      <ReviewFeedback
        annotation={annotation}
        selectedPly={5}
        startFen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        nextMistake={null}
        onSelectPly={vi.fn()}
        hasAnnotations={true}
      />
    );

    const button = screen.getByRole('button', { name: /Next mistake/i });
    expect(button).toBeDisabled();
    expect(screen.getByText('No later mistakes in the analysed moves.')).toBeInTheDocument();
  });

  it('does not render Next mistake button when hasAnnotations is false', () => {
    render(
      <ReviewFeedback
        annotation={null}
        selectedPly={0}
        nextMistake={null}
        onSelectPly={vi.fn()}
        hasAnnotations={false}
      />
    );

    expect(screen.queryByRole('button', { name: /Next mistake/i })).not.toBeInTheDocument();
  });
});
