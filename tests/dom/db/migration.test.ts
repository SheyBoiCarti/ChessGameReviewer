import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, closeDatabase, SchemaVersionError } from '../../../lib/db/openDatabase';
import { DB_NAME, STORES } from '../../../lib/db/schema';

describe('Schema Migration & Upgrade', () => {
  beforeEach(() => {
    indexedDB.deleteDatabase(DB_NAME);
  });

  it('upgrades safely from an artificial prior database version and adds missing indexes to existing stores', async () => {
    // Create DB v1 with a games store lacking indexes
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(STORES.GAMES, { keyPath: 'id' });
        // intentionally omit indexes
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
        };
        db.close();
        setTimeout(resolve, 10);
      };
      req.onerror = () => reject(req.error);
    });

    // Open via openDatabase with current schema version
    const db = await openDatabase();

    expect(db.version).toBe(3);
    expect(db.objectStoreNames.contains(STORES.ARCHIVE_SYNC)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.GAMES)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.EVALUATIONS)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.GRAPH_SNAPSHOTS)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.META)).toBe(true);

    // Verify indexes were added to existing games store during upgrade
    const tx = db.transaction([STORES.GAMES], 'readonly');
    const gamesStore = tx.objectStore(STORES.GAMES);
    expect(Array.from(gamesStore.indexNames)).toEqual(
      expect.arrayContaining(['username', 'endedAt', 'usernameEndedAt', 'timeClass', 'userColor'])
    );

    closeDatabase(db);
  });

  it('migrates version 2 games store to version 3, backfilling whitePlayer and blackPlayer metadata defensively', async () => {
    // 1. Create a version 2 database and populate legacy records lacking whitePlayer/blackPlayer
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        const gamesStore = db.createObjectStore(STORES.GAMES, { keyPath: 'id' });
        gamesStore.createIndex('username', 'username', { unique: false });
        gamesStore.createIndex('endedAt', 'endedAt', { unique: false });
        gamesStore.createIndex('usernameEndedAt', ['username', 'endedAt'], { unique: false });
        gamesStore.createIndex('timeClass', 'timeClass', { unique: false });
        gamesStore.createIndex('userColor', 'userColor', { unique: false });

        db.createObjectStore(STORES.ARCHIVE_SYNC, { keyPath: 'key' });
        db.createObjectStore(STORES.EVALUATIONS, { keyPath: 'key' });
        db.createObjectStore(STORES.GRAPH_SNAPSHOTS, { keyPath: 'key' });
        db.createObjectStore(STORES.META, { keyPath: 'name' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction([STORES.GAMES], 'readwrite');
        const store = tx.objectStore(STORES.GAMES);

        // Record 1: Full headers, user is White
        store.put({
          id: 'game-1',
          username: 'magnus',
          url: 'https://www.chess.com/game/live/1',
          userColor: 'white',
          result: 'win',
          endedAt: 1700000000,
          timeClass: 'blitz',
          rated: true,
          userRating: 2850,
          opponentRating: 2800,
          pgn: '[White "MagnusCarlsen"]\n[Black "HikaruNakamura"]\n[WhiteElo "2850"]\n[BlackElo "2800"]\n\n1. e4 1-0',
          rules: 'chess',
        });

        // Record 2: Missing Black header, user is Black
        store.put({
          id: 'game-2',
          username: 'bob',
          url: 'https://www.chess.com/game/live/2',
          userColor: 'black',
          result: 'loss',
          endedAt: 1700001000,
          timeClass: 'rapid',
          rated: true,
          userRating: 1500,
          opponentRating: 1600,
          pgn: '[White "Alice"]\n[WhiteElo "1600"]\n\n1. d4 1-0',
          rules: 'chess',
        });

        // Record 3: Empty PGN, user is White
        store.put({
          id: 'game-3',
          username: 'charlie',
          url: 'https://www.chess.com/game/live/3',
          userColor: 'white',
          result: 'draw',
          endedAt: 1700002000,
          timeClass: 'daily',
          rated: false,
          userRating: null,
          opponentRating: null,
          pgn: '',
          rules: 'chess',
        });

        tx.oncomplete = () => {
          db.close();
          setTimeout(resolve, 10);
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // 2. Open via openDatabase (which triggers upgrade to SCHEMA_VERSION = 3)
    const db = await openDatabase();
    expect(db.version).toBe(3);

    // 3. Verify upgraded records
    const tx = db.transaction([STORES.GAMES], 'readonly');
    const store = tx.objectStore(STORES.GAMES);

    const g1 = await new Promise<any>((res) => {
      const req = store.get('game-1');
      req.onsuccess = () => res(req.result);
    });
    expect(g1.whitePlayer).toEqual({ username: 'MagnusCarlsen', rating: 2850 });
    expect(g1.blackPlayer).toEqual({ username: 'HikaruNakamura', rating: 2800 });

    const g2 = await new Promise<any>((res) => {
      const req = store.get('game-2');
      req.onsuccess = () => res(req.result);
    });
    expect(g2.whitePlayer).toEqual({ username: 'Alice', rating: 1600 });
    expect(g2.blackPlayer).toEqual({ username: 'bob', rating: 1500 });

    const g3 = await new Promise<any>((res) => {
      const req = store.get('game-3');
      req.onsuccess = () => res(req.result);
    });
    expect(g3.whitePlayer).toEqual({ username: 'charlie', rating: null });
    expect(g3.blackPlayer).toEqual({ username: null, rating: null });

    closeDatabase(db);
  });

  it('aborts a failed upgrade and surfaces a recoverable schema error', async () => {
    const name = 'Phase1IncompatibleUpgrade';
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORES.GAMES, { keyPath: 'wrongKey' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
    });

    await expect(openDatabase({ name, version: 2 })).rejects.toBeInstanceOf(SchemaVersionError);

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  });
});
