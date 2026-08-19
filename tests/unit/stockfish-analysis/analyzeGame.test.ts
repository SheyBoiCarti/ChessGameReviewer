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
      positionBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
      positionAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
    },
    {
      ply: 2,
      san: 'e5',
      uci: 'e7e5',
      fenBefore: afterE4,
      fenAfter: afterE5,
      positionBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
      positionAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -',
    },
  ],
};

const settings = {
  engineBuild: 'stockfish-17.1',
  networkHash: 'nnue-abc',
  limit: { depth: 12 },
  multiPv: 2,
  threads: 1,
  hashMb: 32,
  analysisVersion: 'analyzer-accuracy-v1',
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

function engineForMultiPv(
  responses: Record<string, EvaluationResult>,
  onEvaluate?: (fen: string) => void
): AnalysisEngine {
  return {
    async evaluate(fen) {
      onEvaluate?.(fen);
      const res = responses[fen];
      if (res) return res;
      // Default: side to move has score 0
      return {
        bestMove: 'e2e4',
        lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: 0 }, pv: ['e2e4'] }],
      };
    },
  };
}

describe('analyzeGame', () => {
  it('deduplicates repeated positions, persists each live result, and normalizes MultiPV lines with breakdown', async () => {
    const repository = new MemoryRepository();
    const evaluations: string[] = [];

    const rootResult: EvaluationResult = {
      bestMove: 'e2e4',
      lines: [
        { multiPv: 1, depth: 12, score: { kind: 'cp', value: 200 }, pv: ['e2e4'] },
        { multiPv: 2, depth: 12, score: { kind: 'cp', value: 0 }, pv: ['d2d4'] },
      ],
    };
    // At afterE4, Black is to move. If evaluation is +200 cp for White, UCI score for Black is -200 cp.
    const afterE4Result: EvaluationResult = {
      bestMove: 'e7e5',
      lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: -200 }, pv: ['e7e5'] }],
    };
    // At afterE5, White is to move. UCI score for White is +200 cp.
    const afterE5Result: EvaluationResult = {
      bestMove: 'g1f3',
      lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: 200 }, pv: ['g1f3'] }],
    };

    const result = await analyzeGame({
      game: parsedGame,
      engine: engineForMultiPv(
        { [initialFen]: rootResult, [afterE4]: afterE4Result, [afterE5]: afterE5Result },
        (fen) => evaluations.push(fen)
      ),
      cache: new EvaluationCache(repository, () => 1),
      settings,
    });

    expect(result.status).toBe('complete');
    expect(evaluations).toEqual([initialFen, afterE4, afterE5]);
    expect(repository.records).toHaveLength(3);
    expect(result.annotations.map((annotation) => annotation.ply)).toEqual([1, 2]);
    expect(result.annotations[0]?.before.candidates).toHaveLength(2);
    expect(result.annotations[0]?.accuracy).toMatchObject({ quality: 'great' });
    expect(result.summary.white.breakdown.great).toBe(1);
    expect(result.summary.white.breakdown.brilliant).toBe(0);
    expect(result.summary.white.eligibleMoves).toBe(1);
    expect(result.summary.black.eligibleMoves).toBe(1);
  });

  it('classifies best instead of great when second candidate is absent', async () => {
    const repository = new MemoryRepository();
    const rootResult: EvaluationResult = {
      bestMove: 'e2e4',
      lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: 200 }, pv: ['e2e4'] }],
    };
    const afterE4Result: EvaluationResult = {
      bestMove: 'e7e5',
      lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: -200 }, pv: ['e7e5'] }],
    };
    const afterE5Result: EvaluationResult = {
      bestMove: 'g1f3',
      lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: 200 }, pv: ['g1f3'] }],
    };

    const result = await analyzeGame({
      game: parsedGame,
      engine: engineForMultiPv({
        [initialFen]: rootResult,
        [afterE4]: afterE4Result,
        [afterE5]: afterE5Result,
      }),
      cache: new EvaluationCache(repository, () => 1),
      settings,
    });

    expect(result.annotations[0]?.accuracy).toMatchObject({ quality: 'best' });
    expect(result.summary.white.breakdown.best).toBe(1);
    expect(result.summary.white.breakdown.great).toBe(0);
  });

  it('identifies personal repertoire moves from passed repertoireMoveKeys', async () => {
    const repository = new MemoryRepository();
    const rootResult: EvaluationResult = {
      bestMove: 'd2d4',
      lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: 30 }, pv: ['d2d4'] }],
    };
    const afterE4Result: EvaluationResult = {
      bestMove: 'e7e5',
      lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: -30 }, pv: ['e7e5'] }],
    };
    const afterE5Result: EvaluationResult = {
      bestMove: 'g1f3',
      lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: 30 }, pv: ['g1f3'] }],
    };
    const repertoireKeys = new Set([
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -\u0000e2e4',
    ]);

    const result = await analyzeGame({
      game: parsedGame,
      engine: engineForMultiPv({
        [initialFen]: rootResult,
        [afterE4]: afterE4Result,
        [afterE5]: afterE5Result,
      }),
      cache: new EvaluationCache(repository, () => 1),
      settings,
      repertoireMoveKeys: repertoireKeys,
    });

    expect(result.annotations[0]?.accuracy).toMatchObject({
      quality: 'excellent',
      tags: ['repertoire'],
    });
    expect(result.summary.white.repertoireMoves).toBe(1);
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
      engine: engineForMultiPv({}, () => {
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
      engine: engineForMultiPv({}, (fen) => resumedCalls.push(fen)),
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
      engine: engineForMultiPv({
        [initialFen]: {
          bestMove: 'e2e4',
          lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: 20 }, pv: ['e2e4'] }],
        },
        [afterE4]: {
          bestMove: 'e7e5',
          lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: -20 }, pv: ['e7e5'] }],
        },
      }),
    });
    expect(result.status).toBe('complete');
    expect(result.annotations).toHaveLength(1);
  });

  it('records terminal positions directly with empty candidates', async () => {
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
      engine: engineForMultiPv({}, (fen) => calls.push(fen)),
    });
    expect(result.status).toBe('complete');
    expect(calls).toEqual([initialFen]);
    expect(result.annotations[0]?.after).toMatchObject({
      score: { kind: 'mate', value: -1 },
      pv: [],
      bestMove: '(terminal)',
      candidates: [],
    });
  });
});
