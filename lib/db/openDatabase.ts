import { DB_NAME, SCHEMA_VERSION, STORES } from './schema';

export class StorageUnavailableError extends Error {
  constructor(message = 'IndexedDB storage is unavailable or blocked.') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export class QuotaExceededError extends Error {
  constructor(message = 'Storage quota exceeded while writing to IndexedDB.') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

export class DatabaseBlockedError extends Error {
  constructor(message = 'Database upgrade is blocked by another open connection.') {
    super(message);
    this.name = 'DatabaseBlockedError';
  }
}

export class SchemaVersionError extends Error {
  constructor(message = 'Database schema version is incompatible.') {
    super(message);
    this.name = 'SchemaVersionError';
  }
}

export interface OpenDatabaseOptions {
  name?: string;
  version?: number;
  onBlocked?: () => void;
  onVersionChange?: (db: IDBDatabase) => void;
}

export function openDatabase(options: OpenDatabaseOptions = {}): Promise<IDBDatabase> {
  const name = options.name ?? DB_NAME;
  const version = options.version ?? SCHEMA_VERSION;

  return new Promise<IDBDatabase>((resolve, reject) => {
    let idb: IDBFactory;
    try {
      if (typeof indexedDB === 'undefined' || indexedDB === null) {
        return reject(new StorageUnavailableError());
      }
      idb = indexedDB;
    } catch {
      return reject(new StorageUnavailableError());
    }

    let request: IDBOpenDBRequest;
    try {
      request = idb.open(name, version);
    } catch (err) {
      return reject(wrapIDBError(err));
    }

    request.onblocked = () => {
      options.onBlocked?.();
      reject(new DatabaseBlockedError());
    };

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = request.result;
      const tx = (event.target as IDBOpenDBRequest).transaction!;

      // Helper to safely ensure store and indexes exist
      const getOrCreateStore = (
        name: string,
        keyPath: string
      ): IDBObjectStore => {
        if (Array.from(db.objectStoreNames).includes(name)) {
          return tx.objectStore(name);
        }
        return db.createObjectStore(name, { keyPath });
      };

      const ensureIndex = (
        store: IDBObjectStore,
        indexName: string,
        keyPath: string
      ) => {
        const existingIndexes = Array.from(store.indexNames);
        if (!existingIndexes.includes(indexName)) {
          store.createIndex(indexName, keyPath, { unique: false });
        }
      };

      // archiveSync store & indexes
      const archiveStore = getOrCreateStore(STORES.ARCHIVE_SYNC, 'key');
      ensureIndex(archiveStore, 'username', 'username');
      ensureIndex(archiveStore, 'month', 'month');
      ensureIndex(archiveStore, 'lastSuccessfulFetchAt', 'lastSuccessfulFetchAt');

      // games store & indexes
      const gamesStore = getOrCreateStore(STORES.GAMES, 'id');
      ensureIndex(gamesStore, 'username', 'username');
      ensureIndex(gamesStore, 'endedAt', 'endedAt');
      ensureIndex(gamesStore, 'timeClass', 'timeClass');
      ensureIndex(gamesStore, 'userColor', 'userColor');

      // evaluations store & indexes
      const evalStore = getOrCreateStore(STORES.EVALUATIONS, 'key');
      ensureIndex(evalStore, 'positionHash', 'positionHash');
      ensureIndex(evalStore, 'engineBuild', 'engineBuild');
      ensureIndex(evalStore, 'lastUsedAt', 'lastUsedAt');

      // graphSnapshots store & indexes
      const graphStore = getOrCreateStore(STORES.GRAPH_SNAPSHOTS, 'key');
      ensureIndex(graphStore, 'username', 'username');
      ensureIndex(graphStore, 'createdAt', 'createdAt');

      // meta store
      if (!Array.from(db.objectStoreNames).includes(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'name' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
        options.onVersionChange?.(db);
      };

      resolve(db);
    };

    request.onerror = (e) => {
      console.error('IDB open request.onerror:', request.error, e);
      reject(wrapIDBError(request.error));
    };
  });
}

export function closeDatabase(db: IDBDatabase): void {
  try {
    db.close();
  } catch {
    // Ignore close errors
  }
}

export function wrapIDBError(err: unknown): Error {
  if (err instanceof Error) {
    if (err.name === 'QuotaExceededError' || err.message.includes('Quota')) {
      return new QuotaExceededError(err.message);
    }
    if (
      err.name === 'InvalidStateError' ||
      err.name === 'SecurityError' ||
      err.name === 'UnknownError'
    ) {
      return new StorageUnavailableError(err.message);
    }
    return err;
  }
  if (typeof err === 'object' && err !== null) {
    const name = 'name' in err ? String((err as { name: unknown }).name) : '';
    const message = 'message' in err ? String((err as { message: unknown }).message) : '';
    if (name === 'QuotaExceededError' || message.includes('Quota')) {
      return new QuotaExceededError(message || undefined);
    }
    if (name === 'InvalidStateError' || name === 'SecurityError') {
      return new StorageUnavailableError(message || undefined);
    }
    if (message) {
      return new Error(message);
    }
  }
  return new StorageUnavailableError('IndexedDB operation failed.');
}
