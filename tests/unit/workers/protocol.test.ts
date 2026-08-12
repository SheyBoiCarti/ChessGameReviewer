import { describe, expect, it } from 'vitest';

import { isWorkerRequest, PROTOCOL_VERSION } from '@/workers/protocol';

describe('analysis worker protocol validation', () => {
  it('accepts a versioned BUILD_GRAPH request and rejects malformed messages', () => {
    expect(
      isWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        jobId: 'job-1',
        type: 'BUILD_GRAPH',
        games: [],
        options: { maxOpeningPlies: 30, includeRepeatedPositions: true },
      })
    ).toBe(true);
    expect(isWorkerRequest({ protocolVersion: 99, jobId: 'job-1', type: 'BUILD_GRAPH' })).toBe(
      false
    );
    expect(
      isWorkerRequest({ protocolVersion: PROTOCOL_VERSION, jobId: '', type: 'CANCEL_JOB' })
    ).toBe(false);
  });
});
