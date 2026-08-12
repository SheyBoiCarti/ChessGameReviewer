import { describe, expect, it } from 'vitest';

import { ENGINE_WORKER_PROTOCOL_VERSION, isEngineWorkerRequest } from '../../../workers/stockfish.protocol';

describe('Stockfish worker protocol', () => {
  it('requires a matching protocol version and nonempty job ID', () => {
    expect(
      isEngineWorkerRequest({
        protocolVersion: ENGINE_WORKER_PROTOCOL_VERSION,
        jobId: 'job-1',
        type: 'INITIALIZE',
        mode: 'single-thread',
        resources: { threads: 1, hashMb: 16 },
      })
    ).toBe(true);
    expect(isEngineWorkerRequest({ protocolVersion: 0, jobId: '', type: 'STOP' })).toBe(false);
  });
});
