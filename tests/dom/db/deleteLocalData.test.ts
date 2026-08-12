import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, closeDatabase } from '../../../lib/db/openDatabase';
import { DB_NAME, GameRecord, ArchiveSyncRecord, GraphSnapshotRecord } from '../../../lib/db/schema';
import { saveSyncBatch, putGraphSnapshot, getGamesForUser, getArchiveSyncsForUser, getGraphSnapshot, setMeta, getMeta } from '../../../lib/db/repositories';
import { deleteUserData, clearAllData } from '../../../lib/db/deleteLocalData';

describe('deleteLocalData API', () => {
  let db: IDBDatabase;

  beforeEach(async () => {
    indexedDB.deleteDatabase(DB_NAME);
    db = await openDatabase();
  });

  afterEach(() => {
    if (db) closeDatabase(db);
  });

  describe('deleteUserData', () => {
    it('deletes all games, archiveSync, and graphSnapshots for a specific user and returns confirmation counts', async () => {
      const janeGame: GameRecord = {
        id: 'game-jane-1',
        username: 'janedoe',
        url: 'https://www.chess.com/game/live/1',
        userColor: 'white',
        result: 'win',
        endedAt: 1700000000,
        timeClass: 'blitz',
        rated: true,
        userRating: 1500,
        opponentRating: 1400,
        pgn: '1. e4 e5',
        rules: 'chess',
      };

      const johnGame: GameRecord = {
        id: 'game-john-1',
        username: 'johndoe',
        url: 'https://www.chess.com/game/live/2',
        userColor: 'black',
        result: 'loss',
        endedAt: 1700000000,
        timeClass: 'blitz',
        rated: true,
        userRating: 1200,
        opponentRating: 1300,
        pgn: '1. d4 d5',
        rules: 'chess',
      };

      const janeSync: ArchiveSyncRecord = {
        key: 'janedoe:2024-05',
        username: 'janedoe',
        month: '2024-05',
        lastSuccessfulFetchAt: 1700000000,
        status: 'success',
        observedGameIds: ['game-jane-1'],
        observedGameCount: 1,
        normalizerVersion: 1,
      };

      const johnSync: ArchiveSyncRecord = {
        key: 'johndoe:2024-05',
        username: 'johndoe',
        month: '2024-05',
        lastSuccessfulFetchAt: 1700000000,
        status: 'success',
        observedGameIds: ['game-john-1'],
        observedGameCount: 1,
        normalizerVersion: 1,
      };

      const janeSnap: GraphSnapshotRecord = {
        key: 'snap-jane',
        username: 'janedoe',
        createdAt: 1700000000,
        lastUsedAt: 1700000000,
        snapshotData: {},
        byteSize: 100,
      };

      await saveSyncBatch(db, [janeGame], janeSync);
      await saveSyncBatch(db, [johnGame], johnSync);
      await putGraphSnapshot(db, janeSnap);

      const result = await deleteUserData(db, 'JaneDoe'); // testing case insensitivity

      expect(result).toEqual({
        username: 'janedoe',
        gamesDeleted: 1,
        archiveSyncDeleted: 1,
        graphSnapshotsDeleted: 1,
      });

      // Verify Jane's data is gone
      expect(await getGamesForUser(db, 'janedoe')).toHaveLength(0);
      expect(await getArchiveSyncsForUser(db, 'janedoe')).toHaveLength(0);
      expect(await getGraphSnapshot(db, 'snap-jane')).toBeNull();

      // Verify John's data remains untouched
      expect(await getGamesForUser(db, 'johndoe')).toHaveLength(1);
      expect(await getArchiveSyncsForUser(db, 'johndoe')).toHaveLength(1);
    });
  });

  describe('clearAllData', () => {
    it('clears all data across all stores and confirms removed stores', async () => {
      await setMeta(db, 'testKey', 'testVal');

      const result = await clearAllData(db);

      expect(result.clearedStores).toEqual(
        expect.arrayContaining(['archiveSync', 'games', 'evaluations', 'graphSnapshots', 'meta'])
      );

      expect(await getMeta(db, 'testKey')).toBeNull();
    });
  });
});
