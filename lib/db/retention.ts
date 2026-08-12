import { STORES, SCHEMA_VERSION, NORMALIZER_VERSION } from './schema';
import { getMeta } from './repositories';
import { wrapIDBError } from './openDatabase';

export interface EvictEvaluationsOptions {
  maxCount?: number;
}

export async function evictEvaluations(
  db: IDBDatabase,
  options: EvictEvaluationsOptions = {}
): Promise<number> {
  const maxCount = options.maxCount ?? 1000;

  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction([STORES.EVALUATIONS], 'readwrite');
    const store = tx.objectStore(STORES.EVALUATIONS);
    const countReq = store.count();

    countReq.onerror = () => reject(wrapIDBError(countReq.error));
    countReq.onsuccess = () => {
      const totalCount = countReq.result;
      if (totalCount <= maxCount) {
        return resolve(0);
      }

      const excess = totalCount - maxCount;
      let evicted = 0;

      const index = store.index('lastUsedAt');
      const cursorReq = index.openCursor(); // ascending by lastUsedAt (oldest first)

      cursorReq.onerror = () => reject(wrapIDBError(cursorReq.error));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && evicted < excess) {
          cursor.delete();
          evicted++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(evicted);
      tx.onerror = () => reject(wrapIDBError(tx.error));
      tx.onabort = () => reject(wrapIDBError(tx.error));
    };
  });
}

export interface EvictGraphSnapshotsOptions {
  maxCount?: number;
  maxTotalBytes?: number;
}

export async function evictGraphSnapshots(
  db: IDBDatabase,
  options: EvictGraphSnapshotsOptions = {}
): Promise<number> {
  const maxCount = options.maxCount ?? 50;

  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction([STORES.GRAPH_SNAPSHOTS], 'readwrite');
    const store = tx.objectStore(STORES.GRAPH_SNAPSHOTS);
    const countReq = store.count();

    countReq.onerror = () => reject(wrapIDBError(countReq.error));
    countReq.onsuccess = () => {
      const totalCount = countReq.result;
      if (totalCount <= maxCount) {
        return resolve(0);
      }

      const excess = totalCount - maxCount;
      let evicted = 0;

      const index = store.index('createdAt');
      const cursorReq = index.openCursor(); // ascending by createdAt (oldest first)

      cursorReq.onerror = () => reject(wrapIDBError(cursorReq.error));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && evicted < excess) {
          cursor.delete();
          evicted++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(evicted);
      tx.onerror = () => reject(wrapIDBError(tx.error));
      tx.onabort = () => reject(wrapIDBError(tx.error));
    };
  });
}

export interface CompatibilityResult {
  compatible: boolean;
  schemaVersion?: number;
  normalizerVersion?: number;
  reason?: string;
}

export async function checkSchemaCompatibility(
  db: IDBDatabase
): Promise<CompatibilityResult> {
  const schemaMeta = await getMeta(db, 'schemaVersion');
  const normalizerMeta = await getMeta(db, 'normalizerVersion');

  const dbSchemaVersion = schemaMeta ? Number(schemaMeta.value) : SCHEMA_VERSION;
  const dbNormalizerVersion = normalizerMeta ? Number(normalizerMeta.value) : NORMALIZER_VERSION;

  if (dbSchemaVersion > SCHEMA_VERSION) {
    return {
      compatible: false,
      schemaVersion: dbSchemaVersion,
      normalizerVersion: dbNormalizerVersion,
      reason: `Stored database schema version (${dbSchemaVersion}) is newer than code schema version (${SCHEMA_VERSION}).`,
    };
  }

  if (dbNormalizerVersion !== NORMALIZER_VERSION) {
    return {
      compatible: false,
      schemaVersion: dbSchemaVersion,
      normalizerVersion: dbNormalizerVersion,
      reason: `Stored normalizer version (${dbNormalizerVersion}) does not match current code normalizer version (${NORMALIZER_VERSION}).`,
    };
  }

  return {
    compatible: true,
    schemaVersion: dbSchemaVersion,
    normalizerVersion: dbNormalizerVersion,
  };
}
