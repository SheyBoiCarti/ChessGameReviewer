import type { EvaluationRecord } from '@/lib/db/schema';
import { getEvaluation, putEvaluationWithRetention, touchEvaluation } from '@/lib/db/repositories';
import { evictEvaluations } from '@/lib/db/retention';
import { QuotaExceededError } from '@/lib/db/errors';
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
  touch(key: string, lastUsedAt: number): Promise<boolean>;
  putWithRetention(record: EvaluationRecord, maxCount: number): Promise<void>;
  recoverQuota(): Promise<void>;
}

export interface AnalysisWarning {
  code: 'EVALUATION_CACHE_READ_FAILED' | 'EVALUATION_CACHE_WRITE_FAILED' | 'EVALUATION_CACHE_QUOTA';
  message: string;
}

const CACHE_READ_MESSAGE = 'Some saved analysis could not be read and will be recalculated.';
const CACHE_WRITE_MESSAGE = 'Some analysis results could not be saved locally.';
const CACHE_QUOTA_MESSAGE = 'Local analysis storage is full; some results were not saved.';

export function createIndexedDbEvaluationRepository(db: IDBDatabase): EvaluationCacheRepository {
  return {
    get: (key) => getEvaluation(db, key),
    touch: (key, lastUsedAt) => touchEvaluation(db, key, lastUsedAt),
    putWithRetention: (record, maxCount) => putEvaluationWithRetention(db, record, maxCount),
    recoverQuota: async () => {
      await evictEvaluations(db, { maxCount: 900 });
    },
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
  private readonly warningByCode = new Map<AnalysisWarning['code'], AnalysisWarning>();

  constructor(
    private readonly repository: EvaluationCacheRepository,
    private readonly now: () => number = Date.now
  ) {}

  async get(key: EvaluationKey): Promise<EvaluationResult | null> {
    const serializedKey = serializeEvaluationKey(key);
    let record: EvaluationRecord | null;
    try {
      record = await this.repository.get(serializedKey);
    } catch {
      this.warn('EVALUATION_CACHE_READ_FAILED', CACHE_READ_MESSAGE);
      return null;
    }
    if (!record || !isEvaluationResult(record.evaluation)) return null;
    try {
      await this.repository.touch(serializedKey, this.now());
    } catch {
      this.warn('EVALUATION_CACHE_READ_FAILED', CACHE_READ_MESSAGE);
    }
    return record.evaluation;
  }

  async put(key: EvaluationKey, evaluation: EvaluationResult): Promise<void> {
    if (!isEvaluationResult(evaluation))
      throw new Error('Cannot cache an invalid engine evaluation.');
    const record: EvaluationRecord = {
      key: serializeEvaluationKey(key),
      // This legacy field remains populated with the complete position identity.
      positionHash: key.fen,
      engineBuild: key.engineBuild,
      lastUsedAt: this.now(),
      evaluation,
    };
    try {
      await this.repository.putWithRetention(record, 1000);
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        try {
          await this.repository.recoverQuota();
          await this.repository.putWithRetention(record, 1000);
          return;
        } catch {
          this.warn('EVALUATION_CACHE_QUOTA', CACHE_QUOTA_MESSAGE);
          return;
        }
      }
      this.warn('EVALUATION_CACHE_WRITE_FAILED', CACHE_WRITE_MESSAGE);
    }
  }

  warnings(): readonly AnalysisWarning[] {
    return [...this.warningByCode.values()].map((warning) => ({ ...warning }));
  }

  private warn(code: AnalysisWarning['code'], message: string): void {
    if (!this.warningByCode.has(code)) this.warningByCode.set(code, { code, message });
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
