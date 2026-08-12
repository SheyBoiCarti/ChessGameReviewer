import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JobQueue } from '../../../lib/ingestion/jobQueue';
import { createPubApiError } from '../../../lib/api/errors';

describe('JobQueue Serialization, Deduplication & Cancellation', () => {
  let queue: JobQueue;

  beforeEach(() => {
    queue = new JobQueue();
  });

  it('serializes requests for distinct users serially', async () => {
    const executionOrder: string[] = [];

    const task1 = vi.fn().mockImplementation(async () => {
      executionOrder.push('user1-start');
      await new Promise((res) => setTimeout(res, 50));
      executionOrder.push('user1-end');
      return 'res1';
    });

    const task2 = vi.fn().mockImplementation(async () => {
      executionOrder.push('user2-start');
      await new Promise((res) => setTimeout(res, 10));
      executionOrder.push('user2-end');
      return 'res2';
    });

    const p1 = queue.enqueue('user1', task1);
    const p2 = queue.enqueue('user2', task2);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe('res1');
    expect(r2).toBe('res2');
    expect(executionOrder).toEqual(['user1-start', 'user1-end', 'user2-start', 'user2-end']);
  });

  it('deduplicates concurrent requests for the exact same username and returns the existing promise', async () => {
    let taskExecutions = 0;

    const task = vi.fn().mockImplementation(async () => {
      taskExecutions++;
      await new Promise((res) => setTimeout(res, 30));
      return { synced: 42 };
    });

    // Case insensitive username matching
    const p1 = queue.enqueue('MagnusCarlsen', task);
    const p2 = queue.enqueue('magnuscarlsen', task);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toEqual({ synced: 42 });
    expect(r2).toEqual({ synced: 42 });
    expect(taskExecutions).toBe(1); // Task was executed exactly ONCE
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('escalates typed errors (e.g. 429) to all deduplicated callers', async () => {
    const rateLimitErr = createPubApiError('UPSTREAM_RATE_LIMITED', 'Rate limit exceeded', true, 429);

    const task = vi.fn().mockImplementation(async () => {
      await new Promise((res) => setTimeout(res, 10));
      throw rateLimitErr;
    });

    const p1 = queue.enqueue('hikaru', task);
    const p2 = queue.enqueue('hikaru', task);

    await expect(p1).rejects.toThrow('Rate limit exceeded');
    await expect(p2).rejects.toThrow('Rate limit exceeded');
  });

  it('cancels caller promise when signal aborts, and aborts task signal when ALL callers abort', async () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();

    let taskSignalAborted = false;

    const task = vi.fn().mockImplementation(async (signal: AbortSignal) => {
      signal.addEventListener('abort', () => {
        taskSignalAborted = true;
      });
      await new Promise((res) => setTimeout(res, 100));
      return 'done';
    });

    const p1 = queue.enqueue('userA', task, controller1.signal);
    const p2 = queue.enqueue('userA', task, controller2.signal);

    // Abort caller 1
    controller1.abort();

    await expect(p1).rejects.toThrow();
    expect(taskSignalAborted).toBe(false); // task still running because caller 2 is active

    // Abort caller 2
    controller2.abort();
    await expect(p2).rejects.toThrow();

    expect(taskSignalAborted).toBe(true); // task signal was triggered when all callers aborted
  });

  it('allows a new caller to enqueue a username even if a previously queued job for that username had all callers abort before executing', async () => {
    const controller1 = new AbortController();

    const longTask = vi.fn().mockImplementation(async () => {
      await new Promise((res) => setTimeout(res, 80));
      return 'user1-done';
    });

    const abortedTask = vi.fn().mockImplementation(async () => 'should-not-run');

    const freshTask = vi.fn().mockImplementation(async () => 'fresh-result');

    // 1. User 1 starts long task
    const p1 = queue.enqueue('user1', longTask);

    // 2. User 2 enqueues while user 1 is running, with signal controller1
    const p2 = queue.enqueue('user2', abortedTask, controller1.signal);

    // 3. Controller 1 aborts before user 1 finishes
    controller1.abort();
    await expect(p2).rejects.toThrow();

    // 4. While user 1 is STILL running, user 2 enqueues a fresh task with a new signal
    const controller2 = new AbortController();
    const p3 = queue.enqueue('user2', freshTask, controller2.signal);

    // 5. Await user 1 and user 2's fresh task
    const [r1, r3] = await Promise.all([p1, p3]);

    expect(r1).toBe('user1-done');
    expect(r3).toBe('fresh-result');
    expect(freshTask).toHaveBeenCalledTimes(1);
    expect(abortedTask).not.toHaveBeenCalled();
  });
});
