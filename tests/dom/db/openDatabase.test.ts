import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  openDatabase,
  closeDatabase,
  initializeDatabaseMetadata,
  QuotaExceededError,
  SchemaVersionError,
  StorageUnavailableError,
  wrapIDBError,
} from '../../../lib/db/openDatabase';
import { DB_NAME, STORES, SCHEMA_VERSION } from '../../../lib/db/schema';
import { NORMALIZER_VERSION } from '../../../lib/db/schema';
import { getMeta, setMeta } from '../../../lib/db/repositories';

describe('openDatabase', () => {
  beforeEach(() => {
    // Reset fakeIndexedDB between tests if needed
    indexedDB.deleteDatabase(DB_NAME);
  });

  it('opens IndexedDB database and initializes all current object stores and indexes', async () => {
    const db = await openDatabase();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(SCHEMA_VERSION);

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
      expect.arrayContaining(['username', 'endedAt', 'usernameEndedAt', 'timeClass', 'userColor'])
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

  it('normalizes browser database failures without exposing raw errors', () => {
    const quotaByName = new Error('write failed');
    quotaByName.name = 'QuotaExceededError';
    expect(wrapIDBError(quotaByName)).toBeInstanceOf(QuotaExceededError);
    expect(wrapIDBError(new Error('Quota reached'))).toBeInstanceOf(QuotaExceededError);

    for (const name of ['InvalidStateError', 'SecurityError', 'UnknownError']) {
      const error = new Error('private browser detail');
      error.name = name;
      expect(wrapIDBError(error)).toBeInstanceOf(StorageUnavailableError);
    }

    expect(wrapIDBError({ name: 'QuotaExceededError' })).toBeInstanceOf(QuotaExceededError);
    expect(wrapIDBError({ message: 'Quota reached' })).toBeInstanceOf(QuotaExceededError);
    expect(wrapIDBError({ name: 'SecurityError' })).toBeInstanceOf(StorageUnavailableError);
    expect(wrapIDBError({})).toBeInstanceOf(StorageUnavailableError);
    expect(wrapIDBError('failure')).toBeInstanceOf(StorageUnavailableError);
  });

  it('initializes current schema and normalizer metadata after a compatible open', async () => {
    const db = await openDatabase();

    await initializeDatabaseMetadata(db);

    await expect(getMeta(db, 'schemaVersion')).resolves.toMatchObject({ value: SCHEMA_VERSION });
    await expect(getMeta(db, 'normalizerVersion')).resolves.toMatchObject({
      value: NORMALIZER_VERSION,
    });
    closeDatabase(db);
  });

  it('rejects a newer stored schema without overwriting its metadata', async () => {
    const db = await openDatabase();
    await setMeta(db, 'schemaVersion', SCHEMA_VERSION + 1);

    await expect(initializeDatabaseMetadata(db)).rejects.toBeInstanceOf(SchemaVersionError);
    await expect(getMeta(db, 'schemaVersion')).resolves.toMatchObject({
      value: SCHEMA_VERSION + 1,
    });
    closeDatabase(db);
  });

  it('ignores close errors during cleanup', () => {
    const db = {
      close: () => {
        throw new Error('already closed');
      },
    } as unknown as IDBDatabase;
    expect(() => closeDatabase(db)).not.toThrow();
  });
});
