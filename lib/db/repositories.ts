import {
  STORES,
  ArchiveSyncRecord,
  GameRecord,
  EvaluationRecord,
  GraphSnapshotRecord,
  MetaRecord,
  isValidArchiveSyncRecord,
  isValidGameRecord,
  isValidEvaluationRecord,
  isValidGraphSnapshotRecord,
  isValidMetaRecord,
  StoreName,
} from './schema';
import { wrapIDBError } from './errors';
import { throwIfAborted } from '../api/errors';

export interface ArchiveListMeta {
  username: string;
  months: string[];
  fetchedAt: number;
}

export class CorruptRecordError extends Error {
  readonly store: StoreName;
  constructor(store: StoreName) {
    super(`Stored ${store} data is incompatible. Clear local data and retry.`);
    this.name = 'CorruptRecordError';
    this.store = store;
  }
}

// Helper to run a promise on IDBRequest
function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(wrapIDBError(req.error));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(wrapIDBError(tx.error));
    tx.onabort = () => reject(wrapIDBError(tx.error));
  });
}

// ArchiveSync Repository
export async function getArchiveSync(
  db: IDBDatabase,
  username: string,
  month: string
): Promise<ArchiveSyncRecord | null> {
  const key = `${username.toLowerCase()}:${month}`;
  const tx = db.transaction([STORES.ARCHIVE_SYNC], 'readonly');
  const store = tx.objectStore(STORES.ARCHIVE_SYNC);
  const result = await reqToPromise(store.get(key));

  if (!result) return null;
  if (!isValidArchiveSyncRecord(result)) {
    throw new CorruptRecordError(STORES.ARCHIVE_SYNC);
  }
  return result;
}

export async function getArchiveSyncsForUser(
  db: IDBDatabase,
  username: string
): Promise<ArchiveSyncRecord[]> {
  const normUsername = username.toLowerCase();
  const tx = db.transaction([STORES.ARCHIVE_SYNC], 'readonly');
  const store = tx.objectStore(STORES.ARCHIVE_SYNC);
  const index = store.index('username');
  const results = await reqToPromise(index.getAll(normUsername));

  if (!Array.isArray(results)) return [];
  for (const result of results) {
    if (!isValidArchiveSyncRecord(result)) {
      throw new CorruptRecordError(STORES.ARCHIVE_SYNC);
    }
  }
  return results;
}

export async function putArchiveSync(db: IDBDatabase, record: ArchiveSyncRecord): Promise<void> {
  if (!isValidArchiveSyncRecord(record)) {
    throw new Error('Invalid ArchiveSyncRecord provided to putArchiveSync.');
  }
  const tx = db.transaction([STORES.ARCHIVE_SYNC], 'readwrite');
  const store = tx.objectStore(STORES.ARCHIVE_SYNC);
  store.put(record);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(wrapIDBError(tx.error));
    tx.onabort = () => reject(wrapIDBError(tx.error));
  });
}

// Games Repository
export async function getGame(db: IDBDatabase, id: string): Promise<GameRecord | null> {
  const tx = db.transaction([STORES.GAMES], 'readonly');
  const store = tx.objectStore(STORES.GAMES);
  const result = await reqToPromise(store.get(id));

  if (!result) return null;
  if (!isValidGameRecord(result)) {
    throw new CorruptRecordError(STORES.GAMES);
  }
  return result;
}

export async function getGamesForUser(db: IDBDatabase, username: string): Promise<GameRecord[]> {
  const normUsername = username.toLowerCase();
  const tx = db.transaction([STORES.GAMES], 'readonly');
  const store = tx.objectStore(STORES.GAMES);
  const index = store.index('username');
  const results = await reqToPromise(index.getAll(normUsername));

  if (!Array.isArray(results)) return [];
  for (const result of results) {
    if (!isValidGameRecord(result)) {
      throw new CorruptRecordError(STORES.GAMES);
    }
  }
  return results;
}

export async function getGamesForMonth(
  db: IDBDatabase,
  username: string,
  month: string
): Promise<GameRecord[]> {
  const normUsername = username.toLowerCase();
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) return [];

  const targetYear = Number(match[1]);
  const targetMonth = Number(match[2]) - 1; // 0-indexed months in UTC
  const monthStart = Date.UTC(targetYear, targetMonth, 1) / 1000;
  const nextMonthStart = Date.UTC(targetYear, targetMonth + 1, 1) / 1000;
  const tx = db.transaction([STORES.GAMES], 'readonly');
  const store = tx.objectStore(STORES.GAMES);
  const index = store.index('usernameEndedAt');
  const monthRange = IDBKeyRange.bound(
    [normUsername, monthStart],
    [normUsername, nextMonthStart],
    false,
    true
  );
  const results = await reqToPromise(index.getAll(monthRange));

  if (!Array.isArray(results)) return [];

  const validRecords: GameRecord[] = [];
  for (const record of results) {
    if (!isValidGameRecord(record)) {
      throw new CorruptRecordError(STORES.GAMES);
    }
    validRecords.push(record);
  }
  return validRecords;
}

export async function upsertGames(db: IDBDatabase, games: GameRecord[]): Promise<void> {
  for (const game of games) {
    if (!isValidGameRecord(game)) {
      throw new Error(
        `Invalid GameRecord provided to upsertGames (id: ${(game as GameRecord)?.id})`
      );
    }
  }

  const tx = db.transaction([STORES.GAMES], 'readwrite');
  const store = tx.objectStore(STORES.GAMES);
  for (const game of games) {
    store.put(game);
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(wrapIDBError(tx.error));
    tx.onabort = () => reject(wrapIDBError(tx.error));
  });
}

/**
 * Atomically save games and the associated archiveSync marker in ONE transaction.
 * If any game fails validation or transaction aborts, neither games nor sync marker persist.
 */
export async function saveSyncBatch(
  db: IDBDatabase,
  games: GameRecord[],
  syncRecord: ArchiveSyncRecord,
  signal?: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  // Pre-validate inputs before initiating transaction
  if (!isValidArchiveSyncRecord(syncRecord)) {
    throw new Error('Invalid ArchiveSyncRecord in saveSyncBatch');
  }
  for (const game of games) {
    if (!isValidGameRecord(game)) {
      throw new Error(`Invalid GameRecord in saveSyncBatch (id: ${(game as GameRecord)?.id})`);
    }
  }

  try {
    const tx = db.transaction([STORES.GAMES, STORES.ARCHIVE_SYNC], 'readwrite');
    const gamesStore = tx.objectStore(STORES.GAMES);
    const syncStore = tx.objectStore(STORES.ARCHIVE_SYNC);

    for (const game of games) {
      gamesStore.put(game);
    }
    syncStore.put(syncRecord);

    const abortHandler = () => tx.abort();
    if (signal) {
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => {
        if (signal) signal.removeEventListener('abort', abortHandler);
        resolve();
      };
      tx.onerror = () => {
        if (signal) signal.removeEventListener('abort', abortHandler);
        reject(wrapIDBError(tx.error));
      };
      tx.onabort = () => {
        if (signal) signal.removeEventListener('abort', abortHandler);
        reject(wrapIDBError(tx.error));
      };
    });
  } catch (err) {
    throw wrapIDBError(err);
  }
}

// Evaluations Repository
export async function getEvaluation(
  db: IDBDatabase,
  key: string
): Promise<EvaluationRecord | null> {
  const tx = db.transaction([STORES.EVALUATIONS], 'readonly');
  const store = tx.objectStore(STORES.EVALUATIONS);
  const result = await reqToPromise(store.get(key));

  if (!result) return null;
  if (!isValidEvaluationRecord(result)) {
    throw new CorruptRecordError(STORES.EVALUATIONS);
  }
  return result;
}

export async function putEvaluation(db: IDBDatabase, record: EvaluationRecord): Promise<void> {
  if (!isValidEvaluationRecord(record)) {
    throw new Error('Invalid EvaluationRecord provided to putEvaluation');
  }

  const tx = db.transaction([STORES.EVALUATIONS], 'readwrite');
  const store = tx.objectStore(STORES.EVALUATIONS);
  store.put(record);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(wrapIDBError(tx.error));
    tx.onabort = () => reject(wrapIDBError(tx.error));
  });
}

export async function touchEvaluation(
  db: IDBDatabase,
  key: string,
  lastUsedAt: number
): Promise<boolean> {
  if (!Number.isFinite(lastUsedAt)) throw new TypeError('lastUsedAt must be finite.');
  const tx = db.transaction([STORES.EVALUATIONS], 'readwrite');
  const store = tx.objectStore(STORES.EVALUATIONS);
  const existing: unknown = await reqToPromise(store.get(key));
  if (existing !== undefined) {
    if (!isValidEvaluationRecord(existing)) throw new CorruptRecordError(STORES.EVALUATIONS);
    store.put({ ...existing, lastUsedAt });
  }
  await transactionDone(tx);
  return existing !== undefined;
}

export async function countEvaluations(db: IDBDatabase): Promise<number> {
  const tx = db.transaction([STORES.EVALUATIONS], 'readonly');
  const count = await reqToPromise(tx.objectStore(STORES.EVALUATIONS).count());
  await transactionDone(tx);
  return count;
}

export async function putEvaluationWithRetention(
  db: IDBDatabase,
  record: EvaluationRecord,
  maxCount: number
): Promise<void> {
  if (!isValidEvaluationRecord(record)) {
    throw new Error('Invalid EvaluationRecord provided to putEvaluationWithRetention');
  }
  if (!Number.isInteger(maxCount) || maxCount < 0) {
    throw new TypeError('maxCount must be a non-negative integer.');
  }

  const tx = db.transaction([STORES.EVALUATIONS], 'readwrite');
  const store = tx.objectStore(STORES.EVALUATIONS);
  const existing = await reqToPromise(store.get(record.key));
  const count = await reqToPromise(store.count());
  const deleteCount = Math.max(0, count - maxCount + (existing === undefined ? 1 : 0));
  if (deleteCount > 0) await deleteOldestEvaluations(store, deleteCount);
  if (maxCount > 0) store.put(record);
  else if (existing !== undefined) store.delete(record.key);
  await transactionDone(tx);
}

function deleteOldestEvaluations(store: IDBObjectStore, count: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let deleted = 0;
    const request = store.index('lastUsedAt').openCursor();
    request.onerror = () => reject(wrapIDBError(request.error));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || deleted >= count) {
        resolve();
        return;
      }
      cursor.delete();
      deleted += 1;
      cursor.continue();
    };
  });
}

// Graph Snapshots Repository
export async function getGraphSnapshot(
  db: IDBDatabase,
  key: string
): Promise<GraphSnapshotRecord | null> {
  const tx = db.transaction([STORES.GRAPH_SNAPSHOTS], 'readonly');
  const store = tx.objectStore(STORES.GRAPH_SNAPSHOTS);
  const result = await reqToPromise(store.get(key));

  if (!result) return null;
  if (!isValidGraphSnapshotRecord(result)) {
    throw new CorruptRecordError(STORES.GRAPH_SNAPSHOTS);
  }
  return result;
}

export async function putGraphSnapshot(
  db: IDBDatabase,
  record: GraphSnapshotRecord
): Promise<void> {
  if (!isValidGraphSnapshotRecord(record)) {
    throw new Error('Invalid GraphSnapshotRecord provided to putGraphSnapshot');
  }

  const tx = db.transaction([STORES.GRAPH_SNAPSHOTS], 'readwrite');
  const store = tx.objectStore(STORES.GRAPH_SNAPSHOTS);
  store.put(record);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(wrapIDBError(tx.error));
    tx.onabort = () => reject(wrapIDBError(tx.error));
  });
}

// Meta Repository
export async function getMeta(db: IDBDatabase, name: string): Promise<MetaRecord | null> {
  const tx = db.transaction([STORES.META], 'readonly');
  const store = tx.objectStore(STORES.META);
  const result = await reqToPromise(store.get(name));

  if (!result) return null;
  if (!isValidMetaRecord(result)) {
    throw new CorruptRecordError(STORES.META);
  }
  return result;
}

export async function setMeta(db: IDBDatabase, name: string, value: unknown): Promise<void> {
  const record: MetaRecord = {
    name,
    value,
    updatedAt: Date.now(),
  };

  if (!isValidMetaRecord(record)) {
    throw new Error('Invalid MetaRecord generated in setMeta');
  }

  const tx = db.transaction([STORES.META], 'readwrite');
  const store = tx.objectStore(STORES.META);
  store.put(record);

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(wrapIDBError(tx.error));
    tx.onabort = () => reject(wrapIDBError(tx.error));
  });
}

function isArchiveListMeta(value: unknown): value is ArchiveListMeta {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.username === 'string' &&
    Array.isArray(candidate.months) &&
    candidate.months.every((month) => typeof month === 'string') &&
    typeof candidate.fetchedAt === 'number'
  );
}

export async function getArchiveListMeta(
  db: IDBDatabase,
  username: string
): Promise<ArchiveListMeta | null> {
  const meta = await getMeta(db, `archiveList:${username.toLowerCase()}`);
  if (!meta || !meta.value) return null;
  if (!isArchiveListMeta(meta.value)) {
    throw new CorruptRecordError(STORES.META);
  }
  return meta.value;
}

export async function putArchiveListMeta(db: IDBDatabase, record: ArchiveListMeta): Promise<void> {
  const safeRecord: ArchiveListMeta = {
    username: record.username,
    months: record.months,
    fetchedAt: record.fetchedAt,
  };
  await setMeta(db, `archiveList:${record.username.toLowerCase()}`, safeRecord);
}

export async function getDistinctUsernames(db: IDBDatabase): Promise<string[]> {
  try {
    const tx = db.transaction([STORES.ARCHIVE_SYNC], 'readonly');
    const store = tx.objectStore(STORES.ARCHIVE_SYNC);
    const index = store.index('username');
    return await new Promise<string[]>((resolve, reject) => {
      const usernames = new Set<string>();
      const req = index.openKeyCursor(null, 'nextunique');
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          if (typeof cursor.key === 'string') {
            usernames.add(cursor.key);
          }
          cursor.continue();
        } else {
          resolve(Array.from(usernames));
        }
      };
      req.onerror = () => reject(wrapIDBError(req.error));
    });
  } catch {
    return [];
  }
}
