import { describe, it, expect } from 'vitest';
import {
  computeOutcomes,
  computeRatingTrend,
  computeStreaks,
  computeOpeningStats,
  computeTacticalStats,
  aggregateAllInsights,
  extractFirstMovesFromPgn,
} from '../../features/profile-insights/aggregations';
import type { GameRecord } from '../../lib/db/schema';
import type { GameAnalysisResult } from '../../features/stockfish-analysis/analyzeGame';

function makeGame(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: 'https://www.chess.com/game/live/101',
    username: 'testuser',
    url: 'https://www.chess.com/game/live/101',
    userColor: 'white',
    result: 'win',
    endedAt: 1700000000,
    timeClass: 'rapid',
    rated: true,
    userRating: 1550,
    opponentRating: 1530,
    whitePlayer: { username: 'testuser', rating: 1550 },
    blackPlayer: { username: 'opponent', rating: 1530 },
    pgn: `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2023.11.14"]
[White "testuser"]
[Black "opponent"]
[Result "1-0"]
[ECO "C00"]
[ECOUrl "https://www.chess.com/openings/French-Defense"]
[Opening "French Defense"]

1. e4 e6 2. d4 d5 1-0`,
    rules: 'chess',
    ...overrides,
  };
}

describe('aggregations', () => {
  describe('computeOutcomes', () => {
    it('returns zeroes when games array is empty', () => {
      const result = computeOutcomes([]);
      expect(result).toEqual({
        wins: 0,
        losses: 0,
        draws: 0,
        total: 0,
        winRate: 0,
      });
    });

    it('calculates counts and winRate percentage accurately', () => {
      const games = [
        makeGame({ result: 'win' }),
        makeGame({ result: 'win' }),
        makeGame({ result: 'loss' }),
        makeGame({ result: 'draw' }),
      ];

      const outcomes = computeOutcomes(games);
      expect(outcomes.wins).toBe(2);
      expect(outcomes.losses).toBe(1);
      expect(outcomes.draws).toBe(1);
      expect(outcomes.total).toBe(4);
      expect(outcomes.winRate).toBe(50);
    });

    it('filters by userColor when requested', () => {
      const games = [
        makeGame({ result: 'win', userColor: 'white' }),
        makeGame({ result: 'loss', userColor: 'white' }),
        makeGame({ result: 'win', userColor: 'black' }),
      ];

      const whiteOutcomes = computeOutcomes(games, 'white');
      expect(whiteOutcomes.total).toBe(2);
      expect(whiteOutcomes.wins).toBe(1);
      expect(whiteOutcomes.winRate).toBe(50);

      const blackOutcomes = computeOutcomes(games, 'black');
      expect(blackOutcomes.total).toBe(1);
      expect(blackOutcomes.wins).toBe(1);
      expect(blackOutcomes.winRate).toBe(100);
    });
  });

  describe('computeRatingTrend', () => {
    it('returns empty array when no rated games exist', () => {
      expect(computeRatingTrend([])).toEqual([]);
      expect(computeRatingTrend([makeGame({ userRating: null })])).toEqual([]);
      expect(computeRatingTrend([makeGame({ userRating: 0 })])).toEqual([]);
    });

    it('sorts points chronologically by endedAt ascending', () => {
      const games = [
        makeGame({ id: 'g3', endedAt: 3000, userRating: 1600, result: 'win', timeClass: 'rapid' }),
        makeGame({ id: 'g1', endedAt: 1000, userRating: 1500, result: 'loss', timeClass: 'rapid' }),
        makeGame({ id: 'g2', endedAt: 2000, userRating: 1550, result: 'win', timeClass: 'rapid' }),
      ];

      const trend = computeRatingTrend(games);
      expect(trend).toHaveLength(3);
      expect(trend[0]!.gameId).toBe('g1');
      expect(trend[0]!.rating).toBe(1500);
      expect(trend[1]!.gameId).toBe('g2');
      expect(trend[1]!.rating).toBe(1550);
      expect(trend[2]!.gameId).toBe('g3');
      expect(trend[2]!.rating).toBe(1600);
    });
  });

  describe('computeStreaks', () => {
    it('returns none with count 0 for empty games', () => {
      expect(computeStreaks([])).toEqual({ type: 'none', count: 0 });
    });

    it('determines the current streak from the most recent game', () => {
      const games = [
        makeGame({ id: '1', endedAt: 1000, result: 'loss' }),
        makeGame({ id: '2', endedAt: 2000, result: 'win' }),
        makeGame({ id: '3', endedAt: 3000, result: 'win' }),
        makeGame({ id: '4', endedAt: 4000, result: 'win' }),
      ];

      expect(computeStreaks(games)).toEqual({ type: 'win', count: 3 });
    });

    it('correctly handles unordered game inputs', () => {
      const games = [
        makeGame({ id: '4', endedAt: 4000, result: 'loss' }),
        makeGame({ id: '1', endedAt: 1000, result: 'win' }),
        makeGame({ id: '3', endedAt: 3000, result: 'loss' }),
        makeGame({ id: '2', endedAt: 2000, result: 'win' }),
      ];

      expect(computeStreaks(games)).toEqual({ type: 'loss', count: 2 });
    });
  });

  describe('extractFirstMovesFromPgn', () => {
    it('strips clock annotations and comments from PGN body', () => {
      const pgn = `[Event "Live Chess"]\n[White "player1"]\n[Black "player2"]\n\n1. d4 {[%clk 0:02:59.6]} 1... d5 {[%clk 0:02:58.1]} 2. c4 {[%clk 0:02:57]} e6 1-0`;
      const moves = extractFirstMovesFromPgn(pgn);
      expect(moves).toBe('1. d4 1... d5 2. c4 e6');
    });

    it('returns empty string for empty input', () => {
      expect(extractFirstMovesFromPgn('')).toBe('');
    });
  });

  describe('computeOpeningStats', () => {
    it('groups games by opening name and calculates win rate without clock comments in moves', () => {
      const games = [
        makeGame({
          id: '1',
          userColor: 'white',
          result: 'win',
          pgn: `[ECO "B01"]\n[Opening "Scandinavian Defense"]\n\n1. e4 {[%clk 0:03:00]} d5 {[%clk 0:02:58]} 2. exd5 Qxd5 1-0`,
        }),
        makeGame({
          id: '2',
          userColor: 'white',
          result: 'win',
          pgn: `[ECO "B01"]\n[Opening "Scandinavian Defense"]\n\n1. e4 d5 2. exd5 Qxd5 1-0`,
        }),
        makeGame({
          id: '3',
          userColor: 'white',
          result: 'loss',
          pgn: `[ECO "B01"]\n[Opening "Scandinavian Defense"]\n\n1. e4 d5 2. exd5 Qxd5 0-1`,
        }),
        makeGame({
          id: '4',
          userColor: 'white',
          result: 'win',
          pgn: `[ECO "C00"]\n[Opening "French Defense"]\n\n1. e4 e6 2. d4 d5 1-0`,
        }),
      ];

      const whiteOpenings = computeOpeningStats(games, 'white');
      expect(whiteOpenings).toHaveLength(2);
      expect(whiteOpenings[0]!.name).toBe('Scandinavian Defense');
      expect(whiteOpenings[0]!.played).toBe(3);
      expect(whiteOpenings[0]!.wins).toBe(2);
      expect(whiteOpenings[0]!.losses).toBe(1);
      expect(whiteOpenings[0]!.winRate).toBe(66.7);
      expect(whiteOpenings[0]!.eco).toBe('B01');
      expect(whiteOpenings[0]!.moves).toBe('1. e4 d5 2. exd5 Qxd5');

      expect(whiteOpenings[1]!.name).toBe('French Defense');
      expect(whiteOpenings[1]!.played).toBe(1);
      expect(whiteOpenings[1]!.winRate).toBe(100);
    });

    it('falls back gracefully when Opening header is missing', () => {
      const games = [
        makeGame({
          id: '1',
          userColor: 'black',
          result: 'draw',
          pgn: `[ECO "B20"]\n[ECOUrl "https://www.chess.com/openings/Sicilian-Defense"]\n\n1. e4 c5 1/2-1/2`,
        }),
      ];

      const blackOpenings = computeOpeningStats(games, 'black');
      expect(blackOpenings).toHaveLength(1);
      expect(blackOpenings[0]!.name).toBe('Sicilian Defense');
      expect(blackOpenings[0]!.draws).toBe(1);
      expect(blackOpenings[0]!.winRate).toBe(0);
    });
  });

  describe('computeTacticalStats', () => {
    it('returns empty metrics when no analyses exist', () => {
      const stats = computeTacticalStats([makeGame()], {});
      expect(stats.totalEvaluatedMoves).toBe(0);
      expect(stats.avgAccuracy).toBeNull();
      expect(stats.blunders).toBe(0);
      expect(stats.blundersPerGame).toBe(0);
    });

    it('aggregates tactical move quality from GameAnalysisResult', () => {
      const game1 = makeGame({ id: 'g1', userColor: 'white' });
      const game2 = makeGame({ id: 'g2', userColor: 'black' });

      const mockAnalysis1: GameAnalysisResult = {
        status: 'complete',
        annotations: [],
        analyzedPlies: 20,
        totalPlies: 20,
        summary: {
          white: {
            accuracyEstimate: 85.5,
            eligibleMoves: 25,
            excludedMoves: 0,
            breakdown: {
              blunder: 1,
              mistake: 2,
              inaccuracy: 3,
              miss: 1,
              brilliant: 0,
              great: 1,
              best: 10,
              excellent: 4,
              good: 3,
              forced: 0,
            },
          },
          black: {
            accuracyEstimate: 70,
            eligibleMoves: 25,
            excludedMoves: 0,
            breakdown: {
              blunder: 3,
              mistake: 2,
              inaccuracy: 2,
              miss: 0,
              brilliant: 0,
              great: 0,
              best: 8,
              excellent: 3,
              good: 7,
              forced: 0,
            },
          },
        },
        warnings: [],
      };

      const mockAnalysis2: GameAnalysisResult = {
        status: 'complete',
        annotations: [],
        analyzedPlies: 20,
        totalPlies: 20,
        summary: {
          white: {
            accuracyEstimate: 90,
            eligibleMoves: 20,
            excludedMoves: 0,
            breakdown: {
              blunder: 0,
              mistake: 0,
              inaccuracy: 1,
              miss: 0,
              brilliant: 1,
              great: 2,
              best: 12,
              excellent: 3,
              good: 2,
              forced: 0,
            },
          },
          black: {
            accuracyEstimate: 75.5,
            eligibleMoves: 20,
            excludedMoves: 0,
            breakdown: {
              blunder: 2,
              mistake: 1,
              inaccuracy: 2,
              miss: 0,
              brilliant: 0,
              great: 0,
              best: 9,
              excellent: 2,
              good: 4,
              forced: 0,
            },
          },
        },
        warnings: [],
      };

      const analysisMap: Record<string, GameAnalysisResult> = {
        g1: mockAnalysis1,
        g2: mockAnalysis2,
      };

      const stats = computeTacticalStats([game1, game2], analysisMap);
      expect(stats.blunders).toBe(3);
      expect(stats.mistakes).toBe(3);
      expect(stats.inaccuracies).toBe(5);
      expect(stats.misses).toBe(1);
      expect(stats.totalEvaluatedMoves).toBe(45);
      expect(stats.blundersPerGame).toBe(1.5);
      expect(stats.avgAccuracy).toBe(80.5);
    });
  });

  describe('aggregateAllInsights', () => {
    it('integrates filtering and aggregation cleanly', () => {
      const games = [
        makeGame({ id: '1', timeClass: 'rapid', userColor: 'white', result: 'win', endedAt: 1000 }),
        makeGame({
          id: '2',
          timeClass: 'rapid',
          userColor: 'black',
          result: 'loss',
          endedAt: 2000,
        }),
        makeGame({ id: '3', timeClass: 'blitz', userColor: 'white', result: 'win', endedAt: 3000 }),
      ];

      const aggregated = aggregateAllInsights(
        games,
        {},
        {
          timeClass: 'rapid',
          color: 'all',
          dateRange: 'all',
        }
      );

      expect(aggregated.totalGames).toBe(2);
      expect(aggregated.overall.wins).toBe(1);
      expect(aggregated.overall.losses).toBe(1);
      expect(aggregated.ratingPoints).toHaveLength(2);
      expect(aggregated.currentStreak).toEqual({ type: 'loss', count: 1 });
    });
  });
});
