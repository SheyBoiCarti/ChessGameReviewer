import { graphCacheKey, type GraphCacheIdentity } from './graphIdentity';
import type { GraphBuildWorkerResult } from './graphWorkerClient';
import type { NormalizedGameSummary } from '@/lib/api/contracts';
import {
  serializedGraphByteSize,
  deserializeOpeningGraph,
  type SerializedOpeningGraph,
  MAX_SERIALIZED_GRAPH_BYTES,
} from '@/lib/chess/graph/serialization';
import type { GraphBuildOptions } from '@/lib/chess/graph/types';
import { getGraphSnapshot, putGraphSnapshot } from '@/lib/db/repositories';
import { evictGraphSnapshots } from '@/lib/db/retention';

export interface GraphServiceDependencies {
  workerClient?: {
    build(
      games: readonly NormalizedGameSummary[],
      options: GraphBuildOptions,
      queryFingerprint: string
    ): Promise<GraphBuildWorkerResult>;
    cancel?(): void;
    dispose?(): void;
  };
  build?: (
    games: readonly NormalizedGameSummary[],
    options: GraphBuildOptions,
    queryFingerprint: string
  ) => Promise<GraphBuildWorkerResult>;
  getDb?: () => Promise<IDBDatabase | null>;
  maxMemoryEntries?: number;
  maxMemoryBytes?: number;
}

interface MemoryCacheEntry {
  result: GraphBuildWorkerResult;
  byteSize: number;
  username: string;
}

export class GraphService {
  private readonly deps: GraphServiceDependencies;
  private readonly maxMemoryEntries: number;
  private readonly maxMemoryBytes: number;
  private readonly cache = new Map<string, MemoryCacheEntry>();
  private readonly inFlight = new Map<string, Promise<GraphBuildWorkerResult>>();
  private totalBytes = 0;

  constructor(deps: GraphServiceDependencies) {
    this.deps = deps;
    this.maxMemoryEntries = deps.maxMemoryEntries ?? 3;
    this.maxMemoryBytes = deps.maxMemoryBytes ?? MAX_SERIALIZED_GRAPH_BYTES;
  }

  private putMemory(
    key: string,
    result: GraphBuildWorkerResult,
    byteSize: number,
    username: string
  ): void {
    while (
      this.cache.size >= this.maxMemoryEntries ||
      (this.cache.size > 0 && this.totalBytes + byteSize > this.maxMemoryBytes)
    ) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      const entry = this.cache.get(oldestKey);
      if (entry) this.totalBytes -= entry.byteSize;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      result,
      byteSize,
      username: username.trim().toLowerCase(),
    });
    this.totalBytes += byteSize;
  }

  async load(
    identity: GraphCacheIdentity,
    games: readonly NormalizedGameSummary[]
  ): Promise<GraphBuildWorkerResult> {
    const key = graphCacheKey(identity);
    const cached = this.cache.get(key);
    if (cached) {
      // LRU: touch by deleting and re-inserting
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.result;
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const buildPromise = (async () => {
      const db = this.deps.getDb ? await this.deps.getDb().catch(() => null) : null;
      if (db) {
        try {
          const record = await getGraphSnapshot(db, key);
          if (record && record.snapshotData) {
            const snapshot = record.snapshotData as SerializedOpeningGraph;
            deserializeOpeningGraph(snapshot);
            if (
              !snapshot.datasetRevision ||
              snapshot.datasetRevision === identity.datasetRevision
            ) {
              void putGraphSnapshot(db, {
                ...record,
                lastUsedAt: Date.now(),
              }).catch(() => {});
              const result: GraphBuildWorkerResult =
                snapshot.status === 'limited'
                  ? {
                      status: 'limited',
                      snapshot,
                      reachedLimit: snapshot.reachedLimit ?? 'maxPositions',
                      includedGameCount: snapshot.includedGameCount,
                      remainingGameCount: snapshot.remainingGameCount,
                      excludedGameCount: snapshot.excludedGameCount,
                      diagnosticCodes: [],
                    }
                  : {
                      status: 'complete',
                      snapshot,
                    };
              this.putMemory(key, result, record.byteSize, identity.username);
              return result;
            }
          }
        } catch {
          // Corrupt/quota/version mismatch is treated as safe cache miss
        }
      }

      const options: GraphBuildOptions = {
        maxOpeningPlies: identity.horizon,
        includeRepeatedPositions: identity.repetitionPolicy === 'include-repeats',
      };
      const queryFingerprint = identity.datasetRevision;

      const result = this.deps.build
        ? await this.deps.build(games, options, queryFingerprint)
        : await this.deps.workerClient!.build(games, options, queryFingerprint);

      const byteSize = serializedGraphByteSize(result.snapshot);

      this.putMemory(key, result, byteSize, identity.username);

      if (db) {
        try {
          const snapshotWithRevision: SerializedOpeningGraph = {
            ...result.snapshot,
            datasetRevision: identity.datasetRevision,
          };
          await putGraphSnapshot(db, {
            key,
            username: identity.username.trim().toLowerCase(),
            createdAt: Date.now(),
            lastUsedAt: Date.now(),
            byteSize,
            snapshotData: snapshotWithRevision,
          });
          await evictGraphSnapshots(db, { maxCount: 50, maxTotalBytes: 128 * 1024 * 1024 });
        } catch {
          // Persistence errors do not fail the build
        }
      }

      return result;
    })();

    this.inFlight.set(key, buildPromise);
    try {
      return await buildPromise;
    } finally {
      this.inFlight.delete(key);
    }
  }

  build(
    games: readonly NormalizedGameSummary[],
    options: GraphBuildOptions,
    queryFingerprint: string
  ): Promise<GraphBuildWorkerResult> {
    if (this.deps.build) {
      return this.deps.build(games, options, queryFingerprint);
    }
    return this.deps.workerClient!.build(games, options, queryFingerprint);
  }

  cancel(): void {
    this.deps.workerClient?.cancel?.();
  }

  clearMemory(): void {
    this.cache.clear();
    this.totalBytes = 0;
  }

  async deleteUser(username: string): Promise<void> {
    const normalized = username.trim().toLowerCase();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.username === normalized) {
        this.totalBytes -= entry.byteSize;
        this.cache.delete(key);
      }
    }
  }

  dispose(): void {
    this.clearMemory();
    this.inFlight.clear();
    this.deps.workerClient?.dispose?.();
  }
}
