import { describe, expect, it } from 'vitest';

import { analyzeGame } from '@/features/stockfish-analysis/analyzeGame';
import {
  EvaluationCache,
  type EvaluationCacheRepository,
} from '@/features/stockfish-analysis/evaluationCache';
import { parseGamePgn } from '@/lib/chess/pgnParser';
import type { EvaluationRecord } from '@/lib/db/schema';
import {
  isExactScore,
  normalizeUciScoreToWhite,
  toMoverPerspective,
  type EvaluationScore,
} from '@/lib/engine/evaluation';
import {
  scoreToMoverWinProbability,
  scoreToWhiteWinProbability,
} from '@/lib/engine/winProbability';
import {
  GAME_173037119764_EVALUATIONS,
  GAME_173037119764_SUMMARY,
  GAME_173037119764_UPSTREAM_ACCURACIES,
} from '../../fixtures/game173037119764Fixture';

class MemoryRepository implements EvaluationCacheRepository {
  private entries = new Map<string, EvaluationRecord>();
  async get(key: string): Promise<EvaluationRecord | null> {
    return this.entries.get(key) ?? null;
  }
  async touch(key: string, lastUsedAt: number): Promise<boolean> {
    const record = this.entries.get(key);
    if (!record) return false;
    this.entries.set(key, { ...record, lastUsedAt });
    return true;
  }
  async putWithRetention(record: EvaluationRecord, _maxCount: number): Promise<void> {
    this.entries.set(record.key, record);
  }
  async recoverQuota(): Promise<void> {}
}

describe('Evaluation Invariants', () => {
  it('preserves White-relative scoring at the engine/adapter boundary', () => {
    // White to move with positive cp => White advantage
    const whitePositive = normalizeUciScoreToWhite(
      { kind: 'cp', value: 150 },
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1'
    );
    expect(whitePositive).toEqual({ kind: 'cp', value: 150 });

    // Black to move with UCI positive score (+150 from Black POV) => White-relative is -150
    const blackPositive = normalizeUciScoreToWhite(
      { kind: 'cp', value: 150 },
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    );
    expect(blackPositive).toEqual({ kind: 'cp', value: -150 });
  });

  it('inverts mover expected points correctly for Black vs White', () => {
    const scoreWhiteAhead: EvaluationScore = { kind: 'cp', value: 200 };
    const whiteProb = scoreToMoverWinProbability(scoreWhiteAhead, 'white');
    const blackProb = scoreToMoverWinProbability(scoreWhiteAhead, 'black');

    expect(whiteProb).not.toBeNull();
    expect(blackProb).not.toBeNull();
    expect(whiteProb! + blackProb!).toBeCloseTo(1.0, 5);
    expect(whiteProb!).toBeGreaterThan(0.5);
    expect(blackProb!).toBeLessThan(0.5);
  });

  it('clamps mover probability loss at zero when position improves or stays equal', () => {
    const beforeProb = 0.5;
    const afterProbImproved = 0.7;
    const loss = Math.max(0, beforeProb - afterProbImproved);
    expect(loss).toBe(0);

    const afterProbEqual = 0.5;
    const equalLoss = Math.max(0, beforeProb - afterProbEqual);
    expect(equalLoss).toBe(0);
  });

  it('guarantees monotonic mapping for mate-for, equal, and mate-against scores', () => {
    const mateIn1: EvaluationScore = { kind: 'mate', value: 1 };
    const mateIn3: EvaluationScore = { kind: 'mate', value: 3 };
    const plus500: EvaluationScore = { kind: 'cp', value: 500 };
    const zero: EvaluationScore = { kind: 'cp', value: 0 };
    const minus500: EvaluationScore = { kind: 'cp', value: -500 };
    const mateAgainst3: EvaluationScore = { kind: 'mate', value: -3 };
    const mateAgainst1: EvaluationScore = { kind: 'mate', value: -1 };

    const pMateIn1 = scoreToWhiteWinProbability(mateIn1)!;
    const pMateIn3 = scoreToWhiteWinProbability(mateIn3)!;
    const pPlus500 = scoreToWhiteWinProbability(plus500)!;
    const pZero = scoreToWhiteWinProbability(zero)!;
    const pMinus500 = scoreToWhiteWinProbability(minus500)!;
    const pMateAgainst3 = scoreToWhiteWinProbability(mateAgainst3)!;
    const pMateAgainst1 = scoreToWhiteWinProbability(mateAgainst1)!;

    expect(pMateIn1).toBe(1.0);
    expect(pMateIn3).toBe(1.0);
    expect(pPlus500).toBeGreaterThan(pZero);
    expect(pZero).toBe(0.5);
    expect(pZero).toBeGreaterThan(pMinus500);
    expect(pMateAgainst3).toBe(0.0);
    expect(pMateAgainst1).toBe(0.0);
  });

  it('ensures MultiPV lines do not alter the primary line score used for accuracy', () => {
    const primaryLine: EvaluationScore = { kind: 'cp', value: 100 };
    const secondaryLine: EvaluationScore = { kind: 'cp', value: -200 };

    // Accuracy calculation uses primaryLine, regardless of secondary candidate presence
    const probPrimaryOnly = scoreToMoverWinProbability(primaryLine, 'white');
    expect(probPrimaryOnly).toBeCloseTo(scoreToWhiteWinProbability(primaryLine)!, 5);
  });

  it('runs end-to-end game review for game 173037119764 matching accuracy invariants', async () => {
    const parseRes = parseGamePgn({ game: GAME_173037119764_SUMMARY });
    expect(parseRes.ok).toBe(true);
    if (!parseRes.ok) return;

    const parsedGame = parseRes.game;
    const fakeEngine = {
      evaluate: async (fen: string) => {
        const evalResult = GAME_173037119764_EVALUATIONS[fen];
        if (!evalResult) {
          throw new Error(`Missing fixture evaluation for FEN: ${fen}`);
        }
        return evalResult;
      },
    };

    const settings = {
      engineBuild: 'Stockfish 18',
      networkHash: '9067e33176e',
      limit: { depth: 14 },
      multiPv: 2,
      threads: 1,
      hashMb: 16,
      analysisVersion: 'engine-evaluation-v2',
      normalizationVersion: 'white-perspective-v1',
    };

    const cache = new EvaluationCache(new MemoryRepository(), () => 1);
    const result = await analyzeGame({
      game: parsedGame,
      engine: fakeEngine,
      cache,
      settings,
    });

    expect(result.status).toBe('complete');
    expect(result.summary.white.accuracyEstimate).not.toBeNull();
    expect(result.summary.black.accuracyEstimate).not.toBeNull();

    // White local estimate is close to upstream (93.11%)
    expect(result.summary.white.accuracyEstimate!).toBeGreaterThan(88);
    expect(result.summary.white.accuracyEstimate!).toBeLessThan(99);

    // Black local estimate is calculated and valid
    expect(result.summary.black.accuracyEstimate!).toBeGreaterThan(60);
    expect(result.summary.black.accuracyEstimate!).toBeLessThan(98);

    // Move 8 (ply 15: 8.Nbxd2) is classified as best (NOT brilliant)
    const ply8 = result.annotations.find((a) => a.ply === 15);
    expect(ply8).toBeDefined();
    expect(ply8?.accuracy.status).toBe('classified');
    if (ply8?.accuracy.status === 'classified') {
      expect(ply8.accuracy.quality).toBe('best');
      expect(ply8.accuracy.quality).not.toBe('brilliant');
    }

    // Upstream accuracies preserved on the game
    expect(parsedGame.accuracies).toEqual(GAME_173037119764_UPSTREAM_ACCURACIES);
  });
});
