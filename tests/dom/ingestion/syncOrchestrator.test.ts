import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDatabase, closeDatabase } from '../../../lib/db/openDatabase';
import { DB_NAME, NORMALIZER_VERSION, ArchiveSyncRecord, GameRecord } from '../../../lib/db/schema';
import { putArchiveSync, getArchiveSync, getGamesForUser } from '../../../lib/db/repositories';
import { syncOrchestrator, SyncProgressEvent, SyncResult } from '../../../lib/ingestion/syncOrchestrator';
import { RawChesscomGame } from '../../../lib/api/chesscomSchemas';
import { createPubApiError, createAbortError } from '../../../lib/api/errors';

describe('syncOrchestrator State Machine', () => {
  let db: IDBDatabase;

  beforeEach(async () => {
    indexedDB.deleteDatabase(DB_NAME);
    db = await openDatabase();
  });

  afterEach(() => {
    if (db) closeDatabase(db);
  });

  const mockArchives = [
    'https://api.chess.com/pub/player/janedoe/games/2026/07', // Completed month
    'https://api.chess.com/pub/player/janedoe/games/2026/08', // Current month
  ];

  const sampleRawGame1: RawChesscomGame = {
    url: 'https://www.chess.com/game/live/101',
    end_time: 1700000000,
    time_class: 'blitz',
    rules: 'chess',
    pgn: '1. e4 e5 2. Nf3 Nc6 1-0',
    rated: true,
    white: { username: 'janedoe', rating: 1500, result: 'win' },
    black: { username: 'opponent1', rating: 1450, result: 'checkmated' },
  };

  const sampleRawGame2: RawChesscomGame = {
    url: 'https://www.chess.com/game/live/102',
    end_time: 1700003000,
    time_class: 'rapid',
    rules: 'chess',
    pgn: '1. d4 d5 1/2-1/2',
    rated: false,
    white: { username: 'opponent2', rating: 1600, result: 'agreed' },
    black: { username: 'janedoe', rating: 1550, result: 'agreed' },
  };

  it('identifies missing/stale months and syncs them serially while yielding progress', async () => {
    const fetchArchivesFn = vi.fn().mockResolvedValue(mockArchives);
    const fetchMonthlyGamesFn = vi.fn().mockImplementation(async (_user, year, month) => {
      if (year === '2026' && month === '08') return [sampleRawGame1];
      if (year === '2026' && month === '07') return [sampleRawGame2];
      return [];
    });

    const mockNow = 1700000000000; // Mock current time
    const events: SyncProgressEvent[] = [];

    const gen = syncOrchestrator(db, 'janedoe', {
      fetchArchivesFn,
      fetchMonthlyGamesFn,
      now: () => mockNow,
    });

    let res = await gen.next();
    while (!res.done) {
      events.push(res.value);
      res = await gen.next();
    }

    const finalResult: SyncResult = res.value;

    expect(fetchArchivesFn).toHaveBeenCalledWith('janedoe', expect.anything());
    expect(fetchMonthlyGamesFn).toHaveBeenCalledTimes(2);

    expect(finalResult.username).toBe('janedoe');
    expect(finalResult.syncedMonthsCount).toBe(2);
    expect(finalResult.totalGamesSynced).toBe(2);

    // Verify progress events
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.phase === 'fetching_archives')).toBe(true);
    expect(events.some((e) => e.phase === 'processing_month')).toBe(true);
    expect(events.some((e) => e.phase === 'month_complete')).toBe(true);

    // Verify stored games in IndexedDB
    const janeGames = await getGamesForUser(db, 'janedoe');
    expect(janeGames).toHaveLength(2);

    // Verify archiveSync markers stored in IndexedDB
    const syncAug = await getArchiveSync(db, 'janedoe', '2026-08');
    expect(syncAug?.status).toBe('success');
    expect(syncAug?.observedGameCount).toBe(1);

    const syncJul = await getArchiveSync(db, 'janedoe', '2026-07');
    expect(syncJul?.status).toBe('success');
    expect(syncJul?.observedGameCount).toBe(1);
  });

  it('skips fresh months according to staleness rules', async () => {
    // Current UTC date for test: suppose current month is 2026-08
    const mockNow = new Date(Date.UTC(2026, 7, 12, 10, 0, 0)).getTime(); // Aug 12, 2026

    // Pre-populate 2026-07 (past month) as fresh (fetched 5 days ago < 30 days)
    const freshPastRecord: ArchiveSyncRecord = {
      key: 'janedoe:2026-07',
      username: 'janedoe',
      month: '2026-07',
      lastSuccessfulFetchAt: mockNow - 5 * 24 * 60 * 60 * 1000,
      status: 'success',
      observedGameIds: ['game-jul'],
      observedGameCount: 1,
      normalizerVersion: NORMALIZER_VERSION,
    };
    await putArchiveSync(db, freshPastRecord);

    // Pre-populate 2026-08 (current month) as fresh (fetched 5 mins ago < 15 mins)
    const freshCurrentRecord: ArchiveSyncRecord = {
      key: 'janedoe:2026-08',
      username: 'janedoe',
      month: '2026-08',
      lastSuccessfulFetchAt: mockNow - 5 * 60 * 1000,
      status: 'success',
      observedGameIds: ['game-aug'],
      observedGameCount: 1,
      normalizerVersion: NORMALIZER_VERSION,
    };
    await putArchiveSync(db, freshCurrentRecord);

    const fetchArchivesFn = vi.fn().mockResolvedValue(mockArchives);
    const fetchMonthlyGamesFn = vi.fn();

    const gen = syncOrchestrator(db, 'janedoe', {
      fetchArchivesFn,
      fetchMonthlyGamesFn,
      now: () => mockNow,
    });

    let res = await gen.next();
    while (!res.done) {
      res = await gen.next();
    }

    const finalResult: SyncResult = res.value;

    expect(fetchArchivesFn).toHaveBeenCalledTimes(1);
    expect(fetchMonthlyGamesFn).not.toHaveBeenCalled(); // BOTH months skipped as fresh!
    expect(finalResult.syncedMonthsCount).toBe(0);
  });

  it('re-fetches current month if older than 15 minutes', async () => {
    const mockNow = new Date(Date.UTC(2026, 7, 12, 10, 0, 0)).getTime();

    // Pre-populate 2026-08 (current month) as stale (fetched 20 mins ago > 15 mins)
    const staleCurrentRecord: ArchiveSyncRecord = {
      key: 'janedoe:2026-08',
      username: 'janedoe',
      month: '2026-08',
      lastSuccessfulFetchAt: mockNow - 20 * 60 * 1000,
      status: 'success',
      observedGameIds: [],
      observedGameCount: 0,
      normalizerVersion: NORMALIZER_VERSION,
    };
    await putArchiveSync(db, staleCurrentRecord);

    const fetchArchivesFn = vi.fn().mockResolvedValue(['https://api.chess.com/pub/player/janedoe/games/2026/08']);
    const fetchMonthlyGamesFn = vi.fn().mockResolvedValue([sampleRawGame1]);

    const gen = syncOrchestrator(db, 'janedoe', {
      fetchArchivesFn,
      fetchMonthlyGamesFn,
      now: () => mockNow,
    });

    let res = await gen.next();
    while (!res.done) {
      res = await gen.next();
    }

    expect(fetchMonthlyGamesFn).toHaveBeenCalledWith('janedoe', '2026', '08', expect.anything());
    expect(res.value.syncedMonthsCount).toBe(1);
  });

  it('normalizes games and maps unknown result tokens to diagnostics while skipping them', async () => {
    const invalidTokenGame: RawChesscomGame = {
      url: 'https://www.chess.com/game/live/999',
      end_time: 1700000000,
      time_class: 'blitz',
      rules: 'chess',
      white: { username: 'janedoe', rating: 1500, result: 'unknown_token_123' },
      black: { username: 'opponent', rating: 1400, result: 'checkmated' },
    };

    const fetchArchivesFn = vi.fn().mockResolvedValue(['https://api.chess.com/pub/player/janedoe/games/2026/08']);
    const fetchMonthlyGamesFn = vi.fn().mockResolvedValue([sampleRawGame1, invalidTokenGame]);

    const gen = syncOrchestrator(db, 'janedoe', {
      fetchArchivesFn,
      fetchMonthlyGamesFn,
    });

    let res = await gen.next();
    while (!res.done) {
      res = await gen.next();
    }

    const result: SyncResult = res.value;
    expect(result.totalGamesSynced).toBe(1); // Only sampleRawGame1 synced
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('UNKNOWN_RESULT_TOKEN');

    const games = await getGamesForUser(db, 'janedoe');
    expect(games).toHaveLength(1);
    expect(games[0]?.id).toBe(sampleRawGame1.url);
  });

  it('propagates 429 rate limit error immediately without marking month as complete', async () => {
    const rateLimitErr = createPubApiError('UPSTREAM_RATE_LIMITED', 'Rate limit 429', true, 429);
    const fetchArchivesFn = vi.fn().mockResolvedValue(['https://api.chess.com/pub/player/janedoe/games/2026/08']);
    const fetchMonthlyGamesFn = vi.fn().mockRejectedValue(rateLimitErr);

    const gen = syncOrchestrator(db, 'janedoe', {
      fetchArchivesFn,
      fetchMonthlyGamesFn,
    });

    await expect(async () => {
      let res = await gen.next();
      while (!res.done) {
        res = await gen.next();
      }
    }).rejects.toThrow('Rate limit 429');

    // Verify month marker was NOT created
    const syncMarker = await getArchiveSync(db, 'janedoe', '2026-08');
    expect(syncMarker).toBeNull();
  });

  it('respects AbortSignal and aborts sync immediately without committing batch', async () => {
    const controller = new AbortController();

    const fetchArchivesFn = vi.fn().mockResolvedValue(['https://api.chess.com/pub/player/janedoe/games/2026/08']);
    const fetchMonthlyGamesFn = vi.fn().mockImplementation(async () => {
      controller.abort(); // Abort during fetch
      throw createAbortError();
    });

    const gen = syncOrchestrator(db, 'janedoe', {
      signal: controller.signal,
      fetchArchivesFn,
      fetchMonthlyGamesFn,
    });

    await expect(async () => {
      let res = await gen.next();
      while (!res.done) {
        res = await gen.next();
      }
    }).rejects.toThrow();

    // Verify month marker was NOT created
    const syncMarker = await getArchiveSync(db, 'janedoe', '2026-08');
    expect(syncMarker).toBeNull();
  });
});
