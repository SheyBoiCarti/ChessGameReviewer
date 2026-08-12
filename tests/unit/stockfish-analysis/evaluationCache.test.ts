import { describe, expect, it } from 'vitest';

import {
  EvaluationCache,
  serializeEvaluationKey,
  type EvaluationCacheRepository,
  type EvaluationKey,
} from '@/features/stockfish-analysis/evaluationCache';
import type { EvaluationResult } from '@/lib/engine/stockfishAdapter';

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const result: EvaluationResult = {
  bestMove: 'e2e4',
  lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: 24 }, pv: ['e2e4', 'e7e5'] }],
};

function evaluationKey(overrides: Partial<EvaluationKey> = {}): EvaluationKey {
  return {
    fen,
    engineBuild: 'stockfish-17.1',
    networkHash: 'nnue-abc',
    limit: { depth: 12 },
    multiPv: 1,
    threads: 1,
    hashMb: 32,
    analysisVersion: 'analysis-v1',
    normalizationVersion: 'normalization-v1',
    ...overrides,
  };
}

class MemoryRepository implements EvaluationCacheRepository {
  readonly records = new Map<
    string,
    ReturnType<EvaluationCacheRepository['get']> extends Promise<infer T> ? NonNullable<T> : never
  >();

  async get(key: string) {
    return this.records.get(key) ?? null;
  }

  async put(record: NonNullable<Awaited<ReturnType<EvaluationCacheRepository['get']>>>) {
    this.records.set(record.key, record);
  }
}

describe('EvaluationCache', () => {
  it('serializes an exact complete-FEN key in a deterministic field order', () => {
    expect(serializeEvaluationKey(evaluationKey())).toBe(
      JSON.stringify({
        fen,
        engineBuild: 'stockfish-17.1',
        networkHash: 'nnue-abc',
        limit: { depth: 12 },
        multiPv: 1,
        threads: 1,
        hashMb: 32,
        analysisVersion: 'analysis-v1',
        normalizationVersion: 'normalization-v1',
      })
    );
  });

  it.each([
    ['fen', { fen: fen.replace(' 0 1', ' 1 1') }],
    ['engine build', { engineBuild: 'stockfish-18' }],
    ['network hash', { networkHash: 'nnue-def' }],
    ['limit', { limit: { movetimeMs: 1000 } }],
    ['multi-PV', { multiPv: 2 }],
    ['threads', { threads: 2 }],
    ['hash memory', { hashMb: 64 }],
    ['analysis version', { analysisVersion: 'analysis-v2' }],
    ['normalization version', { normalizationVersion: 'normalization-v2' }],
  ] as const)('does not reuse a cached result when %s differs', async (_field, overrides) => {
    const repository = new MemoryRepository();
    const cache = new EvaluationCache(repository, () => 100);
    const original = evaluationKey();
    await cache.put(original, result);

    await expect(cache.get({ ...original, ...overrides })).resolves.toBeNull();
  });

  it('returns an exact compatible cached evaluation', async () => {
    const repository = new MemoryRepository();
    const cache = new EvaluationCache(repository, () => 100);
    const key = evaluationKey();
    await cache.put(key, result);

    await expect(cache.get(key)).resolves.toEqual(result);
  });
});
