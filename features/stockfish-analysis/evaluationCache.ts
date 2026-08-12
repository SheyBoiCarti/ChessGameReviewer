import type { EvaluationRecord } from '@/lib/db/schema';
import { getEvaluation, putEvaluation } from '@/lib/db/repositories';
import type { EvaluationLimit, EvaluationResult } from '@/lib/engine/stockfishAdapter';

/**
 * The complete, six-field FEN is deliberately part of this key. Opening-tree
 * four-field keys are not interchangeable with engine-evaluation identities.
 */
export interface EvaluationKey {
  fen: string;
  engineBuild: string;
  networkHash: string;
  limit: EvaluationLimit;
  multiPv: number;
  threads: number;
  hashMb: number;
  analysisVersion: string;
  normalizationVersion: string;
}

export interface EvaluationCacheRepository {
  get(key: string): Promise<EvaluationRecord | null>;
  put(record: EvaluationRecord): Promise<void>;
}

export function createIndexedDbEvaluationRepository(db: IDBDatabase): EvaluationCacheRepository {
  return {
    get: (key) => getEvaluation(db, key),
    put: (record) => putEvaluation(db, record),
  };
}

/** Stable JSON serialization keeps cache entries portable across sessions. */
export function serializeEvaluationKey(key: EvaluationKey): string {
  assertEvaluationKey(key);
  return JSON.stringify({
    fen: key.fen,
    engineBuild: key.engineBuild,
    networkHash: key.networkHash,
    limit: canonicalLimit(key.limit),
    multiPv: key.multiPv,
    threads: key.threads,
    hashMb: key.hashMb,
    analysisVersion: key.analysisVersion,
    normalizationVersion: key.normalizationVersion,
  });
}

export class EvaluationCache {
  constructor(
    private readonly repository: EvaluationCacheRepository,
    private readonly now: () => number = Date.now
  ) {}

  async get(key: EvaluationKey): Promise<EvaluationResult | null> {
    const record = await this.repository.get(serializeEvaluationKey(key));
    return record && isEvaluationResult(record.evaluation) ? record.evaluation : null;
  }

  async put(key: EvaluationKey, evaluation: EvaluationResult): Promise<void> {
    if (!isEvaluationResult(evaluation))
      throw new Error('Cannot cache an invalid engine evaluation.');
    await this.repository.put({
      key: serializeEvaluationKey(key),
      // This legacy field remains populated with the complete position identity.
      positionHash: key.fen,
      engineBuild: key.engineBuild,
      lastUsedAt: this.now(),
      evaluation,
    });
  }
}

function canonicalLimit(limit: EvaluationLimit): Record<string, number> {
  const entries = [
    ['depth', limit.depth],
    ['movetimeMs', limit.movetimeMs],
    ['nodes', limit.nodes],
  ].filter((entry): entry is [string, number] => entry[1] !== undefined);
  if (entries.length !== 1)
    throw new Error('An evaluation key requires exactly one evaluation limit.');
  return Object.fromEntries(entries);
}

function assertEvaluationKey(key: EvaluationKey): void {
  if (key.fen.trim().split(/\s+/).length !== 6)
    throw new Error('Evaluation keys require a complete FEN.');
  if (!key.engineBuild || !key.networkHash || !key.analysisVersion || !key.normalizationVersion)
    throw new Error('Evaluation key version fields must be non-empty.');
  if (!Number.isInteger(key.multiPv) || key.multiPv < 1)
    throw new Error('multiPv must be a positive integer.');
  if (!Number.isInteger(key.threads) || key.threads < 1)
    throw new Error('threads must be a positive integer.');
  if (!Number.isInteger(key.hashMb) || key.hashMb < 1)
    throw new Error('hashMb must be a positive integer.');
  canonicalLimit(key.limit);
}

function isEvaluationResult(value: unknown): value is EvaluationResult {
  if (!isObject(value) || typeof value.bestMove !== 'string' || !Array.isArray(value.lines))
    return false;
  return value.lines.every(
    (line) =>
      isObject(line) &&
      Number.isInteger(line.multiPv) &&
      Number.isFinite(line.depth) &&
      isScore(line.score) &&
      Array.isArray(line.pv) &&
      line.pv.every((move) => typeof move === 'string')
  );
}

function isScore(value: unknown): boolean {
  return (
    isObject(value) &&
    (value.kind === 'cp' || value.kind === 'mate') &&
    typeof value.value === 'number' &&
    Number.isFinite(value.value) &&
    (value.bound === undefined || value.bound === 'lower' || value.bound === 'upper')
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
