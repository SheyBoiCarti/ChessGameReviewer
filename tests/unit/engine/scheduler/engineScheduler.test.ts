import { describe, expect, it } from 'vitest';

import { EngineScheduler } from '../../../../lib/engine/scheduler/engineScheduler';
import type { ScheduledEngineAdapter } from '../../../../lib/engine/scheduler/types';

class DeferredAdapter implements ScheduledEngineAdapter {
  readonly calls: string[] = [];
  readonly pending = new Map<
    string,
    { resolve: (value: string) => void; reject: (reason: Error) => void }
  >();
  async initialize(): Promise<void> {}
  evaluate(job: { id: string }): Promise<string> {
    this.calls.push(job.id);
    return new Promise((resolve, reject) => this.pending.set(job.id, { resolve, reject }));
  }
  async stop(): Promise<void> {
    this.calls.push('stop');
  }
  dispose(): void {
    this.calls.push('dispose');
  }
  finish(id: string): void {
    this.pending.get(id)?.resolve(id);
  }
}

const job = (id: string, priority: 1 | 2 | 3, relevanceToken = id) => ({
  id,
  priority,
  relevanceToken,
  createdAt: 0,
  deadlineAt: Date.now() + 10_000,
  payload: { id },
});

describe('EngineScheduler', () => {
  it('runs higher priority work first while retaining FIFO order within a priority', async () => {
    const adapter = new DeferredAdapter();
    const scheduler = new EngineScheduler(adapter);
    const first = scheduler.schedule(job('batch-1', 2));
    const second = scheduler.schedule(job('batch-2', 2));
    const interactive = scheduler.schedule(job('interactive', 1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(adapter.calls).toEqual(['batch-1', 'stop']);
    adapter.finish('batch-1');
    await Promise.resolve();
    expect(adapter.calls).toEqual(['batch-1', 'stop', 'interactive']);
    adapter.finish('interactive');
    await interactive;
    await Promise.resolve();
    expect(adapter.calls).toEqual(['batch-1', 'stop', 'interactive', 'batch-1']);
    adapter.finish('batch-1');
    await first;
    await Promise.resolve();
    expect(adapter.calls).toEqual(['batch-1', 'stop', 'interactive', 'batch-1', 'batch-2']);
    adapter.finish('batch-2');
    await expect(second).resolves.toBe('batch-2');
  });

  it('supersedes queued interactive jobs for the same view', async () => {
    const adapter = new DeferredAdapter();
    const scheduler = new EngineScheduler(adapter);
    const batch = scheduler.schedule(job('batch', 2));
    const old = scheduler.schedule(job('old', 1, 'board'));
    const current = scheduler.schedule(job('current', 1, 'board'));
    await expect(old).rejects.toMatchObject({ name: 'AbortError' });
    adapter.finish('batch');
    await Promise.resolve();
    expect(adapter.calls).toContain('current');
    adapter.finish('current');
    await expect(current).resolves.toBe('current');
    await Promise.resolve();
    adapter.finish('batch');
    await batch;
  });

  it('preempts active batch work for interactive work and retries a safe crash once', async () => {
    const adapter = new DeferredAdapter();
    const scheduler = new EngineScheduler(adapter, { createAdapter: () => adapter });
    const batch = scheduler.schedule(job('batch', 2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const interactive = scheduler.schedule(job('interactive', 1));
    await Promise.resolve();
    expect(adapter.calls).toEqual(['batch', 'stop']);
    adapter.finish('batch');
    await Promise.resolve();
    expect(adapter.calls).toContain('interactive');
    adapter.pending.get('interactive')?.reject(new Error('worker crash'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(adapter.calls.filter((call) => call === 'interactive')).toHaveLength(2);
    adapter.finish('interactive');
    await expect(interactive).resolves.toBe('interactive');
    adapter.finish('batch');
    await expect(batch).resolves.toBe('batch');
  });

  it('rejects active and queued jobs when disposed without leaking the engine', async () => {
    const adapter = new DeferredAdapter();
    const scheduler = new EngineScheduler(adapter);
    const active = scheduler.schedule(job('active', 2));
    const queued = scheduler.schedule(job('queued', 2));
    await Promise.resolve();
    const activeExpectation = expect(active).rejects.toMatchObject({ name: 'AbortError' });
    const queuedExpectation = expect(queued).rejects.toMatchObject({ code: 'ENGINE_DISPOSED' });
    scheduler.dispose();
    await activeExpectation;
    await queuedExpectation;
    expect(adapter.calls).toContain('dispose');
  });
});
