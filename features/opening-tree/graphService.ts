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
import { deleteUserData } from '@/lib/db/deleteLocalData';

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
  private generation = 0;
  private readonly writers = new Set<Promise<unknown>>();

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
    if (byteSize > this.maxMemoryBytes || this.maxMemoryEntries < 1) return;
    const previous = this.cache.get(key);
    if (previous) {
      this.totalBytes -= previous.byteSize;
      this.cache.delete(key);
    }
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

    const generation = this.generation;
    const assertCurrent = () => {
      if (generation !== this.generation) throw new Error('GRAPH_BUILD_CANCELLED');
    };
    const write = async (operation: () => Promise<unknown>) => {
      assertCurrent();
      const writer = operation();
      this.writers.add(writer);
      try {
        await writer;
      } finally {
        this.writers.delete(writer);
      }
      assertCurrent();
    };
    const buildPromise = (async () => {
      const db = this.deps.getDb ? await this.deps.getDb().catch(() => null) : null;
      assertCurrent();
      if (db) {
        try {
          const record = await getGraphSnapshot(db, key);
          assertCurrent();
          if (record?.snapshotData) {
            const envelope = record.snapshotData as {
              version: number;
              identity: string;
              result: GraphBuildWorkerResult;
            };
            if (
              envelope.version !== 1 ||
              envelope.identity !== key ||
              record.username !== identity.username.trim().toLowerCase() ||
              record.byteSize !== new TextEncoder().encode(JSON.stringify(envelope)).byteLength ||
              record.byteSize > identity.limits.maxBytes
            )
              throw new Error('INVALID_GRAPH_CACHE');
            const result = envelope.result;
            const snapshot = result.snapshot;
            deserializeOpeningGraph(snapshot);
            if (
              snapshot.datasetRevision !== identity.datasetRevision ||
              snapshot.queryFingerprint !== identity.datasetRevision ||
              snapshot.openingHorizon !== identity.horizon ||
              !['complete', 'partial', 'limited'].includes(result.status) ||
              (result.status !== 'complete' &&
                (!Array.isArray(result.diagnosticCodes) ||
                  result.diagnosticCodes.some((code) => typeof code !== 'string') ||
                  result.excludedGameCount !== snapshot.excludedGameCount)) ||
              (result.status === 'limited' &&
                (snapshot.status !== 'limited' ||
                  result.reachedLimit !== snapshot.reachedLimit ||
                  result.includedGameCount !== snapshot.includedGameCount ||
                  result.remainingGameCount !== snapshot.remainingGameCount)) ||
              (result.status !== 'limited' && snapshot.status !== 'complete') ||
              (result.status === 'partial' && snapshot.excludedGameCount === 0)
            )
              throw new Error('INVALID_GRAPH_CACHE');
            await write(() => putGraphSnapshot(db, { ...record, lastUsedAt: Date.now() }));
            this.putMemory(key, result, record.byteSize, identity.username);
            return result;
          }
        } catch {
          // Corrupt/quota/version mismatch is treated as safe cache miss
        }
      }

      assertCurrent();
      const options: GraphBuildOptions = {
        maxOpeningPlies: identity.horizon,
        includeRepeatedPositions: identity.repetitionPolicy === 'include-repeats',
        maxBytes: identity.limits.maxBytes,
        structuralLimits: {
          ...(identity.limits.maxPositions !== undefined
            ? { maxPositions: identity.limits.maxPositions }
            : {}),
          ...(identity.limits.maxEdges !== undefined ? { maxEdges: identity.limits.maxEdges } : {}),
          ...(identity.limits.maxPathNodes !== undefined
            ? { maxPathNodes: identity.limits.maxPathNodes }
            : {}),
        },
      };
      const queryFingerprint = identity.datasetRevision;

      const result = this.deps.build
        ? await this.deps.build(games, options, queryFingerprint)
        : await this.deps.workerClient!.build(games, options, queryFingerprint);

      assertCurrent();
      const byteSize = serializedGraphByteSize(result.snapshot);

      this.putMemory(key, result, byteSize, identity.username);

      if (db) {
        try {
          const snapshotWithRevision: SerializedOpeningGraph = {
            ...result.snapshot,
            datasetRevision: identity.datasetRevision,
          };
          const envelope = {
            version: 1,
            identity: key,
            result: { ...result, snapshot: snapshotWithRevision },
          };
          const persistedBytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
          if (persistedBytes <= identity.limits.maxBytes) {
            await write(() =>
              putGraphSnapshot(db, {
                key,
                username: identity.username.trim().toLowerCase(),
                createdAt: Date.now(),
                lastUsedAt: Date.now(),
                byteSize: persistedBytes,
                snapshotData: envelope,
              })
            );
            await write(() =>
              evictGraphSnapshots(db, { maxCount: 50, maxTotalBytes: 128 * 1024 * 1024 })
            );
          }
        } catch {
          // Persistence errors do not fail the build
        }
      }

      assertCurrent();
      return result;
    })();

    this.inFlight.set(key, buildPromise);
    try {
      return await buildPromise;
    } finally {
      if (this.inFlight.get(key) === buildPromise) this.inFlight.delete(key);
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
    this.generation++;
    this.inFlight.clear();
    this.deps.workerClient?.cancel?.();
  }

  clearMemory(): void {
    this.cancel();
    this.cache.clear();
    this.totalBytes = 0;
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.writers]);
  }

  async deleteUser(username: string): Promise<void> {
    this.cancel();
    await this.drain();
    const normalized = username.trim().toLowerCase();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.username === normalized) {
        this.totalBytes -= entry.byteSize;
        this.cache.delete(key);
      }
    }

    const db = this.deps.getDb ? await this.deps.getDb().catch(() => null) : null;
    if (db) {
      try {
        await deleteUserData(db, normalized);
      } catch {
        // Safe deletion
      }
    }
  }

  dispose(): void {
    this.clearMemory();
    this.inFlight.clear();
    this.deps.workerClient?.dispose?.();
  }
}
