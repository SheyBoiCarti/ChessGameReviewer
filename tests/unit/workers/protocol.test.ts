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
        queryFingerprint: 'query',
      })
    ).toBe(true);
    expect(isWorkerRequest({ protocolVersion: 99, jobId: 'job-1', type: 'BUILD_GRAPH' })).toBe(
      false
    );
    expect(
      isWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        jobId: 'job-1',
        type: 'BUILD_GRAPH',
        games: [],
        options: { maxOpeningPlies: 41, includeRepeatedPositions: true },
        queryFingerprint: 'query',
      })
    ).toBe(false);
    expect(
      isWorkerRequest({ protocolVersion: PROTOCOL_VERSION, jobId: '', type: 'CANCEL_JOB' })
    ).toBe(false);
  });

  it('accepts a versioned VALIDATE_PGNS request and rejects a non-array games payload', () => {
    expect(
      isWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        jobId: 'validation-job',
        type: 'VALIDATE_PGNS',
        games: [],
      })
    ).toBe(true);
    expect(
      isWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        jobId: 'validation-job',
        type: 'VALIDATE_PGNS',
        games: {},
      })
    ).toBe(false);
  });
});
