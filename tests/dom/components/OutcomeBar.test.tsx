import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OutcomeBar } from '@/components/tree/OutcomeBar';
import type { OutcomeBreakdown } from '@/features/opening-tree/selectors';

describe('OutcomeBar', () => {
  it('renders 3/2/5 sample correctly for user perspective with 30/20/50% widths and accessible label', () => {
    const breakdown: OutcomeBreakdown = {
      sampleSize: 10,
      wins: 3,
      draws: 2,
      losses: 5,
      winRate: 0.3,
      drawRate: 0.2,
      lossRate: 0.5,
    };

    render(<OutcomeBar breakdown={breakdown} perspective="user" />);

    const container = screen.getByRole('img', {
      name: 'User wins 3, draws 2, losses 5, from 10 games',
    });
    expect(container).toBeInTheDocument();

    const winSegment = screen.getByTestId('outcome-segment-win');
    const drawSegment = screen.getByTestId('outcome-segment-draw');
    const lossSegment = screen.getByTestId('outcome-segment-loss');

    expect(winSegment).toHaveStyle({ width: '30%' });
    expect(drawSegment).toHaveStyle({ width: '20%' });
    expect(lossSegment).toHaveStyle({ width: '50%' });

    expect(screen.getByText('30% / 20% / 50%')).toBeInTheDocument();
  });

  it('renders board perspective with correct counts and classes', () => {
    const breakdown: OutcomeBreakdown = {
      sampleSize: 10,
      wins: 3,
      draws: 2,
      losses: 5,
      winRate: 0.3,
      drawRate: 0.2,
      lossRate: 0.5,
    };

    render(<OutcomeBar breakdown={breakdown} perspective="board" />);

    const container = screen.getByRole('img', {
      name: 'White wins 3, draws 2, Black wins 5, from 10 games',
    });
    expect(container).toBeInTheDocument();
    expect(container.querySelector('.outcome-bar--board')).toBeInTheDocument();
    expect(screen.getByText('30% / 20% / 50%')).toBeInTheDocument();
  });

  it('renders neutral track and "No games" when sample size is zero', () => {
    const breakdown: OutcomeBreakdown = {
      sampleSize: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: null,
      drawRate: null,
      lossRate: null,
    };

    render(<OutcomeBar breakdown={breakdown} perspective="user" />);

    const container = screen.getByRole('img', { name: 'No games' });
    expect(container).toBeInTheDocument();
    expect(screen.getByText('No games')).toBeInTheDocument();
    expect(screen.queryByTestId('outcome-segment-win')).not.toBeInTheDocument();
  });

  it('maintains unrounded fractional widths for a thirds split', () => {
    const breakdown: OutcomeBreakdown = {
      sampleSize: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      winRate: 1 / 3,
      drawRate: 1 / 3,
      lossRate: 1 / 3,
    };

    render(<OutcomeBar breakdown={breakdown} perspective="user" />);

    const winSegment = screen.getByTestId('outcome-segment-win');
    const drawSegment = screen.getByTestId('outcome-segment-draw');
    const lossSegment = screen.getByTestId('outcome-segment-loss');

    const expectedPct = `${(1 / 3) * 100}%`;
    expect(winSegment).toHaveStyle({ width: expectedPct });
    expect(drawSegment).toHaveStyle({ width: expectedPct });
    expect(lossSegment).toHaveStyle({ width: expectedPct });

    // Rounded display shows 33% / 33% / 33%
    expect(screen.getByText('33% / 33% / 33%')).toBeInTheDocument();
  });
});
