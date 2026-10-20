import type { GameRecord } from '@/lib/db/schema';
import type { GameAnalysisResult } from '@/features/stockfish-analysis/analyzeGame';

export type InsightTimeFilter = 'all' | 'bullet' | 'blitz' | 'rapid' | 'daily';
export type InsightColorFilter = 'all' | 'white' | 'black';
export type InsightDateFilter = 'all' | '30d' | '90d' | '365d';

export interface InsightFilters {
  timeClass: InsightTimeFilter;
  color: InsightColorFilter;
  dateRange: InsightDateFilter;
}

export interface OutcomeCounts {
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winRate: number; // 0 - 100
}

export interface RatingHistoryPoint {
  date: number; // Unix seconds
  rating: number;
  gameId: string;
  result: 'win' | 'loss' | 'draw';
  timeClass: string;
}

export interface OpeningInsight {
  eco?: string | undefined;
  name: string;
  moves: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number; // 0 - 100
}

export interface TacticalMistakeSummary {
  totalEvaluatedMoves: number;
  avgAccuracy: number | null;
  blunders: number;
  mistakes: number;
  inaccuracies: number;
  misses: number;
  blundersPerGame: number;
}

export interface AggregatedProfileInsights {
  totalGames: number;
  overall: OutcomeCounts;
  asWhite: OutcomeCounts;
  asBlack: OutcomeCounts;
  ratingPoints: RatingHistoryPoint[];
  currentStreak: { type: 'win' | 'loss' | 'draw' | 'none'; count: number };
  topOpeningsWhite: OpeningInsight[];
  topOpeningsBlack: OpeningInsight[];
  tactics: TacticalMistakeSummary;
}
