import { describe, expect, it, vi } from 'vitest';

import {
  createAbortError,
  createCorsError,
  createOfflineError,
  createPubApiError,
  throwIfAborted,
} from '../../../lib/api/errors';
import type { GameQuery } from '../../../lib/api/contracts';
import type { RawChesscomGame } from '../../../lib/api/chesscomSchemas';
import type { IngestionDependencies, IngestionProgress } from '../../../features/ingestion/types';
import { runIngestion } from '../../../features/ingestion/ingestionService';
import {
  makeArchiveSync,
  makeGameRecord,
  makeQuery,
  makeRawGame,
  NOW,
} from '../../helpers/phase1Fixtures';

function fakeDependencies(overrides: Partial<IngestionDependencies> = {}): IngestionDependencies {
  return {
    fetchArchives: vi
      .fn()
      .mockResolvedValue(['https://api.chess.com/pub/player/janedoe/games/2026/08']),
    fetchMonthlyGames: vi.fn().mockResolvedValue([]),
    readArchiveList: vi.fn().mockResolvedValue(null),
    writeArchiveList: vi.fn().mockResolvedValue(undefined),
    readArchiveSyncs: vi.fn().mockResolvedValue([]),
    readMonthGames: vi.fn().mockResolvedValue([]),
    persistMonth: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function runWithFetchedGames(query: GameQuery, games: RawChesscomGame[]) {
  const deps = fakeDependencies({
    fetchMonthlyGames: vi.fn().mockResolvedValue(games),
  });
  return runIngestion(query, { deps, now: () => NOW, random: () => 0 });
}

function rejectWhenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }
    signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
  });
}

describe('runIngestion', () => {
  it('uses fresh cached archive metadata and normalized games without a browser fetch', async () => {
    const cachedGame = makeGameRecord();
    const deps = fakeDependencies({
      readArchiveList: vi.fn().mockResolvedValue({
        username: 'janedoe',
        months: ['2026-08'],
        fetchedAt: NOW - 60_000,
      }),
      readArchiveSyncs: vi.fn().mockResolvedValue([makeArchiveSync()]),
      readMonthGames: vi.fn().mockResolvedValue([cachedGame]),
    });

    const result = await runIngestion(makeQuery(), { deps, now: () => NOW });

    expect(result).toMatchObject({ status: 'complete', games: [cachedGame] });
    expect(deps.fetchArchives).not.toHaveBeenCalled();
    expect(deps.fetchMonthlyGames).not.toHaveBeenCalled();
  });

  it('manual refresh bypasses application freshness but retains browser cache mode', async () => {
    const deps = fakeDependencies({
      readArchiveList: vi.fn().mockResolvedValue({
        username: 'janedoe',
        months: ['2026-08'],
        fetchedAt: NOW - 60_000,
      }),
      readArchiveSyncs: vi.fn().mockResolvedValue([makeArchiveSync()]),
    });

    await runIngestion(makeQuery(), {
      deps,
      manualRefresh: true,
      now: () => NOW,
    });

    expect(deps.fetchArchives).toHaveBeenCalledTimes(1);
    expect(deps.fetchMonthlyGames).toHaveBeenCalledTimes(1);
  });

  it('uses stale cached data while offline and reports freshness explicitly', async () => {
    const cachedGame = makeGameRecord();
    const deps = fakeDependencies({
      readArchiveList: vi.fn().mockResolvedValue({
        username: 'janedoe',
        months: ['2026-08'],
        fetchedAt: NOW - 60 * 60_000,
      }),
      readArchiveSyncs: vi
        .fn()
        .mockResolvedValue([makeArchiveSync({ lastSuccessfulFetchAt: NOW - 60 * 60_000 })]),
      readMonthGames: vi.fn().mockResolvedValue([cachedGame]),
      fetchArchives: vi.fn().mockRejectedValue(createOfflineError()),
    });

    const result = await runIngestion(makeQuery(), { deps, now: () => NOW });

    expect(result).toMatchObject({ status: 'complete', offlineCacheOnly: true });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'OFFLINE_STALE_CACHE' })
    );
  });

  it.each([
    {
      name: 'date',
      query: makeQuery({ dateFrom: '2026-08-12', dateTo: '2026-08-12' }),
      games: [
        makeRawGame({ uuid: 'in-day', end_time: Date.UTC(2026, 7, 12, 23, 59) / 1000 }),
        makeRawGame({ uuid: 'out-day', end_time: Date.UTC(2026, 7, 13) / 1000 }),
      ],
      expected: ['in-day'],
    },
    {
      name: 'time class',
      query: makeQuery({ timeClasses: ['rapid'] }),
      games: [
        makeRawGame({ uuid: 'rapid', time_class: 'rapid' }),
        makeRawGame({ uuid: 'blitz', time_class: 'blitz' }),
      ],
      expected: ['rapid'],
    },
    {
      name: 'colour',
      query: makeQuery({ colors: ['black'] }),
      games: [
        makeRawGame({
          uuid: 'black',
          white: { username: 'opponent', result: 'agreed' },
          black: { username: 'janedoe', result: 'agreed' },
        }),
        makeRawGame({ uuid: 'white' }),
      ],
      expected: ['black'],
    },
    {
      name: 'rated',
      query: makeQuery({ rated: true }),
      games: [
        makeRawGame({ uuid: 'rated', rated: true }),
        makeRawGame({ uuid: 'casual', rated: false }),
      ],
      expected: ['rated'],
    },
  ])('applies the $name filter', async ({ query, games, expected }) => {
    const result = await runWithFetchedGames(query, games);
    expect(result.games.map((game) => game.id)).toEqual(expected);
  });

  it('matches the player case-insensitively and verifies exactly one colour', async () => {
    const mixedCase = makeRawGame({
      uuid: 'mixed-case',
      white: { username: 'JaneDoe', result: 'agreed' },
    });
    const ambiguous = makeRawGame({
      uuid: 'ambiguous',
      white: { username: 'janedoe', result: 'agreed' },
      black: { username: 'JANEDOE', result: 'agreed' },
    });

    const result = await runWithFetchedGames(makeQuery(), [mixedCase, ambiguous]);

    expect(result.games.map((game) => game.id)).toEqual(['mixed-case']);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'AMBIGUOUS_PLAYER_COLOR' })
    );
  });

  it('deduplicates a stable game ID across fetched months', async () => {
    const fetchMonthlyGames = vi
      .fn()
      .mockResolvedValueOnce([makeRawGame({ uuid: 'duplicate' })])
      .mockResolvedValueOnce([makeRawGame({ uuid: 'duplicate' })]);
    const deps = fakeDependencies({
      fetchArchives: vi
        .fn()
        .mockResolvedValue([
          'https://api.chess.com/pub/player/janedoe/games/2026/08',
          'https://api.chess.com/pub/player/janedoe/games/2026/07',
        ]),
      fetchMonthlyGames,
    });

    const result = await runIngestion(makeQuery(), { deps, now: () => NOW });

    expect(result.games.map((game) => game.id)).toEqual(['duplicate']);
    expect(fetchMonthlyGames).toHaveBeenCalledTimes(2);
  });

  it('stops fetching as soon as maxGames is reached newest first', async () => {
    const fetchMonthlyGames = vi
      .fn()
      .mockResolvedValue([makeRawGame({ uuid: 'newest' }), makeRawGame({ uuid: 'second-newest' })]);
    const deps = fakeDependencies({
      fetchArchives: vi
        .fn()
        .mockResolvedValue([
          'https://api.chess.com/pub/player/janedoe/games/2026/08',
          'https://api.chess.com/pub/player/janedoe/games/2026/07',
        ]),
      fetchMonthlyGames,
    });

    const result = await runIngestion(makeQuery({ maxGames: 2 }), {
      deps,
      now: () => NOW,
    });

    expect(result.games.map((game) => game.id)).toEqual(['newest', 'second-newest']);
    expect(fetchMonthlyGames).toHaveBeenCalledTimes(1);
  });

  it('returns partial with accepted data and retryable failed months', async () => {
    const fetchMonthlyGames = vi
      .fn()
      .mockResolvedValueOnce([makeRawGame({ uuid: 'accepted' })])
      .mockRejectedValue(
        createPubApiError('UPSTREAM_UNAVAILABLE', 'Upstream temporarily unavailable', true, 503)
      );
    const deps = fakeDependencies({
      fetchArchives: vi
        .fn()
        .mockResolvedValue([
          'https://api.chess.com/pub/player/janedoe/games/2026/08',
          'https://api.chess.com/pub/player/janedoe/games/2026/07',
        ]),
      fetchMonthlyGames,
    });

    const result = await runIngestion(makeQuery(), {
      deps,
      now: () => NOW,
      random: () => 0,
      wait: async () => undefined,
    });

    expect(result).toMatchObject({
      status: 'partial',
      games: [expect.objectContaining({ id: 'accepted' })],
      failedMonths: [{ month: '2026-07', retryable: true, attempts: 3 }],
    });
  });

  it('distinguishes empty complete from total failure', async () => {
    await expect(runWithFetchedGames(makeQuery(), [])).resolves.toMatchObject({
      status: 'complete',
      games: [],
      failedMonths: [],
    });
    const deps = fakeDependencies({
      fetchArchives: vi
        .fn()
        .mockRejectedValue(createPubApiError('PLAYER_NOT_FOUND', 'Player not found', false, 404)),
    });

    await expect(runIngestion(makeQuery(), { deps, now: () => NOW })).resolves.toMatchObject({
      status: 'failed',
      games: [],
    });
  });

  it('returns one cancelled result during archive fetch and emits no late progress', async () => {
    const controller = new AbortController();
    const progress: IngestionProgress[] = [];
    const deps = fakeDependencies({
      fetchArchives: vi.fn((_username, options) => rejectWhenAborted(options.signal!)),
    });
    const promise = runIngestion(makeQuery(), {
      deps,
      signal: controller.signal,
      now: () => NOW,
      onProgress: (event) => progress.push(event),
    });

    controller.abort();

    await expect(promise).resolves.toMatchObject({ status: 'cancelled' });
    const progressCountAtTerminal = progress.length;
    await Promise.resolve();
    expect(progress).toHaveLength(progressCountAtTerminal);
  });

  it('cancels during a retry wait without starting another attempt', async () => {
    const controller = new AbortController();
    const fetchArchives = vi.fn().mockRejectedValue(createCorsError());
    const wait = vi.fn((_delay, signal) => rejectWhenAborted(signal));
    const promise = runIngestion(makeQuery(), {
      deps: fakeDependencies({ fetchArchives }),
      signal: controller.signal,
      now: () => NOW,
      wait,
    });
    await vi.waitFor(() => expect(wait).toHaveBeenCalledTimes(1));

    controller.abort();

    await expect(promise).resolves.toMatchObject({ status: 'cancelled' });
    expect(fetchArchives).toHaveBeenCalledTimes(1);
  });

  it('aborts persistence before its atomic commit', async () => {
    const controller = new AbortController();
    const persistMonth = vi.fn(async (_games, _marker, signal) => {
      controller.abort();
      throwIfAborted(signal);
    });

    const result = await runIngestion(makeQuery(), {
      deps: fakeDependencies({
        fetchMonthlyGames: vi.fn().mockResolvedValue([makeRawGame()]),
        persistMonth,
      }),
      signal: controller.signal,
      now: () => NOW,
    });

    expect(result.status).toBe('cancelled');
    expect(persistMonth).toHaveBeenCalledTimes(1);
  });

  it('emits immutable progress snapshots with observable ingestion counters', async () => {
    const progress: IngestionProgress[] = [];
    const ambiguous = makeRawGame({
      uuid: 'ambiguous-progress',
      white: { username: 'janedoe', result: 'agreed' },
      black: { username: 'JANEDOE', result: 'agreed' },
    });

    await runIngestion(makeQuery(), {
      deps: fakeDependencies({
        fetchMonthlyGames: vi.fn().mockResolvedValue([makeRawGame(), ambiguous]),
      }),
      now: () => NOW,
      onProgress: (event) => progress.push(event),
    });

    expect(progress.map((event) => event.phase)).toEqual(
      expect.arrayContaining(['planning', 'loading-cache', 'fetching', 'filtering'])
    );
    expect(progress.at(-1)).toMatchObject({
      monthsPlanned: 1,
      monthsCompleted: 1,
      recordsFetched: 2,
      recordsAccepted: 1,
      recordsExcluded: 1,
      recordsFailed: 1,
    });
    expect(new Set(progress.map((event) => event.diagnostics)).size).toBe(progress.length);
  });

  it('reports retry attempt and delay for the active month', async () => {
    const progress: IngestionProgress[] = [];
    const fetchMonthlyGames = vi
      .fn()
      .mockRejectedValueOnce(createCorsError())
      .mockResolvedValueOnce([]);

    await runIngestion(makeQuery(), {
      deps: fakeDependencies({ fetchMonthlyGames }),
      now: () => NOW,
      random: () => 0.5,
      wait: async () => undefined,
      onProgress: (event) => progress.push(event),
    });

    expect(progress).toContainEqual(
      expect.objectContaining({
        phase: 'fetching',
        currentMonth: '2026-08',
        retry: { attempt: 2, delayMs: 500 },
      })
    );
  });
});
