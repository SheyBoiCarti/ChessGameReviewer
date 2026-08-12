import { describe, expect, it } from 'vitest';
import { GraphWorkerClient } from '@/features/opening-tree/graphWorkerClient';

class FakeWorker extends EventTarget {
  readonly messages: unknown[] = [];
  postMessage(message: unknown) { this.messages.push(message); }
  terminate() {}
  emit(data: unknown) { this.dispatchEvent(new MessageEvent('message', { data })); }
}

describe('GraphWorkerClient', () => {
  it('settles only the active job and ignores stale completion', async () => {
    const worker = new FakeWorker() as unknown as Worker;
    const client = new GraphWorkerClient(worker);
    const build = client.build([], { maxOpeningPlies: 30, includeRepeatedPositions: true });
    const request = (worker as unknown as FakeWorker).messages[0] as { jobId: string };
    (worker as unknown as FakeWorker).emit({ protocolVersion: 1, jobId: 'stale', type: 'COMPLETE', snapshot: {} });
    (worker as unknown as FakeWorker).emit({ protocolVersion: 1, jobId: request.jobId, type: 'COMPLETE', snapshot: { formatVersion: 1 } });
    await expect(build).resolves.toMatchObject({ status: 'complete' });
  });
});
