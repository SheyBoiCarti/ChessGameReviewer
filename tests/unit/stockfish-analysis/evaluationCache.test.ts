import { describe, expect, it, vi } from 'vitest';

import {
  EvaluationCache,
  serializeEvaluationKey,
  type EvaluationCacheRepository,
  type EvaluationKey,
} from '@/features/stockfish-analysis/evaluationCache';
import type { EvaluationResult } from '@/lib/engine/stockfishAdapter';
import { QuotaExceededError } from '@/lib/db/openDatabase';

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

  async touch(key: string, lastUsedAt: number) {
    const record = this.records.get(key);
    if (!record) return false;
    this.records.set(key, { ...record, lastUsedAt });
    return true;
  }

  async putWithRetention(
    record: NonNullable<Awaited<ReturnType<EvaluationCacheRepository['get']>>>,
    _maxCount: number
  ) {
    this.records.set(record.key, record);
  }

  async recoverQuota() {}
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
    expect(repository.records.get(serializeEvaluationKey(key))?.lastUsedAt).toBe(100);
  });

  it('contains read and write failures as deduplicated safe warnings', async () => {
    const repository: EvaluationCacheRepository = {
      get: vi.fn().mockRejectedValue(new Error(`raw ${fen}`)),
      touch: vi.fn(),
      putWithRetention: vi.fn().mockRejectedValue(new Error('raw quota details')),
      recoverQuota: vi.fn(),
    };
    const cache = new EvaluationCache(repository, () => 100);

    await expect(cache.get(evaluationKey())).resolves.toBeNull();
    await expect(cache.get(evaluationKey())).resolves.toBeNull();
    await expect(cache.put(evaluationKey(), result)).resolves.toBeUndefined();

    expect(cache.warnings().map(({ code }) => code)).toEqual([
      'EVALUATION_CACHE_READ_FAILED',
      'EVALUATION_CACHE_WRITE_FAILED',
    ]);
    expect(JSON.stringify(cache.warnings())).not.toContain(fen);
    expect(JSON.stringify(cache.warnings())).not.toContain('raw quota details');
  });

  it('recovers once from quota pressure and retries the retained write', async () => {
    const putWithRetention = vi
      .fn()
      .mockRejectedValueOnce(new QuotaExceededError())
      .mockResolvedValueOnce(undefined);
    const recoverQuota = vi.fn().mockResolvedValue(undefined);
    const repository: EvaluationCacheRepository = {
      get: vi.fn().mockResolvedValue(null),
      touch: vi.fn(),
      putWithRetention,
      recoverQuota,
    };
    const cache = new EvaluationCache(repository);

    await expect(cache.put(evaluationKey(), result)).resolves.toBeUndefined();

    expect(recoverQuota).toHaveBeenCalledTimes(1);
    expect(putWithRetention).toHaveBeenCalledTimes(2);
    expect(putWithRetention).toHaveBeenLastCalledWith(expect.anything(), 1000);
    expect(cache.warnings()).toEqual([]);
  });

  it('does not retry quota recovery more than once', async () => {
    const putWithRetention = vi.fn().mockRejectedValue(new QuotaExceededError());
    const repository: EvaluationCacheRepository = {
      get: vi.fn().mockResolvedValue(null),
      touch: vi.fn(),
      putWithRetention,
      recoverQuota: vi.fn().mockResolvedValue(undefined),
    };
    const cache = new EvaluationCache(repository);

    await expect(cache.put(evaluationKey(), result)).resolves.toBeUndefined();

    expect(putWithRetention).toHaveBeenCalledTimes(2);
    expect(cache.warnings()).toEqual([expect.objectContaining({ code: 'EVALUATION_CACHE_QUOTA' })]);
  });
});
