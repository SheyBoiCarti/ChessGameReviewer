import { describe, expect, it } from 'vitest';

import { handleRequest } from '@/workers/analysis-data.worker';
import { parseGamePgn } from '@/lib/chess/pgnParser';

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
      },
      (response) => responses.push(response)
    );
    expect(responses.map(({ type }) => type)).toEqual(['JOB_ACCEPTED', 'PROGRESS', 'COMPLETE']);
    expect(
      responses.filter(({ type }) => type === 'PROGRESS').map(({ builtCount }) => builtCount)
    ).toEqual([0]);
  });

  it('observes a cancellation request while a large graph is building', async () => {
    const parsed = parseGamePgn({
      game: {
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
      },
    });
    if (!parsed.ok) throw new Error('Expected legal fixture to parse.');
    const responses: Array<{ type: string }> = [];
    const build = handleRequest(
      {
        protocolVersion: 1,
        jobId: 'cancel-me',
        type: 'BUILD_GRAPH',
        games: Array.from({ length: 100 }, (_, index) => ({
          ...parsed.game,
          id: `fixture-${index}`,
        })),
        options: { maxOpeningPlies: 30, includeRepeatedPositions: true },
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
});
