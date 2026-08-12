import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openDatabase, closeDatabase, StorageUnavailableError } from '../../../lib/db/openDatabase';
import { DB_NAME, STORES } from '../../../lib/db/schema';

describe('openDatabase', () => {
  beforeEach(() => {
    // Reset fakeIndexedDB between tests if needed
    indexedDB.deleteDatabase(DB_NAME);
  });

  it('opens IndexedDB database and initializes all V1 object stores and indexes', async () => {
    const db = await openDatabase();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(1);

    const storeNames = Array.from(db.objectStoreNames);
    expect(storeNames).toContain(STORES.ARCHIVE_SYNC);
    expect(storeNames).toContain(STORES.GAMES);
    expect(storeNames).toContain(STORES.EVALUATIONS);
    expect(storeNames).toContain(STORES.GRAPH_SNAPSHOTS);
    expect(storeNames).toContain(STORES.META);

    // Check transaction and indexes
    const tx = db.transaction([STORES.GAMES, STORES.ARCHIVE_SYNC], 'readonly');
    const gamesStore = tx.objectStore(STORES.GAMES);
    expect(gamesStore.keyPath).toBe('id');
    expect(Array.from(gamesStore.indexNames)).toEqual(
      expect.arrayContaining(['username', 'endedAt', 'timeClass', 'userColor'])
    );

    const archiveStore = tx.objectStore(STORES.ARCHIVE_SYNC);
    expect(archiveStore.keyPath).toBe('key');
    expect(Array.from(archiveStore.indexNames)).toEqual(
      expect.arrayContaining(['username', 'month', 'lastSuccessfulFetchAt'])
    );

    closeDatabase(db);
  });

  it('closes connection cleanly when versionchange occurs', async () => {
    const onVersionChangeSpy = vi.fn();
    const db = await openDatabase({ onVersionChange: onVersionChangeSpy });

    if (db.onversionchange) {
      db.onversionchange(new Event('versionchange') as IDBVersionChangeEvent);
    }

    expect(onVersionChangeSpy).toHaveBeenCalledWith(db);
  });

  it('throws StorageUnavailableError when indexedDB is undefined or throws on access', async () => {
    const originalIDB = globalThis.indexedDB;
    // @ts-expect-error simulating disabled indexedDB
    delete globalThis.indexedDB;

    await expect(openDatabase()).rejects.toThrow(StorageUnavailableError);

    globalThis.indexedDB = originalIDB;
  });
});
