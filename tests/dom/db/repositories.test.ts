import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, closeDatabase, QuotaExceededError } from '../../../lib/db/openDatabase';
import { DB_NAME, STORES, ArchiveSyncRecord, GameRecord, EvaluationRecord, GraphSnapshotRecord } from '../../../lib/db/schema';
import {
  getArchiveSync,
  getArchiveSyncsForUser,
  putArchiveSync,
  getGame,
  getGamesForUser,
  upsertGames,
  saveSyncBatch,
  getEvaluation,
  putEvaluation,
  getGraphSnapshot,
  putGraphSnapshot,
  getMeta,
  setMeta,
  getGamesForMonth,
  getArchiveListMeta,
  putArchiveListMeta,
} from '../../../lib/db/repositories';

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function makeGameRecord(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: 'https://www.chess.com/game/live/10001',
    username: 'janedoe',
    url: 'https://www.chess.com/game/live/10001',
    userColor: 'white',
    result: 'win',
    endedAt: 1700000000,
    timeClass: 'blitz',
    rated: true,
    userRating: 1500,
    opponentRating: 1480,
    pgn: '1. e4 e5 2. Nf3 Nc6',
    rules: 'chess',
    ...overrides,
  };
}


describe('Repositories & Atomic Transactions', () => {
  let db: IDBDatabase;

  beforeEach(async () => {
    indexedDB.deleteDatabase(DB_NAME);
    db = await openDatabase();
  });

  afterEach(() => {
    if (db) closeDatabase(db);
  });

  describe('ArchiveSync Repository', () => {
    it('saves and retrieves archiveSync records', async () => {
      const syncRecord: ArchiveSyncRecord = {
        key: 'janedoe:2024-05',
        username: 'janedoe',
        month: '2024-05',
        lastSuccessfulFetchAt: 1700000000000,
        status: 'success',
        observedGameIds: ['game-1'],
        observedGameCount: 1,
        normalizerVersion: 1,
      };

      await putArchiveSync(db, syncRecord);
      const retrieved = await getArchiveSync(db, 'janedoe', '2024-05');
      expect(retrieved).toEqual(syncRecord);

      const allForUser = await getArchiveSyncsForUser(db, 'janedoe');
      expect(allForUser).toHaveLength(1);
      expect(allForUser[0]).toEqual(syncRecord);
    });

    it('returns null for non-existent archiveSync', async () => {
      const retrieved = await getArchiveSync(db, 'nobody', '2024-01');
      expect(retrieved).toBeNull();
    });
  });

  describe('Games Repository', () => {
    const sampleGame: GameRecord = {
      id: 'https://www.chess.com/game/live/10001',
      username: 'janedoe',
      url: 'https://www.chess.com/game/live/10001',
      userColor: 'white',
      result: 'win',
      endedAt: 1700000000,
      timeClass: 'blitz',
      rated: true,
      userRating: 1500,
      opponentRating: 1480,
      pgn: '1. e4 e5 2. Nf3 Nc6',
      rules: 'chess',
    };

    it('upserts games idempotently by stable ID', async () => {
      await upsertGames(db, [sampleGame]);
      let retrieved = await getGame(db, sampleGame.id);
      expect(retrieved).toEqual(sampleGame);

      // Re-upsert updated rating (same ID)
      const updatedGame = { ...sampleGame, userRating: 1510 };
      await upsertGames(db, [updatedGame]);

      retrieved = await getGame(db, sampleGame.id);
      expect(retrieved?.userRating).toBe(1510);

      const userGames = await getGamesForUser(db, 'janedoe');
      expect(userGames).toHaveLength(1); // Not duplicated
    });

    it('retrieves games for a specific user', async () => {
      const game2: GameRecord = {
        ...sampleGame,
        id: 'https://www.chess.com/game/live/10002',
        username: 'otheruser',
      };

      await upsertGames(db, [sampleGame, game2]);

      const janeGames = await getGamesForUser(db, 'janedoe');
      expect(janeGames).toHaveLength(1);
      expect(janeGames[0]?.id).toBe(sampleGame.id);
    });

    it('loads only games in the requested UTC month', async () => {
      const julyGame = makeGameRecord({
        id: 'july',
        endedAt: Date.UTC(2026, 6, 15) / 1000,
      });
      const augustGame = makeGameRecord({
        id: 'august',
        endedAt: Date.UTC(2026, 7, 15) / 1000,
      });
      await upsertGames(db, [julyGame, augustGame]);
      await expect(getGamesForMonth(db, 'JaneDoe', '2026-08')).resolves.toEqual([augustGame]);
    });
  });

  describe('saveSyncBatch Atomic Multi-Store Transaction', () => {
    it('commits game upserts and sync marker in ONE transaction', async () => {
      const game: GameRecord = {
        id: 'game-100',
        username: 'janedoe',
        url: 'https://www.chess.com/game/live/100',
        userColor: 'black',
        result: 'draw',
        endedAt: 1700001000,
        timeClass: 'rapid',
        rated: false,
        userRating: null,
        opponentRating: null,
        pgn: '1. d4 d5 1/2-1/2',
        rules: 'chess',
      };

      const syncMarker: ArchiveSyncRecord = {
        key: 'janedoe:2024-06',
        username: 'janedoe',
        month: '2024-06',
        lastSuccessfulFetchAt: 1700001050,
        status: 'success',
        observedGameIds: ['game-100'],
        observedGameCount: 1,
        normalizerVersion: 1,
      };

      await saveSyncBatch(db, [game], syncMarker);

      const savedGame = await getGame(db, 'game-100');
      const savedSync = await getArchiveSync(db, 'janedoe', '2024-06');

      expect(savedGame).toEqual(game);
      expect(savedSync).toEqual(syncMarker);
    });

    it('rolls back completely if game validation fails or transaction aborts', async () => {
      const invalidGame = {
        id: 'bad-game',
        username: 'janedoe',
        // missing required fields: userColor, result, pgn, etc.
      } as unknown as GameRecord;

      const syncMarker: ArchiveSyncRecord = {
        key: 'janedoe:2024-07',
        username: 'janedoe',
        month: '2024-07',
        lastSuccessfulFetchAt: 1700002000,
        status: 'success',
        observedGameIds: ['bad-game'],
        observedGameCount: 1,
        normalizerVersion: 1,
      };

      await expect(saveSyncBatch(db, [invalidGame], syncMarker)).rejects.toThrow();

      // Verify NEITHER game nor sync marker persisted
      const savedGame = await getGame(db, 'bad-game');
      const savedSync = await getArchiveSync(db, 'janedoe', '2024-07');
      expect(savedGame).toBeNull();
      expect(savedSync).toBeNull();
    });

    it('writes neither games nor marker if aborted before transaction commits', async () => {
      const game = makeGameRecord({ id: 'game-abort-test' });
      const syncMarker: ArchiveSyncRecord = {
        key: 'janedoe:2024-08',
        username: 'janedoe',
        month: '2024-08',
        lastSuccessfulFetchAt: 1700003000,
        status: 'success',
        observedGameIds: ['game-abort-test'],
        observedGameCount: 1,
        normalizerVersion: 1,
      };

      const controller = new AbortController();
      controller.abort(new Error('Already aborted'));

      await expect(saveSyncBatch(db, [game], syncMarker, controller.signal)).rejects.toThrow();

      expect(await getGame(db, 'game-abort-test')).toBeNull();
      expect(await getArchiveSync(db, 'janedoe', '2024-08')).toBeNull();
    });
  });

  describe('Evaluations & Graph Snapshots Repositories', () => {
    it('saves and reads evaluations', async () => {
      const evalRecord: EvaluationRecord = {
        key: 'fen_123:stockfish-16',
        positionHash: 'fen_123',
        engineBuild: 'stockfish-16',
        lastUsedAt: 1700000000,
        evaluation: { score: 0.45 },
      };

      await putEvaluation(db, evalRecord);
      const retrieved = await getEvaluation(db, evalRecord.key);
      expect(retrieved).toEqual(evalRecord);
    });

    it('saves and reads graph snapshots', async () => {
      const graphRecord: GraphSnapshotRecord = {
        key: 'graph_janedoe_q1',
        username: 'janedoe',
        createdAt: 1700000000,
        lastUsedAt: 1700000000,
        snapshotData: { data: 'test' },
        byteSize: 256,
      };

      await putGraphSnapshot(db, graphRecord);
      const retrieved = await getGraphSnapshot(db, graphRecord.key);
      expect(retrieved).toEqual(graphRecord);
    });
  });

  describe('Meta Repository', () => {
    it('sets and gets metadata values', async () => {
      await setMeta(db, 'schemaVersion', 1);
      const meta = await getMeta(db, 'schemaVersion');
      expect(meta).not.toBeNull();
      expect(meta?.value).toBe(1);
    });

    it('round-trips normalized archive-list metadata without PGN or raw payloads', async () => {
      const record = {
        username: 'janedoe',
        months: ['2026-08', '2026-07'],
        fetchedAt: 123,
      };
      await putArchiveListMeta(db, record);
      expect(await getArchiveListMeta(db, 'janedoe')).toEqual(record);
      expect(JSON.stringify(record)).not.toMatch(/pgn|rawMonthly/i);
    });
  });

  describe('PGN Storage Isolation Proof', () => {
    it('proves PGN exists ONLY in games store and never in archiveSync or meta', async () => {
      const game: GameRecord = {
        id: 'game-pgn-test',
        username: 'janedoe',
        url: 'https://www.chess.com/game/live/9999',
        userColor: 'white',
        result: 'win',
        endedAt: 1700000000,
        timeClass: 'blitz',
        rated: true,
        userRating: 1500,
        opponentRating: 1400,
        pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0',
        rules: 'chess',
      };

      const syncMarker: ArchiveSyncRecord = {
        key: 'janedoe:2024-08',
        username: 'janedoe',
        month: '2024-08',
        lastSuccessfulFetchAt: 1700000000,
        status: 'success',
        observedGameIds: [game.id],
        observedGameCount: 1,
        normalizerVersion: 1,
      };

      await saveSyncBatch(db, [game], syncMarker);
      await setMeta(db, 'archiveList:janedoe', ['2024-08']);

      // Check archiveSync raw record in IDB
      const tx = db.transaction([STORES.ARCHIVE_SYNC, STORES.META], 'readonly');
      const rawSync = await new Promise((resolve) => {
        const req = tx.objectStore(STORES.ARCHIVE_SYNC).get(syncMarker.key);
        req.onsuccess = () => resolve(req.result);
      });
      expect(rawSync).not.toHaveProperty('pgn');

      const rawMeta = await new Promise((resolve) => {
        const req = tx.objectStore(STORES.META).get('archiveList:janedoe');
        req.onsuccess = () => resolve(req.result);
      });
      expect(rawMeta).not.toHaveProperty('pgn');
    });
  });

  describe('Invalid Record Handling', () => {

    it('surfaces corrupt persisted records rather than silently dropping them', async () => {
      const tx = db.transaction(STORES.GAMES, 'readwrite');
      tx.objectStore(STORES.GAMES).put({
        ...makeGameRecord(),
        id: 'corrupt',
        endedAt: Number.NaN,
      });
      await transactionDone(tx);
      await expect(getGamesForUser(db, 'janedoe')).rejects.toMatchObject({
        name: 'CorruptRecordError',
      });
    });
  });

  describe('QuotaExceededError In-Memory Preservation', () => {
    it('preserves in-memory game records intact when storage quota is exceeded during write', async () => {
      const inMemoryGames: GameRecord[] = [
        {
          id: 'quota-game-1',
          username: 'janedoe',
          url: 'https://www.chess.com/game/live/1',
          userColor: 'white',
          result: 'win',
          endedAt: 1700000000,
          timeClass: 'blitz',
          rated: true,
          userRating: 1500,
          opponentRating: 1450,
          pgn: '1. e4 e5',
          rules: 'chess',
        },
      ];

      const syncMarker: ArchiveSyncRecord = {
        key: 'janedoe:2024-09',
        username: 'janedoe',
        month: '2024-09',
        lastSuccessfulFetchAt: 1700000000,
        status: 'success',
        observedGameIds: ['quota-game-1'],
        observedGameCount: 1,
        normalizerVersion: 1,
      };

      // Mock transaction to throw QuotaExceededError
      const quotaDomErr = new DOMException('QuotaExceededError', 'QuotaExceededError');
      const originalTx = db.transaction.bind(db);
      db.transaction = () => {
        const txMock = {
          objectStore: () => ({
            put: () => {
              throw quotaDomErr;
            },
          }),
          oncomplete: null,
          onerror: null as ((ev?: Event) => void) | null,
          onabort: null,
          error: quotaDomErr,
        };
        setTimeout(() => {
          if (txMock.onerror) txMock.onerror();
        }, 0);
        return txMock as unknown as IDBTransaction;
      };

      let caughtError: unknown;
      try {
        await saveSyncBatch(db, inMemoryGames, syncMarker);
      } catch (err) {
        caughtError = err;
      }

      db.transaction = originalTx;

      expect(caughtError).toBeInstanceOf(QuotaExceededError);

      // Verify in-memory records preserved without corruption
      expect(inMemoryGames).toHaveLength(1);
      expect(inMemoryGames[0]?.id).toBe('quota-game-1');
      expect(syncMarker.key).toBe('janedoe:2024-09');
    });
  });
});
