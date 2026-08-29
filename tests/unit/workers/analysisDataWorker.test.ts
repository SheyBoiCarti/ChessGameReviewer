import { describe, expect, it, vi } from 'vitest';

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
    whitePlayer: { username: 'alice', rating: 1500 },
    blackPlayer: { username: 'opponent', rating: 1600 },
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

  it('cancels a job that was cancelled before it starts', async () => {
    const responses: Array<{ type: string }> = [];
    await handleRequest(
      { protocolVersion: 1, jobId: 'cancel-before-start', type: 'CANCEL_JOB' },
      () => undefined
    );
    await handleRequest(
      {
        protocolVersion: 1,
        jobId: 'cancel-before-start',
        type: 'BUILD_GRAPH',
        games: [game()],
        options: { maxOpeningPlies: 30, includeRepeatedPositions: true },
        queryFingerprint: 'cancel-before-start-query',
      },
      (response) => responses.push(response)
    );

    expect(responses.map(({ type }) => type)).toEqual(['JOB_ACCEPTED', 'CANCELLED']);
  });

  it('contains unexpected build failures in a stable terminal response', async () => {
    const responses: Array<Record<string, unknown>> = [];
    await handleRequest(
      {
        protocolVersion: 1,
        jobId: 'invalid-horizon',
        type: 'BUILD_GRAPH',
        games: [game()],
        options: { maxOpeningPlies: 1, includeRepeatedPositions: true },
        queryFingerprint: 'invalid-horizon-query',
      } as never,
      (response) => responses.push(response)
    );

    expect(responses.at(-1)).toEqual({
      protocolVersion: 1,
      jobId: 'invalid-horizon',
      type: 'FAILED',
      code: 'GRAPH_BUILD_FAILED',
      message: 'Graph build failed.',
    });
  });

  it('throttles monotonic progress updates to at most one per 50 ms', async () => {
    let now = 0;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 10;
      return now;
    });
    const progress: Array<{ at: number; parsedCount: number; builtCount: number }> = [];
    try {
      await handleRequest(
        {
          protocolVersion: 1,
          jobId: 'throttle-progress',
          type: 'BUILD_GRAPH',
          games: Array.from({ length: 100 }, (_, index) => game({ id: `throttle-${index}` })),
          options: { maxOpeningPlies: 30, includeRepeatedPositions: true },
          queryFingerprint: 'throttle-query',
        },
        (response) => {
          if (response.type === 'PROGRESS') {
            progress.push({
              at: now,
              parsedCount: response.parsedCount,
              builtCount: response.builtCount,
            });
          }
        }
      );
    } finally {
      clock.mockRestore();
    }

    expect(progress.length).toBeGreaterThan(1);
    expect(
      progress.every((event, index) => index === 0 || event.at - progress[index - 1]!.at >= 50)
    ).toBe(true);
    expect(
      progress.every(
        (event, index) =>
          index === 0 ||
          (event.parsedCount >= progress[index - 1]!.parsedCount &&
            event.builtCount >= progress[index - 1]!.builtCount)
      )
    ).toBe(true);
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
