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
