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
} from './schema';
import { wrapIDBError } from './openDatabase';

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

  if (!result || !isValidArchiveSyncRecord(result)) {
    return null;
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
  return results.filter(isValidArchiveSyncRecord);
}

export async function putArchiveSync(
  db: IDBDatabase,
  record: ArchiveSyncRecord
): Promise<void> {
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
export async function getGame(
  db: IDBDatabase,
  id: string
): Promise<GameRecord | null> {
  const tx = db.transaction([STORES.GAMES], 'readonly');
  const store = tx.objectStore(STORES.GAMES);
  const result = await reqToPromise(store.get(id));

  if (!result || !isValidGameRecord(result)) {
    return null;
  }
  return result;
}

export async function getGamesForUser(
  db: IDBDatabase,
  username: string
): Promise<GameRecord[]> {
  const normUsername = username.toLowerCase();
  const tx = db.transaction([STORES.GAMES], 'readonly');
  const store = tx.objectStore(STORES.GAMES);
  const index = store.index('username');
  const results = await reqToPromise(index.getAll(normUsername));

  if (!Array.isArray(results)) return [];
  return results.filter(isValidGameRecord);
}

export async function upsertGames(
  db: IDBDatabase,
  games: GameRecord[]
): Promise<void> {
  for (const game of games) {
    if (!isValidGameRecord(game)) {
      throw new Error(`Invalid GameRecord provided to upsertGames (id: ${(game as GameRecord)?.id})`);
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
  syncRecord: ArchiveSyncRecord
): Promise<void> {
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

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(wrapIDBError(tx.error));
      tx.onabort = () => reject(wrapIDBError(tx.error));
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

  if (!result || !isValidEvaluationRecord(result)) {
    return null;
  }
  return result;
}

export async function putEvaluation(
  db: IDBDatabase,
  record: EvaluationRecord
): Promise<void> {
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

  if (!result || !isValidGraphSnapshotRecord(result)) {
    return null;
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
export async function getMeta(
  db: IDBDatabase,
  name: string
): Promise<MetaRecord | null> {
  const tx = db.transaction([STORES.META], 'readonly');
  const store = tx.objectStore(STORES.META);
  const result = await reqToPromise(store.get(name));

  if (!result || !isValidMetaRecord(result)) {
    return null;
  }
  return result;
}

export async function setMeta(
  db: IDBDatabase,
  name: string,
  value: unknown
): Promise<void> {
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
