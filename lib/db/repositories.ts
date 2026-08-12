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
import { wrapIDBError } from './openDatabase';
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

export async function getArchiveListMeta(
  db: IDBDatabase,
  username: string
): Promise<ArchiveListMeta | null> {
  const meta = await getMeta(db, `archiveList:${username.toLowerCase()}`);
  if (!meta || !meta.value) return null;
  const val = meta.value as any;
  if (
    typeof val.username !== 'string' ||
    !Array.isArray(val.months) ||
    typeof val.fetchedAt !== 'number'
  ) {
    throw new CorruptRecordError(STORES.META);
  }
  return val as ArchiveListMeta;
}

export async function putArchiveListMeta(db: IDBDatabase, record: ArchiveListMeta): Promise<void> {
  const safeRecord: ArchiveListMeta = {
    username: record.username,
    months: record.months,
    fetchedAt: record.fetchedAt,
  };
  await setMeta(db, `archiveList:${record.username.toLowerCase()}`, safeRecord);
}
