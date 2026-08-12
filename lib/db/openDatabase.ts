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

    request.onupgradeneeded = (_event: IDBVersionChangeEvent) => {
      const db = request.result;

      // Create archiveSync store
      if (!db.objectStoreNames.contains(STORES.ARCHIVE_SYNC)) {
          const archiveStore = db.createObjectStore(STORES.ARCHIVE_SYNC, { keyPath: 'key' });
          archiveStore.createIndex('username', 'username', { unique: false });
          archiveStore.createIndex('month', 'month', { unique: false });
          archiveStore.createIndex('lastSuccessfulFetchAt', 'lastSuccessfulFetchAt', { unique: false });
        }

        // Create games store
        if (!db.objectStoreNames.contains(STORES.GAMES)) {
          const gamesStore = db.createObjectStore(STORES.GAMES, { keyPath: 'id' });
          gamesStore.createIndex('username', 'username', { unique: false });
          gamesStore.createIndex('endedAt', 'endedAt', { unique: false });
          gamesStore.createIndex('timeClass', 'timeClass', { unique: false });
          gamesStore.createIndex('userColor', 'userColor', { unique: false });
        }

        // Create evaluations store
        if (!db.objectStoreNames.contains(STORES.EVALUATIONS)) {
          const evalStore = db.createObjectStore(STORES.EVALUATIONS, { keyPath: 'key' });
          evalStore.createIndex('positionHash', 'positionHash', { unique: false });
          evalStore.createIndex('engineBuild', 'engineBuild', { unique: false });
          evalStore.createIndex('lastUsedAt', 'lastUsedAt', { unique: false });
        }

        // Create graphSnapshots store
        if (!db.objectStoreNames.contains(STORES.GRAPH_SNAPSHOTS)) {
          const graphStore = db.createObjectStore(STORES.GRAPH_SNAPSHOTS, { keyPath: 'key' });
          graphStore.createIndex('username', 'username', { unique: false });
          graphStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Create meta store
        if (!db.objectStoreNames.contains(STORES.META)) {
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

    request.onerror = () => {
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
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const name = String((err as { name: unknown }).name);
    if (name === 'QuotaExceededError') {
      return new QuotaExceededError();
    }
    if (name === 'InvalidStateError' || name === 'SecurityError') {
      return new StorageUnavailableError();
    }
  }
  return new StorageUnavailableError('IndexedDB operation failed.');
}
