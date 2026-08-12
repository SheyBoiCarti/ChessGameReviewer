import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, closeDatabase, SchemaVersionError } from '../../../lib/db/openDatabase';
import { DB_NAME, STORES } from '../../../lib/db/schema';

describe('Schema Migration & Upgrade', () => {
  beforeEach(() => {
    indexedDB.deleteDatabase(DB_NAME);
  });

  it('upgrades safely from an artificial prior database version', async () => {
    // Create an artificial V0 database (only old games store, no archiveSync or meta)
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        // Old structure missing required v1 stores/indexes
        db.createObjectStore('legacyStore');
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    // Delete DB to simulate version upgrade cleanly
    indexedDB.deleteDatabase(DB_NAME);

    // Create DB with partial stores
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(STORES.GAMES, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    // Now open via our openDatabase helper (which should upgrade or ensure missing stores exist)
    // For openDatabase to trigger onupgradeneeded, target version must be > existing version.
    // If existing version is 1, let's open version 2 or test upgrade handling.
    const db = await openDatabase({ version: 2 });

    expect(db.version).toBe(2);
    expect(db.objectStoreNames.contains(STORES.ARCHIVE_SYNC)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.GAMES)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.EVALUATIONS)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.GRAPH_SNAPSHOTS)).toBe(true);
    expect(db.objectStoreNames.contains(STORES.META)).toBe(true);

    closeDatabase(db);
  });
});
