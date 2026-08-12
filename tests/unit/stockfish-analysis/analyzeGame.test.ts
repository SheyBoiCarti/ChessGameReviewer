import { describe, expect, it } from 'vitest';

import { analyzeGame, type AnalysisEngine } from '@/features/stockfish-analysis/analyzeGame';
import {
  EvaluationCache,
  type EvaluationCacheRepository,
} from '@/features/stockfish-analysis/evaluationCache';
import type { ParsedGame } from '@/lib/chess/pgnParser';
import type { EvaluationResult } from '@/lib/engine/stockfishAdapter';

const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const afterE5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

const parsedGame: ParsedGame = {
  id: 'game-1',
  usernameKey: 'player',
  userColor: 'white',
  result: 'win',
  endedAt: 1,
  timeClass: 'rapid',
  rated: true,
  userRating: 1500,
  opponentRating: 1500,
  warnings: [],
  plies: [
    {
      ply: 1,
      san: 'e4',
      uci: 'e2e4',
      fenBefore: initialFen,
      fenAfter: afterE4,
      positionBefore: '',
      positionAfter: '',
    },
    {
      ply: 2,
      san: 'e5',
      uci: 'e7e5',
      fenBefore: afterE4,
      fenAfter: afterE5,
      positionBefore: '',
      positionAfter: '',
    },
  ],
};

const settings = {
  engineBuild: 'stockfish-17.1',
  networkHash: 'nnue-abc',
  limit: { depth: 12 },
  multiPv: 1,
  threads: 1,
  hashMb: 32,
  analysisVersion: 'analysis-v1',
  normalizationVersion: 'normalization-v1',
};

class MemoryRepository implements EvaluationCacheRepository {
  readonly records = new Map<string, any>();
  async get(key: string) {
    return this.records.get(key) ?? null;
  }
  async put(record: any) {
    this.records.set(record.key, record);
  }
}

function engineFor(
  scores: Record<string, number>,
  onEvaluate?: (fen: string) => void
): AnalysisEngine {
  return {
    async evaluate(fen) {
      onEvaluate?.(fen);
      return {
        bestMove: 'e2e4',
        lines: [
          { multiPv: 1, depth: 12, score: { kind: 'cp', value: scores[fen] ?? 0 }, pv: ['e2e4'] },
        ],
      };
    },
  };
}

describe('analyzeGame', () => {
  it('deduplicates repeated positions, persists each live result, and returns ordered annotations', async () => {
    const repository = new MemoryRepository();
    const evaluations: string[] = [];
    const result = await analyzeGame({
      game: parsedGame,
      engine: engineFor({ [initialFen]: 20, [afterE4]: -10, [afterE5]: 30 }, (fen) =>
        evaluations.push(fen)
      ),
      cache: new EvaluationCache(repository, () => 1),
      settings,
    });

    expect(result.status).toBe('complete');
    expect(evaluations).toEqual([initialFen, afterE4, afterE5]);
    expect(repository.records).toHaveLength(3);
    expect(result.annotations.map((annotation) => annotation.ply)).toEqual([1, 2]);
    expect(result.annotations[0]?.after.pv).toEqual(['e2e4']);
    expect(result.summary.white.eligibleMoves).toBe(1);
    expect(result.summary.black.eligibleMoves).toBe(1);
  });

  it('resumes from incrementally cached positions after cancellation', async () => {
    const repository = new MemoryRepository();
    const cache = new EvaluationCache(repository, () => 1);
    const controller = new AbortController();
    let calls = 0;
    const cancelled = await analyzeGame({
      game: parsedGame,
      cache,
      settings,
      signal: controller.signal,
      engine: engineFor({ [initialFen]: 20, [afterE4]: -10, [afterE5]: 30 }, () => {
        calls += 1;
        if (calls === 2) controller.abort();
      }),
    });

    expect(cancelled).toMatchObject({ status: 'cancelled', analyzedPlies: 1, totalPlies: 2 });
    expect(repository.records).toHaveLength(2);

    const resumedCalls: string[] = [];
    const resumed = await analyzeGame({
      game: parsedGame,
      cache,
      settings,
      engine: engineFor({ [initialFen]: 20, [afterE4]: -10, [afterE5]: 30 }, (fen) =>
        resumedCalls.push(fen)
      ),
    });
    expect(resumed.status).toBe('complete');
    expect(resumedCalls).toEqual([afterE5]);
  });

  it('keeps a live analysis usable when cache persistence rejects', async () => {
    const cache = new EvaluationCache(
      {
        async get() {
          return null;
        },
        async put() {
          throw new DOMException('quota exceeded', 'QuotaExceededError');
        },
      },
      () => 1
    );

    const result = await analyzeGame({
      game: { ...parsedGame, plies: [parsedGame.plies[0]!] },
      cache,
      settings,
      engine: engineFor({ [initialFen]: 20, [afterE4]: -10 }),
    });
    expect(result.status).toBe('complete');
    expect(result.annotations).toHaveLength(1);
  });

  it('records terminal positions directly without requiring an engine PV', async () => {
    const terminal = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    const calls: string[] = [];
    const game: ParsedGame = {
      ...parsedGame,
      plies: [{ ...parsedGame.plies[0]!, fenAfter: terminal }],
    };
    const result = await analyzeGame({
      game,
      cache: new EvaluationCache(new MemoryRepository(), () => 1),
      settings,
      engine: engineFor({ [initialFen]: 20 }, (fen) => calls.push(fen)),
    });
    expect(result.status).toBe('complete');
    expect(calls).toEqual([initialFen]);
    expect(result.annotations[0]?.after).toMatchObject({
      score: { kind: 'mate', value: -1 },
      pv: [],
      bestMove: '(terminal)',
    });
  });
});
