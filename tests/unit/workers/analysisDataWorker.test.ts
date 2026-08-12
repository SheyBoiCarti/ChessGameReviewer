import { describe, expect, it } from 'vitest';

import { handleRequest } from '@/workers/analysis-data.worker';
import type { NormalizedGameSummary } from '@/lib/api/contracts';

function game(overrides: Partial<NormalizedGameSummary> = {}): NormalizedGameSummary {
  return {
    id: 'fixture',
    url: 'https://example.test/fixture',
    usernameKey: 'alice',
    userColor: 'white',
    result: 'win',
    endedAt: 0,
    timeClass: 'blitz',
    rated: true,
    userRating: 1500,
    opponentRating: 1600,
    rules: 'chess',
    pgn: '1. e4 e5 2. Nf3 Nc6 1-0',
    ...overrides,
  };
}

describe('analysis data worker', () => {
  it('accepts a graph job and reports monotonic progress before completion', async () => {
    const responses: Array<{ type: string; builtCount?: number }> = [];
    await handleRequest(
      {
        protocolVersion: 1,
        jobId: 'job',
        type: 'BUILD_GRAPH',
        games: [],
        options: { maxOpeningPlies: 30, includeRepeatedPositions: true },
        queryFingerprint: 'job-query',
      },
      (response) => responses.push(response)
    );
    expect(responses.map(({ type }) => type)).toEqual(['JOB_ACCEPTED', 'PROGRESS', 'COMPLETE']);
    expect(
      responses.filter(({ type }) => type === 'PROGRESS').map(({ builtCount }) => builtCount)
    ).toEqual([0]);
  });

  it('observes a cancellation request while a large graph is building', async () => {
    const responses: Array<{ type: string }> = [];
    const build = handleRequest(
      {
        protocolVersion: 1,
        jobId: 'cancel-me',
        type: 'BUILD_GRAPH',
        games: Array.from({ length: 100 }, (_, index) => game({ id: `fixture-${index}` })),
        options: { maxOpeningPlies: 30, includeRepeatedPositions: true },
        queryFingerprint: 'cancel-query',
      },
      (response) => responses.push(response)
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await handleRequest(
      { protocolVersion: 1, jobId: 'cancel-me', type: 'CANCEL_JOB' },
      () => undefined
    );
    await build;

    expect(responses.at(-1)?.type).toBe('CANCELLED');
    expect(responses.some(({ type }) => type === 'COMPLETE')).toBe(false);
  });

  it('parses normalized records inside the worker and bounds parse diagnostics', async () => {
    const responses: Array<Record<string, unknown>> = [];
    await handleRequest(
      {
        protocolVersion: 1,
        jobId: 'parse-in-worker',
        type: 'BUILD_GRAPH',
        games: [game({ id: 'bad-pgn', pgn: '1. e4 e5 2. NotAMove' }), game()],
        options: { maxOpeningPlies: 30, includeRepeatedPositions: true },
        queryFingerprint: 'parse-query',
      },
      (response) => responses.push(response)
    );

    expect(responses.at(-1)).toMatchObject({
      type: 'COMPLETE',
      snapshot: { sourceGameCount: 2, includedGameCount: 1 },
    });
    expect(responses.find((response) => response.type === 'PROGRESS')).toMatchObject({
      diagnosticsCount: 1,
      diagnosticCodes: ['ILLEGAL_PGN'],
    });
  });
});
