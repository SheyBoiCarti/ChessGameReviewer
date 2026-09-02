import { describe, expect, it } from 'vitest';

import { PgnValidationWorkerClient } from '@/features/ingestion/pgnValidationWorkerClient';
import type { GameRecord } from '@/lib/db/schema';
import { PROTOCOL_VERSION } from '@/workers/protocol';

class FakeWorker extends EventTarget {
  readonly messages: Array<Record<string, unknown>> = [];
  terminated = false;

  postMessage(message: Record<string, unknown>): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emitMessage(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}

class TrackedSignal extends EventTarget {
  aborted = false;
  listenerCount = 0;

  override addEventListener(...args: Parameters<EventTarget['addEventListener']>): void {
    this.listenerCount += 1;
    super.addEventListener(...args);
  }

  override removeEventListener(...args: Parameters<EventTarget['removeEventListener']>): void {
    this.listenerCount -= 1;
    super.removeEventListener(...args);
  }

  abort(): void {
    this.aborted = true;
    this.dispatchEvent(new Event('abort'));
  }
}

function game(overrides: Partial<GameRecord> = {}): GameRecord {
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

describe('PgnValidationWorkerClient', () => {
  it('maps a game record and resolves the active validation response', async () => {
    const worker = new FakeWorker();
    const client = new PgnValidationWorkerClient(() => worker as unknown as Worker);
    const validation = client.validate([game()], new AbortController().signal);
    const request = worker.messages[0]!;

    expect(request).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      type: 'VALIDATE_PGNS',
      games: [expect.objectContaining({ id: 'game-1', usernameKey: 'alice' })],
    });
    worker.emitMessage({
      protocolVersion: PROTOCOL_VERSION,
      jobId: request.jobId,
      type: 'PGN_VALIDATION_COMPLETE',
      validGameIds: ['game-1'],
      diagnostics: [],
      totalInvalid: 0,
      diagnosticCodes: [],
    });

    await expect(validation).resolves.toMatchObject({ validGameIds: ['game-1'] });
  });

  it('aborts superseded work, replaces its worker, and ignores stale responses', async () => {
    const workers: FakeWorker[] = [];
    const client = new PgnValidationWorkerClient(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    const first = client.validate([game()], new AbortController().signal);
    const firstRequest = workers[0]!.messages[0]!;
    const second = client.validate([game({ id: 'game-2' })], new AbortController().signal);

    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers[0]!.messages.at(-1)).toMatchObject({
      type: 'CANCEL_JOB',
      jobId: firstRequest.jobId,
    });
    expect(workers[0]!.terminated).toBe(true);
    workers[0]!.emitMessage({
      protocolVersion: PROTOCOL_VERSION,
      jobId: firstRequest.jobId,
      type: 'PGN_VALIDATION_COMPLETE',
      validGameIds: ['game-1'],
      diagnostics: [],
      totalInvalid: 0,
      diagnosticCodes: [],
    });
    const secondRequest = workers[1]!.messages[0]!;
    workers[1]!.emitMessage({
      protocolVersion: PROTOCOL_VERSION,
      jobId: secondRequest.jobId,
      type: 'PGN_VALIDATION_COMPLETE',
      validGameIds: ['game-2'],
      diagnostics: [],
      totalInvalid: 0,
      diagnosticCodes: [],
    });
    await expect(second).resolves.toMatchObject({ validGameIds: ['game-2'] });
  });

  it('cancels on caller abort, rejects with AbortError, and removes the abort listener', async () => {
    const worker = new FakeWorker();
    const signal = new TrackedSignal();
    const client = new PgnValidationWorkerClient(() => worker as unknown as Worker);
    const validation = client.validate([game()], signal as unknown as AbortSignal);
    const request = worker.messages[0]!;
    expect(signal.listenerCount).toBe(1);

    signal.abort();

    await expect(validation).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.messages.at(-1)).toMatchObject({ type: 'CANCEL_JOB', jobId: request.jobId });
    expect(signal.listenerCount).toBe(0);
  });

  it('contains worker failures and makes disposal terminal', async () => {
    const worker = new FakeWorker();
    const client = new PgnValidationWorkerClient(() => worker as unknown as Worker);
    const validation = client.validate([game()], new AbortController().signal);
    worker.dispatchEvent(new Event('error'));
    await expect(validation).rejects.toThrow('PGN_VALIDATION_WORKER_FAILED');

    const pending = client.validate([game()], new AbortController().signal);
    client.dispose();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await expect(
      client.validate([game()], new AbortController().signal)
    ).rejects.toThrow('PGN_VALIDATION_CLIENT_DISPOSED');
  });
});
