import { describe, expect, it, vi } from 'vitest';
import { GraphWorkerClient } from '@/features/opening-tree/graphWorkerClient';
import { OpeningDataWorkerClient } from '@/features/opening-tree/openingDataWorkerClient';
import { handleRequest } from '@/workers/analysis-data.worker';
import { isWorkerRequest, PROTOCOL_VERSION } from '@/workers/protocol';
import * as pgnParserModule from '@/lib/chess/pgnParser';
import type { GameRecord } from '@/lib/db/schema';

class DelegatingWorker extends EventTarget {
  readonly messages: unknown[] = [];
  terminated = false;
  postMessage(data: unknown) {
    this.messages.push(data);
    if (isWorkerRequest(data)) {
      void handleRequest(data, (response) => {
        this.dispatchEvent(new MessageEvent('message', { data: response }));
      });
    }
  }
  terminate() {
    this.terminated = true;
  }
}

function makeGameRecord(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: 'game-1',
    username: 'alice',
    url: 'https://example.test/game-1',
    userColor: 'white',
    result: 'win',
    endedAt: 1,
    timeClass: 'blitz',
    rated: true,
    userRating: 1500,
    opponentRating: 1400,
    whitePlayer: { username: 'alice', rating: 1500 },
    blackPlayer: { username: 'bob', rating: 1400 },
    pgn: '1. e4 e5 1-0',
    rules: 'chess',
    ...overrides,
  };
}

class FakeWorker extends EventTarget {
  readonly messages: unknown[] = [];
  postMessage(message: unknown) {
    this.messages.push(message);
  }
  terminate() {}
  emit(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

describe('GraphWorkerClient', () => {
  it('rejects an ambiguous snapshot request before posting work', async () => {
    const worker = new FakeWorker() as unknown as Worker;
    const client = new GraphWorkerClient(worker);

    await expect(
      client.build([], { maxOpeningPlies: 30, includeRepeatedPositions: true }, '')
    ).rejects.toThrow('MISSING_QUERY_FINGERPRINT');
    expect((worker as unknown as FakeWorker).messages).toEqual([]);
  });

  it('settles only the active job and ignores stale completion', async () => {
    const worker = new FakeWorker() as unknown as Worker;
    const client = new GraphWorkerClient(worker);
    const build = client.build(
      [],
      { maxOpeningPlies: 30, includeRepeatedPositions: true },
      'query'
    );
    const request = (worker as unknown as FakeWorker).messages[0] as { jobId: string };
    (worker as unknown as FakeWorker).emit({
      protocolVersion: PROTOCOL_VERSION,
      jobId: 'stale',
      type: 'COMPLETE',
      snapshot: {},
    });
    (worker as unknown as FakeWorker).emit({
      protocolVersion: PROTOCOL_VERSION,
      jobId: request.jobId,
      type: 'COMPLETE',
      snapshot: { formatVersion: 2 },
    });
    await expect(build).resolves.toMatchObject({ status: 'complete' });
  });

  it('settles limited, cancelled, and worker-error jobs exactly once', async () => {
    const worker = new FakeWorker() as unknown as Worker;
    const client = new GraphWorkerClient(worker);
    const limited = client.build(
      [],
      { maxOpeningPlies: 30, includeRepeatedPositions: true },
      'query'
    );
    const limitedRequest = (worker as unknown as FakeWorker).messages.at(-1) as { jobId: string };
    (worker as unknown as FakeWorker).emit({
      protocolVersion: PROTOCOL_VERSION,
      jobId: limitedRequest.jobId,
      type: 'LIMITED',
      snapshot: {},
      reachedLimit: 'maxEdges',
      includedGameCount: 1,
      remainingGameCount: 2,
      excludedGameCount: 1,
      diagnosticCodes: ['ILLEGAL_PGN'],
    });
    await expect(limited).resolves.toMatchObject({
      status: 'limited',
      reachedLimit: 'maxEdges',
      excludedGameCount: 1,
      diagnosticCodes: ['ILLEGAL_PGN'],
    });

    const cancelled = client.build(
      [],
      { maxOpeningPlies: 30, includeRepeatedPositions: true },
      'query'
    );
    client.cancel();
    await expect(cancelled).rejects.toThrow('GRAPH_BUILD_CANCELLED');

    const failed = client.build(
      [],
      { maxOpeningPlies: 30, includeRepeatedPositions: true },
      'query'
    );
    (worker as unknown as FakeWorker).dispatchEvent(new Event('error'));
    await expect(failed).rejects.toThrow('GRAPH_WORKER_FAILED');
    client.dispose();
  });

  it('settles a defensive partial response with exclusion metadata', async () => {
    const worker = new FakeWorker() as unknown as Worker;
    const client = new GraphWorkerClient(worker);
    const build = client.build(
      [],
      { maxOpeningPlies: 30, includeRepeatedPositions: true },
      'partial-query'
    );
    const request = (worker as unknown as FakeWorker).messages.at(-1) as { jobId: string };
    (worker as unknown as FakeWorker).emit({
      protocolVersion: PROTOCOL_VERSION,
      jobId: request.jobId,
      type: 'PARTIAL',
      snapshot: {},
      excludedGameCount: 2,
      diagnosticCodes: ['MISSING_PGN', 'ILLEGAL_PGN'],
    });

    await expect(build).resolves.toMatchObject({
      status: 'partial',
      excludedGameCount: 2,
      diagnosticCodes: ['MISSING_PGN', 'ILLEGAL_PGN'],
    });
  });

  it('shares parsed projections between validation and graph jobs (T46)', async () => {
    const parseSpy = vi.spyOn(pgnParserModule, 'parseGamePgn');
    const worker = new DelegatingWorker();
    const shared = new OpeningDataWorkerClient(() => worker as unknown as Worker);
    const games = [
      makeGameRecord({ id: 'game-1', pgn: '1. e4 e5 1-0' }),
      makeGameRecord({ id: 'game-2', pgn: '1. d4 d5 1-0' }),
    ];
    const firstSignal = new AbortController().signal;
    const options = { maxOpeningPlies: 30, includeRepeatedPositions: true };
    const fingerprint = 'shared-query';

    try {
      await shared.validate(games, firstSignal);
      await shared.build(games, options, fingerprint);
      expect(parseSpy).toHaveBeenCalledTimes(games.length);
      shared.dispose();
      expect(worker.terminated).toBe(true);
    } finally {
      parseSpy.mockRestore();
    }
  });
});

it('R03: changed PGN and metadata never reuse stale projection moves or aggregates', async () => {
  const worker = new DelegatingWorker();
  const shared = new OpeningDataWorkerClient(() => worker as unknown as Worker);
  const original = makeGameRecord();
  const options = { maxOpeningPlies: 30, includeRepeatedPositions: false };
  await shared.validate([original]);
  const changed = {
    ...original,
    pgn: '1. d4 d5 1/2-1/2',
    result: 'draw' as const,
    opponentRating: 2200,
  };
  const graph = await shared.build([changed], options, 'changed');
  const root = graph.snapshot.positions.find((p) => p.key === graph.snapshot.rootKey)!;
  expect(root.edges.map((e) => e.uci)).toEqual(['d2d4']);
  expect(root.aggregate).toMatchObject({ draws: 1, userWins: 0, opponentRatingSum: 2200 });
  const metadata = await shared.build(
    [{ ...original, result: 'loss', opponentRating: 2300 }],
    options,
    'metadata'
  );
  expect(
    metadata.snapshot.positions.find((p) => p.key === metadata.snapshot.rootKey)!.aggregate
  ).toMatchObject({ userLosses: 1, opponentRatingSum: 2300 });
  shared.dispose();
});

it('R07: graph cancellation and disposal leave independent shared validation alive', async () => {
  const worker = new FakeWorker();
  const shared = new OpeningDataWorkerClient(worker as unknown as Worker);
  const graph = new GraphWorkerClient(shared);
  const validation = shared.validate([makeGameRecord()]);
  const request = worker.messages[0] as { jobId: string };
  graph.cancel();
  graph.dispose();
  expect(worker.messages).toHaveLength(1);
  worker.emit({
    protocolVersion: PROTOCOL_VERSION,
    jobId: request.jobId,
    type: 'PGN_VALIDATION_COMPLETE',
    validGameIds: ['game-1'],
    projections: [],
    diagnostics: [],
    totalInvalid: 0,
    diagnosticCodes: [],
  });
  await expect(validation).resolves.toMatchObject({ validGameIds: ['game-1'] });
  shared.dispose();
});

it('R08: retained projections survive restart and more records than the worker LRU', async () => {
  const { clearParsedCache } = await import('@/workers/analysis-data.worker');
  clearParsedCache();
  const first = new OpeningDataWorkerClient(() => new DelegatingWorker() as unknown as Worker);
  const games = Array.from({ length: 1002 }, (_, i) => makeGameRecord({ id: `retained-${i}` }));
  const validated = await first.validate(games);
  expect(validated.projections).toHaveLength(games.length);
  first.dispose();
  clearParsedCache();
  const spy = vi.spyOn(pgnParserModule, 'parseGamePgn');
  const { toNormalizedSummary } = await import('@/features/workspace/createWorkspaceController');
  const restarted = new OpeningDataWorkerClient(() => new DelegatingWorker() as unknown as Worker);
  try {
    const result = await restarted.build(
      games.map((g, i) =>
        toNormalizedSummary({ ...g, openingProjection: validated.projections![i]! })
      ),
      { maxOpeningPlies: 30, includeRepeatedPositions: false },
      'restart'
    );
    expect(result.snapshot.includedGameCount).toBe(games.length);
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
    restarted.dispose();
    clearParsedCache();
  }
});

it('R07: cancelling an owned graph build does not settle a concurrent validation job', async () => {
  const worker = new FakeWorker();
  const shared = new OpeningDataWorkerClient(worker as unknown as Worker);
  const graph = new GraphWorkerClient(shared);
  const validation = shared.validate([makeGameRecord()]);
  const validationRequest = worker.messages[0] as { jobId: string };
  const building = graph.build(
    [],
    { maxOpeningPlies: 30, includeRepeatedPositions: false },
    'owned'
  );
  const rejected = expect(building).rejects.toThrow('GRAPH_BUILD_CANCELLED');
  await vi.waitFor(() => expect(worker.messages).toHaveLength(2));
  graph.cancel();
  await rejected;
  expect(worker.messages.at(-1)).toMatchObject({ type: 'CANCEL_JOB' });
  expect((worker.messages.at(-1) as { jobId: string }).jobId).not.toBe(validationRequest.jobId);
  worker.emit({
    protocolVersion: PROTOCOL_VERSION,
    jobId: validationRequest.jobId,
    type: 'PGN_VALIDATION_COMPLETE',
    validGameIds: ['game-1'],
    projections: [],
    diagnostics: [],
    totalInvalid: 0,
    diagnosticCodes: [],
  });
  await expect(validation).resolves.toMatchObject({ validGameIds: ['game-1'] });
  shared.dispose();
});

it('R07: a worker error settles pending jobs and the next request creates a fresh worker', async () => {
  const workers = [new FakeWorker(), new FakeWorker()];
  let created = 0;
  const factory = vi.fn((): Worker => workers[created++] as unknown as Worker);
  const shared = new OpeningDataWorkerClient(factory);
  const first = shared.validate([makeGameRecord()]);
  const failed = expect(first).rejects.toThrow('OPENING_DATA_WORKER_FAILED');
  workers[0]!.dispatchEvent(new Event('error'));
  await failed;
  const retry = shared.validate([makeGameRecord()]);
  expect(factory).toHaveBeenCalledTimes(2);
  const request = workers[1]!.messages[0] as { jobId: string };
  workers[1]!.emit({
    protocolVersion: PROTOCOL_VERSION,
    jobId: request.jobId,
    type: 'PGN_VALIDATION_COMPLETE',
    validGameIds: ['game-1'],
    projections: [],
    diagnostics: [],
    totalInvalid: 0,
    diagnosticCodes: [],
  });
  await expect(retry).resolves.toMatchObject({ validGameIds: ['game-1'] });
  shared.dispose();
});

it('R07: a supplied Worker that crashes rejects subsequent work instead of reusing the dead instance', async () => {
  const worker = new FakeWorker();
  const shared = new OpeningDataWorkerClient(worker as unknown as Worker);
  const validation = shared.validate([makeGameRecord()]);
  const failed = expect(validation).rejects.toThrow('OPENING_DATA_WORKER_FAILED');
  worker.dispatchEvent(new Event('error'));
  await failed;
  const retry = shared.validate([makeGameRecord()]);
  // A supplied Worker cannot be recreated; callers must provide a factory or a new client.
  shared.dispose();
  await expect(retry).rejects.toThrow('OPENING_DATA_WORKER_FAILED');
});
