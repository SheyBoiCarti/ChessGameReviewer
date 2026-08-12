import { describe, expect, it } from 'vitest';
import { GraphWorkerClient } from '@/features/opening-tree/graphWorkerClient';

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
  it('settles only the active job and ignores stale completion', async () => {
    const worker = new FakeWorker() as unknown as Worker;
    const client = new GraphWorkerClient(worker);
    const build = client.build([], { maxOpeningPlies: 30, includeRepeatedPositions: true });
    const request = (worker as unknown as FakeWorker).messages[0] as { jobId: string };
    (worker as unknown as FakeWorker).emit({
      protocolVersion: 1,
      jobId: 'stale',
      type: 'COMPLETE',
      snapshot: {},
    });
    (worker as unknown as FakeWorker).emit({
      protocolVersion: 1,
      jobId: request.jobId,
      type: 'COMPLETE',
      snapshot: { formatVersion: 1 },
    });
    await expect(build).resolves.toMatchObject({ status: 'complete' });
  });

  it('settles limited, cancelled, and worker-error jobs exactly once', async () => {
    const worker = new FakeWorker() as unknown as Worker;
    const client = new GraphWorkerClient(worker);
    const limited = client.build([], { maxOpeningPlies: 30, includeRepeatedPositions: true });
    const limitedRequest = (worker as unknown as FakeWorker).messages.at(-1) as { jobId: string };
    (worker as unknown as FakeWorker).emit({
      protocolVersion: 1,
      jobId: limitedRequest.jobId,
      type: 'LIMITED',
      snapshot: {},
      reachedLimit: 'maxEdges',
      includedGameCount: 1,
      remainingGameCount: 2,
    });
    await expect(limited).resolves.toMatchObject({ status: 'limited', reachedLimit: 'maxEdges' });

    const cancelled = client.build([], { maxOpeningPlies: 30, includeRepeatedPositions: true });
    client.cancel();
    await expect(cancelled).rejects.toThrow('GRAPH_BUILD_CANCELLED');

    const failed = client.build([], { maxOpeningPlies: 30, includeRepeatedPositions: true });
    (worker as unknown as FakeWorker).dispatchEvent(new Event('error'));
    await expect(failed).rejects.toThrow('GRAPH_WORKER_FAILED');
    client.dispose();
  });
});
