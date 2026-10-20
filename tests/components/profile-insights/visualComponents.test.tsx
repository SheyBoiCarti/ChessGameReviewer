import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PerformanceKpiGrid } from '../../../components/profile-insights/PerformanceKpiGrid';
import { OutcomeDistributionChart } from '../../../components/profile-insights/OutcomeDistributionChart';
import { RatingTrendChart } from '../../../components/profile-insights/RatingTrendChart';
import { TopOpeningsCard } from '../../../components/profile-insights/TopOpeningsCard';
import { TacticalMistakesCard } from '../../../components/profile-insights/TacticalMistakesCard';
import type {
  OutcomeCounts,
  RatingHistoryPoint,
  OpeningInsight,
  TacticalMistakeSummary,
} from '../../../features/profile-insights/types';

describe('Profile Insights Visual Components', () => {
  describe('PerformanceKpiGrid', () => {
    it('renders KPI values with appropriate format and accessible labels', () => {
      render(
        <PerformanceKpiGrid
          totalGames={120}
          winRate={54.2}
          currentStreak={{ type: 'win', count: 4 }}
          avgAccuracy={81.5}
          peakRating={1845}
        />
      );

      expect(screen.getByText('120')).toBeInTheDocument();
      expect(screen.getByText('54.2%')).toBeInTheDocument();
      expect(screen.getByText('4 Wins')).toBeInTheDocument();
      expect(screen.getByText('81.5%')).toBeInTheDocument();
      expect(screen.getByText('1845')).toBeInTheDocument();
    });

    it('renders N/A for null accuracy and peak rating', () => {
      render(
        <PerformanceKpiGrid
          totalGames={0}
          winRate={0}
          currentStreak={{ type: 'none', count: 0 }}
          avgAccuracy={null}
          peakRating={null}
        />
      );

      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('0%')).toBeInTheDocument();
      expect(screen.getByText('None')).toBeInTheDocument();
      expect(screen.getAllByText('N/A')).toHaveLength(2);
    });
  });

  describe('OutcomeDistributionChart', () => {
    const mockOutcome: OutcomeCounts = {
      wins: 10,
      losses: 5,
      draws: 5,
      total: 20,
      winRate: 50,
    };

    it('renders Overall, As White, and As Black outcome bars', () => {
      render(
        <OutcomeDistributionChart
          overall={mockOutcome}
          asWhite={{ wins: 6, losses: 2, draws: 2, total: 10, winRate: 60 }}
          asBlack={{ wins: 4, losses: 3, draws: 3, total: 10, winRate: 40 }}
        />
      );

      expect(screen.getByText('Overall')).toBeInTheDocument();
      expect(screen.getByText('As White')).toBeInTheDocument();
      expect(screen.getByText('As Black')).toBeInTheDocument();
      expect(screen.getByText(/60%/)).toBeInTheDocument();
      expect(screen.getByText(/40%/)).toBeInTheDocument();
    });
  });

  describe('RatingTrendChart', () => {
    it('renders empty state when no rating points are present', () => {
      render(<RatingTrendChart points={[]} />);
      expect(screen.getByText(/No rating history available/i)).toBeInTheDocument();
    });

    it('renders SVG chart with polyline and points when data is provided', () => {
      const points: RatingHistoryPoint[] = [
        { date: 1000, rating: 1500, gameId: '1', result: 'win', timeClass: 'rapid' },
        { date: 2000, rating: 1515, gameId: '2', result: 'win', timeClass: 'rapid' },
        { date: 3000, rating: 1530, gameId: '3', result: 'win', timeClass: 'rapid' },
      ];

      const { container } = render(<RatingTrendChart points={points} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('aria-label');
      expect(container.querySelector('polyline')).toBeInTheDocument();
      expect(screen.getByText('+30')).toBeInTheDocument(); // 1530 - 1500 = +30
    });
  });

  describe('TopOpeningsCard', () => {
    const whiteOpenings: OpeningInsight[] = [
      {
        eco: 'B01',
        name: 'Scandinavian Defense',
        moves: '1. e4 d5 2. exd5',
        played: 12,
        wins: 8,
        losses: 3,
        draws: 1,
        winRate: 66.7,
      },
    ];

    const blackOpenings: OpeningInsight[] = [
      {
        eco: 'C00',
        name: 'French Defense',
        moves: '1. e4 e6 2. d4 d5',
        played: 10,
        wins: 5,
        losses: 4,
        draws: 1,
        winRate: 50,
      },
    ];

    it('toggles between White and Black openings and displays table', () => {
      render(<TopOpeningsCard whiteOpenings={whiteOpenings} blackOpenings={blackOpenings} />);

      expect(screen.getByText('Scandinavian Defense')).toBeInTheDocument();
      expect(screen.getByText('B01')).toBeInTheDocument();
      expect(screen.getByText('66.7%')).toBeInTheDocument();

      const blackTab = screen.getByRole('tab', { name: /As Black/i });
      fireEvent.click(blackTab);

      expect(screen.getByText('French Defense')).toBeInTheDocument();
      expect(screen.getByText('C00')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  describe('TacticalMistakesCard', () => {
    const tactics: TacticalMistakeSummary = {
      totalEvaluatedMoves: 140,
      avgAccuracy: 78.4,
      blunders: 3,
      mistakes: 5,
      inaccuracies: 8,
      misses: 2,
      blundersPerGame: 0.75,
    };

    it('displays blunder and accuracy breakdown', () => {
      render(<TacticalMistakesCard tactics={tactics} />);

      expect(screen.getByText('3')).toBeInTheDocument(); // Blunders
      expect(screen.getByText('5')).toBeInTheDocument(); // Mistakes
      expect(screen.getByText('8')).toBeInTheDocument(); // Inaccuracies
      expect(screen.getByText('2')).toBeInTheDocument(); // Misses
      expect(screen.getByText('78.4%')).toBeInTheDocument(); // Avg accuracy
      expect(screen.getByText(/0.75 \/ game/i)).toBeInTheDocument();
      expect(screen.getByText('140')).toBeInTheDocument(); // Evaluated moves
    });
  });
});
