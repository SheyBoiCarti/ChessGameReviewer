import { graphCacheKey, type GraphCacheIdentity } from './graphIdentity';
import type { GraphBuildWorkerResult } from './graphWorkerClient';
import type { NormalizedGameSummary } from '@/lib/api/contracts';
import {
  serializedGraphByteSize,
  MAX_SERIALIZED_GRAPH_BYTES,
} from '@/lib/chess/graph/serialization';
import type { GraphBuildOptions } from '@/lib/chess/graph/types';

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
      const options: GraphBuildOptions = {
        maxOpeningPlies: identity.horizon,
        includeRepeatedPositions: identity.repetitionPolicy === 'include-repeats',
      };
      const queryFingerprint = identity.datasetRevision;

      const result = this.deps.build
        ? await this.deps.build(games, options, queryFingerprint)
        : await this.deps.workerClient!.build(games, options, queryFingerprint);

      const byteSize = serializedGraphByteSize(result.snapshot);

      // Enforce LRU limits before adding new entry
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
        username: identity.username.trim().toLowerCase(),
      });
      this.totalBytes += byteSize;

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
