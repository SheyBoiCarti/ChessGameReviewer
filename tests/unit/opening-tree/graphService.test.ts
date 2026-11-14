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
});
