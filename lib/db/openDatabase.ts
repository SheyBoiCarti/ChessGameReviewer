import { DB_NAME, SCHEMA_VERSION, STORES } from './schema';
import { extractPgnPlayers } from '../chess/pgnHeaders';
import { NORMALIZER_VERSION } from './schema';
import {
  DatabaseBlockedError,
  SchemaVersionError,
  StorageUnavailableError,
  wrapIDBError,
} from './errors';
import { checkSchemaCompatibility } from './retention';
import { setMeta } from './repositories';

export {
  DatabaseBlockedError,
  QuotaExceededError,
  SchemaVersionError,
  StorageUnavailableError,
  wrapIDBError,
} from './errors';

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

    let upgradeError: Error | null = null;

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = request.result;
      const tx = (event.target as IDBOpenDBRequest).transaction!;

      // Helper to safely ensure store and indexes exist
      const getOrCreateStore = (name: string, keyPath: string): IDBObjectStore | null => {
        if (upgradeError) return null;
        if (Array.from(db.objectStoreNames).includes(name)) {
          const store = tx.objectStore(name);
          if (store.keyPath !== keyPath) {
            upgradeError = new SchemaVersionError(
              `Store ${name} has incompatible keyPath. Reset the database.`
            );
            db.close();
            tx.abort();
            reject(upgradeError);
            return null;
          }
          return store;
        }
        return db.createObjectStore(name, { keyPath });
      };

      const ensureIndex = (
        store: IDBObjectStore | null,
        indexName: string,
        keyPath: string | string[]
      ) => {
        if (upgradeError || !store) return;
        const existingIndexes = Array.from(store.indexNames);
        if (existingIndexes.includes(indexName)) {
          const idx = store.index(indexName);
          const keyPathMatches =
            idx.keyPath === keyPath ||
            (Array.isArray(idx.keyPath) &&
              Array.isArray(keyPath) &&
              idx.keyPath.length === keyPath.length &&
              idx.keyPath.every((part, index) => part === keyPath[index]));
          if (!keyPathMatches) {
            upgradeError = new SchemaVersionError(
              `Index ${indexName} on store ${store.name} has incompatible keyPath. Reset the database.`
            );
            db.close();
            tx.abort();
            reject(upgradeError);
          }
        } else {
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
      ensureIndex(gamesStore, 'usernameEndedAt', ['username', 'endedAt']);
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
      ensureIndex(graphStore, 'lastUsedAt', 'lastUsedAt');

      // meta store
      if (!upgradeError && !Array.from(db.objectStoreNames).includes(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'name' });
      }

      // v2 -> v3 migration: backfill whitePlayer and blackPlayer on existing games
      if (!upgradeError && event.oldVersion > 0 && event.oldVersion < 3 && gamesStore) {
        try {
          const cursorReq = gamesStore.openCursor();
          cursorReq.onsuccess = () => {
            const cursor = cursorReq.result;
            if (!cursor) return;
            const record = cursor.value;
            if (!record.whitePlayer || !record.blackPlayer) {
              const pgnData =
                typeof record.pgn === 'string'
                  ? extractPgnPlayers(record.pgn)
                  : {
                      white: { username: null, rating: null },
                      black: { username: null, rating: null },
                    };

              const userColor = record.userColor === 'black' ? 'black' : 'white';
              const userRating =
                typeof record.userRating === 'number' && Number.isFinite(record.userRating)
                  ? record.userRating
                  : null;
              const opponentRating =
                typeof record.opponentRating === 'number' && Number.isFinite(record.opponentRating)
                  ? record.opponentRating
                  : null;

              const whiteUsername =
                pgnData.white.username ?? (userColor === 'white' ? record.username : null);
              const blackUsername =
                pgnData.black.username ?? (userColor === 'black' ? record.username : null);
              const whiteRating =
                pgnData.white.rating ?? (userColor === 'white' ? userRating : opponentRating);
              const blackRating =
                pgnData.black.rating ?? (userColor === 'black' ? userRating : opponentRating);

              const updatedRecord = {
                ...record,
                whitePlayer: {
                  username: whiteUsername,
                  rating: whiteRating,
                },
                blackPlayer: {
                  username: blackUsername,
                  rating: blackRating,
                },
              };
              cursor.update(updatedRecord);
            }
            cursor.continue();
          };
        } catch {
          // Non-blocking guard for cursor initialization errors during upgrade
        }
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
      if (request.result) {
        request.result.close();
      }
      if (upgradeError) {
        return reject(upgradeError);
      }
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

export async function initializeDatabaseMetadata(db: IDBDatabase): Promise<void> {
  const compatibility = await checkSchemaCompatibility(db);
  if (!compatibility.compatible) throw new SchemaVersionError();
  await setMeta(db, 'schemaVersion', SCHEMA_VERSION);
  await setMeta(db, 'normalizerVersion', NORMALIZER_VERSION);
}
