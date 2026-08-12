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
import {
  createJobId,
  IngestionManager,
  runIngestion,
} from '../../../features/ingestion/ingestionService';
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

  it('diagnoses absent players, unsupported rules/classes, and inconsistent outcomes safely', async () => {
    const absentPlayer = makeRawGame({
      '@id': 'safe-at-id',
      white: { username: 'other', result: 'agreed' },
    });
    delete absentPlayer.uuid;

    const result = await runWithFetchedGames(makeQuery(), [
      absentPlayer,
      makeRawGame({ uuid: 'variant', rules: 'chess960' }),
      makeRawGame({ uuid: 'unsupported-clock', time_class: 'correspondence' }),
      makeRawGame({
        uuid: 'bad-result',
        white: { username: 'janedoe', result: 'win' },
        black: { username: 'opponent', result: 'win' },
      }),
    ]);

    expect(result.games).toEqual([]);
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'USER_NOT_IN_GAME',
      'NON_STANDARD_RULES',
      'INVALID_TIME_CLASS',
      'INCONSISTENT_PLAYER_RESULTS',
    ]);
    expect(result.diagnostics[0]?.gameId).toBe('safe-at-id');
  });

  it('normalizes optional fields and defaults without exposing raw-only data', async () => {
    const minimalGame = makeRawGame({
      time_control: '600',
      white: { username: 'janedoe', result: 'agreed' },
      black: { username: 'opponent', result: 'agreed' },
    });
    delete minimalGame.uuid;
    delete minimalGame['@id'];
    delete minimalGame.rated;
    delete minimalGame.pgn;

    const result = await runWithFetchedGames(makeQuery(), [minimalGame]);

    expect(result.games[0]).toMatchObject({
      id: 'https://www.chess.com/game/live/100',
      rated: false,
      pgn: '',
      timeControl: '600',
      userRating: null,
      opponentRating: null,
    });
    expect(result.games[0]).not.toHaveProperty('uuid');
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

  it('fails validation before storage or network activity', async () => {
    const deps = fakeDependencies();

    const result = await runIngestion({ username: 'x' }, { deps });

    expect(result).toMatchObject({ status: 'failed', fingerprint: '', games: [] });
    expect(deps.readArchiveSyncs).not.toHaveBeenCalled();
    expect(deps.fetchArchives).not.toHaveBeenCalled();
  });

  it('uses sync-marker months when offline archive metadata is absent', async () => {
    const cachedGame = makeGameRecord();
    const deps = fakeDependencies({
      fetchArchives: vi.fn().mockRejectedValue(createOfflineError()),
      readArchiveSyncs: vi
        .fn()
        .mockResolvedValue([makeArchiveSync({ lastSuccessfulFetchAt: NOW - 60 * 60_000 })]),
      readMonthGames: vi.fn().mockResolvedValue([cachedGame]),
    });

    await expect(runIngestion(makeQuery(), { deps, now: () => NOW })).resolves.toMatchObject({
      status: 'complete',
      games: [cachedGame],
      offlineCacheOnly: true,
    });
  });

  it('keeps accepted games when persistence fails with an untyped storage error', async () => {
    const deps = fakeDependencies({
      fetchMonthlyGames: vi.fn().mockResolvedValue([makeRawGame()]),
      persistMonth: vi.fn().mockRejectedValue(new Error('quota details')),
    });

    const result = await runIngestion(makeQuery(), { deps, now: () => NOW });

    expect(result).toMatchObject({
      status: 'partial',
      games: [expect.objectContaining({ id: 'game-100' })],
    });
    expect(result.failedMonths).toHaveLength(1);
    expect(result.failedMonths[0]).toMatchObject({
      retryable: false,
      attempts: 1,
      error: { code: 'INVALID_UPSTREAM_RESPONSE' },
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'INGESTION_FAILED' })
    );
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

  it('never reports more accepted games than the query limit during a network fetch', async () => {
    const progress: IngestionProgress[] = [];

    const result = await runIngestion(makeQuery({ maxGames: 1 }), {
      deps: fakeDependencies({
        fetchMonthlyGames: vi
          .fn()
          .mockResolvedValue([
            makeRawGame({ uuid: 'accepted' }),
            makeRawGame({ uuid: 'overflow' }),
          ]),
      }),
      now: () => NOW,
      onProgress: (event) => progress.push(event),
    });

    expect(result.games.map((game) => game.id)).toEqual(['accepted']);
    expect(progress.every((event) => event.recordsAccepted <= 1)).toBe(true);
    expect(progress.at(-1)).toMatchObject({ recordsExcluded: 1 });
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

describe('IngestionManager', () => {
  it('cancels the previous query and ignores its late progress/result', async () => {
    const oldArchives = deferred<string[]>();
    const fetchArchives = vi
      .fn()
      .mockImplementationOnce(() => oldArchives.promise)
      .mockResolvedValueOnce([]);
    const deps = fakeDependencies({ fetchArchives });
    const manager = new IngestionManager(deps);
    const oldProgress = vi.fn();
    const currentProgress = vi.fn();
    const old = manager.start(makeQuery({ username: 'old-user' }), {
      onProgress: oldProgress,
    });
    await vi.waitFor(() => expect(fetchArchives).toHaveBeenCalledTimes(1));
    const oldProgressCountAtSupersession = oldProgress.mock.calls.length;

    const current = manager.start(makeQuery({ username: 'new-user' }), {
      onProgress: currentProgress,
    });
    oldArchives.resolve([]);

    await expect(old).resolves.toMatchObject({ status: 'cancelled' });
    await expect(current).resolves.toMatchObject({ status: 'complete' });
    expect(oldProgress).toHaveBeenCalledTimes(oldProgressCountAtSupersession);
    expect(currentProgress).toHaveBeenCalled();
  });

  it('uses cryptographically random job IDs when crypto.randomUUID is available', async () => {
    const manager = new IngestionManager(
      fakeDependencies({ fetchArchives: vi.fn().mockResolvedValue([]) })
    );
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');

    await expect(manager.start(makeQuery())).resolves.toMatchObject({
      jobId: '00000000-0000-4000-8000-000000000001',
    });
  });

  it('creates an RFC 4122 version 4 ID with secure random bytes as a fallback', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0);
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    try {
      expect(createJobId()).toBe('00000000-0000-4000-8000-000000000000');
      expect(getRandomValues).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
