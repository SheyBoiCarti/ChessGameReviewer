import { describe, it, expect, beforeEach } from 'vitest';
import { openDatabase, closeDatabase } from '../../../lib/db/openDatabase';
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

    // Open via openDatabase with version 2
    const db = await openDatabase({ version: 2 });

    expect(db.version).toBe(2);
    expect(db.objectStoreNames.contains(STORES.ARCHIVE_SYNC)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.GAMES)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.EVALUATIONS)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.GRAPH_SNAPSHOTS)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.META)).toBe(true);

    // Verify indexes were added to existing games store during upgrade
    const tx = db.transaction([STORES.GAMES], 'readonly');
    const gamesStore = tx.objectStore(STORES.GAMES);
    expect(Array.from(gamesStore.indexNames)).toEqual(
      expect.arrayContaining(['username', 'endedAt', 'timeClass', 'userColor'])
    );

    closeDatabase(db);
  });
});
