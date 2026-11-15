import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { GraphService } from '@/features/opening-tree/graphService';
import {
  createGraphCacheIdentity,
  type GraphCacheIdentity,
} from '@/features/opening-tree/graphIdentity';
import type { GraphBuildWorkerResult } from '@/features/opening-tree/graphWorkerClient';
import type { NormalizedGameSummary } from '@/lib/api/contracts';
import { makeGameRecord } from '../../helpers/phase1Fixtures';
import { toNormalizedSummary } from '@/features/workspace/createWorkspaceController';
import { serializeOpeningGraph } from '@/lib/chess/graph/serialization';
import { OpeningGraphBuilder } from '@/lib/chess/graph/openingGraph';
import { parseGamePgn } from '@/lib/chess/pgnParser';
import { openDatabase, closeDatabase } from '@/lib/db/openDatabase';
import { DB_NAME } from '@/lib/db/schema';
import { readNormalizedMonth, putNormalizedMonth } from '@/lib/db/repositories';
import { makeNormalizedMonth } from '../../helpers/normalizedMonthFixture';

function makeMockResult(userColor: 'white' | 'black'): GraphBuildWorkerResult {
  const game = makeGameRecord({ id: `g-${userColor}`, userColor, pgn: '1. e4 e5 1/2-1/2' });
  const parsed = parseGamePgn({ game: toNormalizedSummary(game) });
  if (!parsed.ok) throw new Error('Parse failed');
  const builder = new OpeningGraphBuilder({ maxOpeningPlies: 10 });
  const snapshot = builder.build([parsed.game]);
  return {
    status: 'complete',
    snapshot: serializeOpeningGraph(snapshot, {
      queryFingerprint: 'fp',
      sourceGameCount: 1,
      buildTimestamp: 1000,
    }),
  };
}

describe('GraphService', () => {
  const whiteGames: NormalizedGameSummary[] = [
    toNormalizedSummary(makeGameRecord({ id: 'w1', userColor: 'white' })),
  ];
  const blackGames: NormalizedGameSummary[] = [
    toNormalizedSummary(makeGameRecord({ id: 'b1', userColor: 'black' })),
  ];
  const whiteIdentity: GraphCacheIdentity = createGraphCacheIdentity({
    username: 'janedoe',
    query: {
      username: 'janedoe',
      timeClasses: ['blitz'],
      colors: ['white', 'black'],
      maxGames: 20,
    },
    scope: 'white',
    horizon: 10,
    datasetRevision: 'rev-w',
  });
  const blackIdentity: GraphCacheIdentity = createGraphCacheIdentity({
    username: 'janedoe',
    query: {
      username: 'janedoe',
      timeClasses: ['blitz'],
      colors: ['white', 'black'],
      maxGames: 20,
    },
    scope: 'black',
    horizon: 10,
    datasetRevision: 'rev-b',
  });

  it('reuses opening snapshots in a bounded memory cache (White -> Black -> White reuses White)', async () => {
    const build = vi.fn(async (_games, options) => {
      return makeMockResult(options.maxOpeningPlies === 10 ? 'white' : 'black');
    });

    const service = new GraphService({ build });

    await service.load(whiteIdentity, whiteGames);
    await service.load(blackIdentity, blackGames);
    await service.load(whiteIdentity, whiteGames);

    expect(build).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent in-flight requests for the same identity', async () => {
    let finishBuild!: (res: GraphBuildWorkerResult) => void;
    const build = vi.fn(
      () =>
        new Promise<GraphBuildWorkerResult>((resolve) => {
          finishBuild = resolve;
        })
    );

    const service = new GraphService({ build });

    const p1 = service.load(whiteIdentity, whiteGames);
    const p2 = service.load(whiteIdentity, whiteGames);

    expect(build).toHaveBeenCalledTimes(1);

    finishBuild(makeMockResult('white'));
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe(r2);
  });

  it('evicts oldest entries when entry limit is exceeded', async () => {
    const build = vi.fn(async () => makeMockResult('white'));
    const service = new GraphService({ build, maxMemoryEntries: 2 });

    const id1 = { ...whiteIdentity, datasetRevision: 'rev-1' };
    const id2 = { ...whiteIdentity, datasetRevision: 'rev-2' };
    const id3 = { ...whiteIdentity, datasetRevision: 'rev-3' };

    await service.load(id1, whiteGames); // stored (1)
    await service.load(id2, whiteGames); // stored (2)
    await service.load(id3, whiteGames); // stored (3), id1 evicted!

    expect(build).toHaveBeenCalledTimes(3);

    // id2 should still be in cache (hit)
    await service.load(id2, whiteGames);
    expect(build).toHaveBeenCalledTimes(3);

    // id1 was evicted, should be a miss (call 4)
    await service.load(id1, whiteGames);
    expect(build).toHaveBeenCalledTimes(4);
  });

  it('clears memory cache on clearMemory() and deleteUser()', async () => {
    const build = vi.fn(async () => makeMockResult('white'));
    const service = new GraphService({ build });

    await service.load(whiteIdentity, whiteGames);
    expect(build).toHaveBeenCalledTimes(1);

    service.clearMemory();
    await service.load(whiteIdentity, whiteGames);
    expect(build).toHaveBeenCalledTimes(2);

    await service.deleteUser('janedoe');
    await service.load(whiteIdentity, whiteGames);
    expect(build).toHaveBeenCalledTimes(3);
  });

  it('persists opening snapshots to IndexedDB and reuses them after clearMemory()', async () => {
    indexedDB.deleteDatabase(DB_NAME);
    const db = await openDatabase();
    try {
      const month = '2026-08';
      await putNormalizedMonth(
        db,
        makeNormalizedMonth({ username: whiteIdentity.username, month })
      );

      const build = vi.fn(async (_games, _options, fingerprint) => {
        const result = makeMockResult('white');
        result.snapshot.queryFingerprint = fingerprint;
        return result;
      });
      const service = new GraphService({ build, getDb: async () => db });

      await service.load(whiteIdentity, whiteGames);
      service.clearMemory();
      await service.load(whiteIdentity, whiteGames);
      expect(build).toHaveBeenCalledTimes(1);

      await service.deleteUser(whiteIdentity.username);
      await expect(readNormalizedMonth(db, whiteIdentity.username, month)).resolves.toBeNull();
    } finally {
      closeDatabase(db);
    }
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

it.each(['user', 'all'] as const)(
  'R04: %s deletion invalidates delayed DB acquisition through the real shared adapters',
  async (kind) => {
    const { OpeningDataWorkerClient } = await import(
      '@/features/opening-tree/openingDataWorkerClient'
    );
    const { GraphWorkerClient } = await import('@/features/opening-tree/graphWorkerClient');
    const { handleRequest } = await import('@/workers/analysis-data.worker');
    const { isWorkerRequest } = await import('@/workers/protocol');
    const { getGraphSnapshot } = await import('@/lib/db/repositories');
    const { graphCacheKey } = await import('@/features/opening-tree/graphIdentity');
    const { clearAllData } = await import('@/lib/db/deleteLocalData');
    class WorkerAdapter extends EventTarget {
      postMessage(request: unknown) {
        if (isWorkerRequest(request))
          void handleRequest(request, (data) =>
            this.dispatchEvent(new MessageEvent('message', { data }))
          );
      }
      terminate() {}
    }
    const db = await openDatabase();
    const gate = deferred<IDBDatabase>();
    const identity = createGraphCacheIdentity({
      username: 'race-player',
      query: { username: 'race-player', timeClasses: ['blitz'], colors: ['white'], maxGames: 1 },
      scope: 'white',
      horizon: 10,
      datasetRevision: `race-${kind}`,
    });
    const shared = new OpeningDataWorkerClient(() => new WorkerAdapter() as unknown as Worker);
    let reads = 0;
    const service = new GraphService({
      workerClient: new GraphWorkerClient(shared),
      getDb: () => (++reads === 1 ? gate.promise : Promise.resolve(db)),
    });
    try {
      const loading = service.load(identity, [toNormalizedSummary(makeGameRecord())]);
      const rejected = expect(loading).rejects.toThrow('GRAPH_BUILD_CANCELLED');
      service.cancel();
      if (kind === 'user') await service.deleteUser(identity.username);
      else {
        service.clearMemory();
        await service.drain();
        await clearAllData(db);
      }
      gate.resolve(db);
      await rejected;
      expect(await getGraphSnapshot(db, graphCacheKey(identity))).toBeNull();
      // A subsequent request must build fresh rather than hit resurrected memory.
      const spy = vi.spyOn(shared, 'build');
      await service.load(identity, [toNormalizedSummary(makeGameRecord())]);
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      service.dispose();
      shared.dispose();
      closeDatabase(db);
    }
  }
);

it.each(['user', 'all'] as const)(
  'R04: %s deletion prevents a late completed build from installing memory or disk',
  async (kind) => {
    const { getGraphSnapshot } = await import('@/lib/db/repositories');
    const { graphCacheKey } = await import('@/features/opening-tree/graphIdentity');
    const { clearAllData } = await import('@/lib/db/deleteLocalData');
    const db = await openDatabase();
    const gate = deferred<GraphBuildWorkerResult>();
    const build = vi.fn(() => gate.promise);
    const identity = createGraphCacheIdentity({
      username: 'late-player',
      query: { username: 'late-player', timeClasses: ['blitz'], colors: ['white'], maxGames: 1 },
      scope: 'white',
      horizon: 10,
      datasetRevision: `late-${kind}`,
    });
    const service = new GraphService({ build, getDb: async () => db });
    try {
      const loading = service.load(identity, []);
      const rejected = expect(loading).rejects.toThrow('GRAPH_BUILD_CANCELLED');
      await vi.waitFor(() => expect(build).toHaveBeenCalledOnce());
      if (kind === 'user') await service.deleteUser(identity.username);
      else {
        service.clearMemory();
        await service.drain();
        await clearAllData(db);
      }
      gate.resolve(makeMockResult('white'));
      await rejected;
      expect(await getGraphSnapshot(db, graphCacheKey(identity))).toBeNull();
      await service.load(identity, []);
      expect(build).toHaveBeenCalledTimes(2);
    } finally {
      service.dispose();
      closeDatabase(db);
    }
  }
);

it('R10: partial result diagnostics and status survive a disk hit', async () => {
  const db = await openDatabase();
  const identity = createGraphCacheIdentity({
    username: 'partial-player',
    query: { username: 'partial-player', timeClasses: ['blitz'], colors: ['white'], maxGames: 2 },
    scope: 'white',
    horizon: 10,
    datasetRevision: 'partial-revision',
  });
  const original = makeMockResult('white');
  const partial: GraphBuildWorkerResult = {
    status: 'partial',
    excludedGameCount: 1,
    diagnosticCodes: ['ILLEGAL_PGN'],
    snapshot: {
      ...original.snapshot,
      queryFingerprint: identity.datasetRevision,
      sourceGameCount: 2,
      excludedGameCount: 1,
    },
  };
  const build = vi.fn(async () => partial);
  const service = new GraphService({ build, getDb: async () => db });
  try {
    await service.load(identity, []);
    service.clearMemory();
    const hit = await service.load(identity, []);
    expect(build).toHaveBeenCalledOnce();
    expect(hit).toMatchObject({
      status: 'partial',
      diagnosticCodes: ['ILLEGAL_PGN'],
      excludedGameCount: 1,
    });
  } finally {
    service.dispose();
    closeDatabase(db);
  }
});

it.each(['structural', 'bytes'] as const)(
  'R13: encoded %s limits reach the real worker and produce a limited graph',
  async (policy) => {
    const { handleRequest } = await import('@/workers/analysis-data.worker');
    const { PROTOCOL_VERSION } = await import('@/workers/protocol');
    const build: NonNullable<
      import('@/features/opening-tree/graphService').GraphServiceDependencies['build']
    > = async (games, options, queryFingerprint) => {
      let result!: GraphBuildWorkerResult;
      await handleRequest(
        {
          type: 'BUILD_GRAPH',
          protocolVersion: PROTOCOL_VERSION,
          jobId: crypto.randomUUID(),
          games,
          options,
          queryFingerprint,
        },
        (response) => {
          if (response.type === 'LIMITED') result = { ...response, status: 'limited' };
          else if (response.type === 'COMPLETE') result = { ...response, status: 'complete' };
        }
      );
      return result;
    };
    const identity = createGraphCacheIdentity({
      username: 'limit-player',
      query: { username: 'limit-player', timeClasses: ['blitz'], colors: ['white'], maxGames: 1 },
      scope: 'white',
      horizon: 10,
      datasetRevision: 'limit-revision',
      limits: policy === 'structural' ? { maxPositions: 1 } : { maxBytes: 2000 },
    });
    const service = new GraphService({ build });
    const result = await service.load(identity, [toNormalizedSummary(makeGameRecord())]);
    expect(result.status).toBe('limited');
    if (policy === 'structural') expect(result.snapshot.positions).toHaveLength(1);
    const { serializedGraphByteSize } = await import('@/lib/chess/graph/serialization');
    expect(serializedGraphByteSize(result.snapshot)).toBeLessThanOrEqual(identity.limits.maxBytes);
    expect(result.snapshot.includedGameCount).toBe(0);
    expect(result.snapshot.reachedLimit).toBe(
      policy === 'structural' ? 'maxPositions' : 'maxSnapshotBytes'
    );
  }
);
