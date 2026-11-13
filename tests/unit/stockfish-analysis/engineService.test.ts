import { describe, expect, it, vi } from 'vitest';

import { EngineService, type WorkerLike } from '@/features/stockfish-analysis/engineService';
import type { EngineWorkerRequest } from '@/workers/stockfish.protocol';

class FakeWorker implements WorkerLike {
  readonly messages: EngineWorkerRequest[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Set<EventListener>>();

  constructor(private readonly initializeSucceeds: boolean | null) {}

  postMessage(message: EngineWorkerRequest): void {
    this.messages.push(message);
    if (message.type === 'INITIALIZE' && this.initializeSucceeds !== null) {
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
  emit(type: 'message' | 'error', event: Event): void {
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
  it('shares concurrent initialization and owns a pending worker on dispose', async () => {
    const worker = new FakeWorker(null);
    const createWorker = vi.fn(() => worker);
    const service = new EngineService({
      createWorker,
      capabilityProbe: { crossOriginIsolated: false },
    });
    const first = service.initialize();
    const second = service.initialize();
    expect(createWorker).toHaveBeenCalledTimes(1);
    service.dispose();
    expect(worker.terminated).toBe(true);
    await Promise.allSettled([first, second]);
    expect(createWorker).toHaveBeenCalledTimes(1);
  });

  it('retries failed initialization with one fresh working worker', async () => {
    const workers: FakeWorker[] = [];
    const service = new EngineService({
      capabilityProbe: { crossOriginIsolated: false },
      createWorker: () => {
        const worker = new FakeWorker(workers.length > 0);
        workers.push(worker);
        return worker;
      },
    });
    expect((await service.initialize()).mode).toBe('unavailable');
    expect((await service.retryInitialize()).mode).toBe('single-thread');
    expect(workers[0]!.terminated).toBe(true);
    service.dispose();
    expect(workers[1]!.terminated).toBe(true);
  });

  it('bounds each mode to fifteen seconds and cleans persistent failure', async () => {
    vi.useFakeTimers();
    try {
      const workers: FakeWorker[] = [];
      const service = new EngineService({
        capabilityProbe,
        createWorker: () => {
          const worker = new FakeWorker(null);
          workers.push(worker);
          return worker;
        },
      });
      const pending = service.initialize();
      await vi.advanceTimersByTimeAsync(15_000);
      expect(workers).toHaveLength(2);
      expect(workers[0]!.terminated).toBe(true);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(await pending).toMatchObject({
        mode: 'unavailable',
        reason: expect.stringMatching(/timed out/i),
      });
      expect(workers.every((worker) => worker.terminated)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      service.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('retires pending initialization on retry and ignores its late READY', async () => {
    const workers = [new FakeWorker(null), new FakeWorker(true)];
    const service = new EngineService({
      capabilityProbe: { crossOriginIsolated: false },
      createWorker: () => workers.shift()!,
    });
    const oldWorker = workers[0]!;
    const old = service.initialize();
    const retried = service.retryInitialize();
    await Promise.allSettled([old]);
    expect(await retried).toMatchObject({ mode: 'single-thread' });
    expect(oldWorker.terminated).toBe(true);
    oldWorker.emit(
      'message',
      new MessageEvent('message', {
        data: { protocolVersion: 1, type: 'READY', jobId: oldWorker.messages[0]!.jobId },
      })
    );
    expect(await service.initialize()).toMatchObject({ mode: 'single-thread' });
    service.dispose();
  });

  it('shares repeated retries and cleans up another failed attempt', async () => {
    const workers: FakeWorker[] = [];
    const service = new EngineService({
      capabilityProbe: { crossOriginIsolated: false },
      createWorker: () => {
        const worker = new FakeWorker(false);
        workers.push(worker);
        return worker;
      },
    });
    expect((await service.initialize()).mode).toBe('unavailable');
    const results = await Promise.all([service.retryInitialize(), service.retryInitialize()]);
    expect(results.every((result) => result.mode === 'unavailable')).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers.every((worker) => worker.terminated)).toBe(true);
    service.dispose();
  });

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
