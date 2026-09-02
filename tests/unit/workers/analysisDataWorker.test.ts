import { describe, expect, it, vi } from 'vitest';

import { buildGraphWithinByteBudget, handleRequest } from '@/workers/analysis-data.worker';
import type { NormalizedGameSummary } from '@/lib/api/contracts';
import { parseGamePgn, type ParsedGame } from '@/lib/chess/pgnParser';
import { OpeningGraphBuilder, canonicalGameOrder } from '@/lib/chess/graph/openingGraph';
import { serializeOpeningGraph, serializedGraphByteSize } from '@/lib/chess/graph/serialization';

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

function parsed(id: string, pgn: string): ParsedGame {
  const result = parseGamePgn({ game: game({ id, pgn }) });
  if (!result.ok) throw new Error('Expected valid PGN fixture');
  return result.game;
}

describe('analysis data worker', () => {
  it('accepts a serialized graph at its exact byte limit', async () => {
    const games = [parsed('one', '1. e4 e5 1-0')];
    const metadata = {
      queryFingerprint: 'exact-fit',
      sourceGameCount: 1,
      excludedGameCount: 0,
      buildTimestamp: 1,
    };
    const full = await buildGraphWithinByteBudget(
      games,
      { maxOpeningPlies: 30, includeRepeatedPositions: false },
      metadata,
      { maxBytes: Number.MAX_SAFE_INTEGER }
    );

    const exact = await buildGraphWithinByteBudget(
      games,
      { maxOpeningPlies: 30, includeRepeatedPositions: false },
      metadata,
      { maxBytes: serializedGraphByteSize(full.snapshot) }
    );

    expect(exact.status).toBe('complete');
  });

  it('returns a valid zero-game graph when one game exceeds the byte budget', async () => {
    const games = [parsed('one-overflow', '1. e4 e5 2. Nf3 Nc6 1-0')];
    const metadata = {
      queryFingerprint: 'one-overflow',
      sourceGameCount: 1,
      excludedGameCount: 0,
      buildTimestamp: 1,
    };
    const emptyGraph = new OpeningGraphBuilder({ maxOpeningPlies: 30 }).build([]);
    const emptySnapshot = {
      ...serializeOpeningGraph(emptyGraph, metadata),
      status: 'limited' as const,
      reachedLimit: 'maxSnapshotBytes',
      includedGameCount: 0,
      remainingGameCount: 1,
    };
    const maxBytes = serializedGraphByteSize(emptySnapshot);

    const result = await buildGraphWithinByteBudget(
      games,
      { maxOpeningPlies: 30, includeRepeatedPositions: false },
      metadata,
      { maxBytes }
    );

    expect(result).toMatchObject({
      status: 'limited',
      reachedLimit: 'maxSnapshotBytes',
      includedGameCount: 0,
      remainingGameCount: 1,
    });
    expect(result.snapshot.positions.some(({ key }) => key === result.snapshot.rootKey)).toBe(true);
    expect(serializedGraphByteSize(result.snapshot)).toBeLessThanOrEqual(maxBytes);
  });

  it('selects the largest fitting canonical complete-game prefix', async () => {
    const games = [
      parsed('three', '1. c4 e5 1-0'),
      parsed('one', '1. e4 e5 1-0'),
      parsed('two', '1. d4 d5 1-0'),
    ];
    const options = { maxOpeningPlies: 30, includeRepeatedPositions: false };
    const metadata = {
      queryFingerprint: 'middle-prefix',
      sourceGameCount: 3,
      excludedGameCount: 0,
      buildTimestamp: 1,
    };
    const ordered = canonicalGameOrder(games);
    const twoGraph = new OpeningGraphBuilder(options).build(ordered.slice(0, 2));
    const twoSnapshot = {
      ...serializeOpeningGraph(twoGraph, metadata),
      status: 'limited' as const,
      reachedLimit: 'maxSnapshotBytes',
      includedGameCount: 2,
      remainingGameCount: 1,
    };
    const maxBytes = serializedGraphByteSize(twoSnapshot);

    const result = await buildGraphWithinByteBudget(games, options, metadata, { maxBytes });
    const threeGraph = new OpeningGraphBuilder(options).build(ordered);
    const threeSnapshot = {
      ...serializeOpeningGraph(threeGraph, metadata),
      status: 'limited' as const,
      reachedLimit: 'maxSnapshotBytes',
      includedGameCount: 3,
      remainingGameCount: 0,
    };

    expect(result).toMatchObject({
      status: 'limited',
      reachedLimit: 'maxSnapshotBytes',
      includedGameCount: 2,
      remainingGameCount: 1,
    });
    expect(serializedGraphByteSize(result.snapshot)).toBeLessThanOrEqual(maxBytes);
    expect(serializedGraphByteSize(threeSnapshot)).toBeGreaterThan(maxBytes);
  });

  it('keeps a fitting structural limit as the terminal reason', async () => {
    const games = [parsed('first', '1. e4 e5 1-0'), parsed('second', '1. d4 d5 1-0')];
    const result = await buildGraphWithinByteBudget(
      games,
      { maxOpeningPlies: 30, includeRepeatedPositions: false },
      {
        queryFingerprint: 'structural',
        sourceGameCount: 2,
        excludedGameCount: 0,
        buildTimestamp: 1,
      },
      {
        maxBytes: Number.MAX_SAFE_INTEGER,
        structuralLimits: { maxPositions: 3, maxEdges: 2, maxPathNodes: 3 },
      }
    );

    expect(result).toMatchObject({ status: 'limited', reachedLimit: 'maxPositions' });
  });

  it('validates PGNs and returns valid ids with bounded diagnostics metadata', async () => {
    const responses: Array<Record<string, unknown>> = [];
    await handleRequest(
      {
        protocolVersion: 1,
        jobId: 'validate-pgns',
        type: 'VALIDATE_PGNS',
        games: [
          game({ id: 'valid' }),
          game({ id: 'missing', pgn: undefined }),
          game({ id: 'illegal', pgn: '1. e4 e5 2. NotAMove' }),
        ],
      },
      (response) => responses.push(response)
    );

    expect(responses.map(({ type }) => type)).toEqual(['JOB_ACCEPTED', 'PGN_VALIDATION_COMPLETE']);
    expect(responses.at(-1)).toMatchObject({
      validGameIds: ['valid'],
      totalInvalid: 2,
      diagnosticCodes: ['MISSING_PGN', 'ILLEGAL_PGN'],
      diagnostics: [
        expect.objectContaining({ code: 'MISSING_PGN', gameId: 'missing' }),
        expect.objectContaining({ code: 'ILLEGAL_PGN', gameId: 'illegal' }),
      ],
    });
  });

  it('bounds PGN validation detail rows and diagnostic codes', async () => {
    const responses: Array<Record<string, unknown>> = [];
    await handleRequest(
      {
        protocolVersion: 1,
        jobId: 'bounded-validation',
        type: 'VALIDATE_PGNS',
        games: Array.from({ length: 105 }, (_, index) =>
          game({ id: `missing-${index}`, pgn: undefined })
        ),
      },
      (response) => responses.push(response)
    );

    expect(responses.at(-1)).toMatchObject({
      type: 'PGN_VALIDATION_COMPLETE',
      totalInvalid: 105,
    });
    expect(responses.at(-1)?.diagnostics).toHaveLength(100);
    expect(responses.at(-1)?.diagnosticCodes).toHaveLength(1);
  });

  it('observes cancellation while validating a large PGN batch', async () => {
    const responses: Array<{ type: string }> = [];
    const validation = handleRequest(
      {
        protocolVersion: 1,
        jobId: 'cancel-validation',
        type: 'VALIDATE_PGNS',
        games: Array.from({ length: 100 }, (_, index) => game({ id: `validation-${index}` })),
      },
      (response) => responses.push(response)
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await handleRequest(
      { protocolVersion: 1, jobId: 'cancel-validation', type: 'CANCEL_JOB' },
      () => undefined
    );
    await validation;

    expect(responses.at(-1)?.type).toBe('CANCELLED');
    expect(responses.some(({ type }) => type === 'PGN_VALIDATION_COMPLETE')).toBe(false);
  });

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

  it('reports defensive parse exclusions as a partial graph result', async () => {
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
      type: 'PARTIAL',
      snapshot: { sourceGameCount: 2, includedGameCount: 1, excludedGameCount: 1 },
      excludedGameCount: 1,
      diagnosticCodes: ['ILLEGAL_PGN'],
    });
    expect(responses.find((response) => response.type === 'PROGRESS')).toMatchObject({
      diagnosticsCount: 1,
      diagnosticCodes: ['ILLEGAL_PGN'],
    });
  });
});
