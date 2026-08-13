import { describe, expect, it } from 'vitest';

import { EngineService, type WorkerLike } from '@/features/stockfish-analysis/engineService';
import type { EngineWorkerRequest } from '@/workers/stockfish.protocol';

class FakeWorker implements WorkerLike {
  readonly messages: EngineWorkerRequest[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Set<EventListener>>();

  constructor(private readonly initializeSucceeds: boolean) {}

  postMessage(message: EngineWorkerRequest): void {
    this.messages.push(message);
    if (message.type === 'INITIALIZE') {
      queueMicrotask(() =>
        this.emit(
          'message',
          new MessageEvent('message', {
            data: this.initializeSucceeds
              ? { protocolVersion: 1, type: 'READY', jobId: message.jobId }
              : {
                  protocolVersion: 1,
                  type: 'FAILED',
                  jobId: message.jobId,
                  message: 'startup failed',
                },
          })
        )
      );
    }
    if (message.type === 'EVALUATE') {
      queueMicrotask(() =>
        this.emit(
          'message',
          new MessageEvent('message', {
            data: {
              protocolVersion: 1,
              type: 'RESULT',
              jobId: message.jobId,
              result: {
                bestMove: 'e2e4',
                lines: [{ multiPv: 1, depth: 4, score: { kind: 'cp', value: 18 }, pv: ['e2e4'] }],
              },
            },
          })
        )
      );
    }
  }

  terminate(): void {
    this.terminated = true;
  }
  addEventListener(type: 'message' | 'error', listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type: 'message' | 'error', listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }
  private emit(type: 'message' | 'error', event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const capabilityProbe = {
  crossOriginIsolated: true,
  sharedArrayBuffer: true,
  simd: true,
  hardwareConcurrency: 4,
};

describe('EngineService', () => {
  it('rejects evaluation before initialization', async () => {
    const service = new EngineService({ createWorker: () => new FakeWorker(true) });
    await expect(
      service.evaluate({
        id: 'before-init',
        priority: 1,
        relevanceToken: 'board',
        deadlineAt: Date.now() + 1_000,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        limit: { depth: 4 },
        multiPv: 1,
      })
    ).rejects.toThrow('has not initialized');
  });

  it('uses the threaded worker and returns its scheduled evaluation', async () => {
    const worker = new FakeWorker(true);
    const service = new EngineService({ createWorker: () => worker, capabilityProbe });
    await expect(service.initialize()).resolves.toMatchObject({ mode: 'threaded' });
    await expect(
      service.evaluate({
        id: 'evaluate',
        priority: 1,
        relevanceToken: 'board',
        deadlineAt: Date.now() + 1_000,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        limit: { depth: 4 },
        multiPv: 1,
      })
    ).resolves.toMatchObject({ bestMove: 'e2e4' });
    expect(worker.messages[0]).toMatchObject({ type: 'INITIALIZE', mode: 'threaded' });
    service.dispose();
    expect(worker.terminated).toBe(true);
  });

  it('falls back to a single-thread worker when threaded startup fails', async () => {
    const workers = [new FakeWorker(false), new FakeWorker(true)];
    const service = new EngineService({
      createWorker: () => workers.shift()!,
      capabilityProbe,
    });
    await expect(service.initialize()).resolves.toMatchObject({ mode: 'single-thread' });
    expect(workers).toHaveLength(0);
  });

  it('starts single-thread mode directly when the browser cannot use pthreads', async () => {
    const worker = new FakeWorker(true);
    const service = new EngineService({
      createWorker: () => worker,
      capabilityProbe: { crossOriginIsolated: false, sharedArrayBuffer: true, simd: true },
    });
    await expect(service.initialize()).resolves.toMatchObject({ mode: 'single-thread' });
    expect(worker.messages).toHaveLength(1);
    expect(worker.messages[0]).toMatchObject({ type: 'INITIALIZE', mode: 'single-thread' });
    await expect(service.initialize()).resolves.toMatchObject({ mode: 'single-thread' });
  });

  it('returns an unavailable capability with the worker failure reason', async () => {
    const workers = [new FakeWorker(false), new FakeWorker(false)];
    const service = new EngineService({
      createWorker: () => workers.shift()!,
      capabilityProbe,
    });
    await expect(service.initialize()).resolves.toMatchObject({
      mode: 'unavailable',
      reason: 'startup failed',
    });
  });
});
