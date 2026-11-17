import { STORES, SCHEMA_VERSION, NORMALIZER_VERSION } from './schema';
import { getMeta } from './repositories';
import { wrapIDBError } from './errors';

export interface EvictEvaluationsOptions {
  maxCount?: number;
}

export async function evictEvaluations(
  db: IDBDatabase,
  options: EvictEvaluationsOptions = {}
): Promise<number> {
  const maxCount = options.maxCount ?? 1000;
  if (!Number.isInteger(maxCount) || maxCount < 0) {
    throw new TypeError('maxCount must be a non-negative integer.');
  }

  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction([STORES.EVALUATIONS], 'readwrite');
    const store = tx.objectStore(STORES.EVALUATIONS);
    const countReq = store.count();

    countReq.onerror = () => reject(wrapIDBError(countReq.error));
    countReq.onsuccess = () => {
      const totalCount = countReq.result;
      if (totalCount <= maxCount) {
        tx.oncomplete = () => resolve(0);
        tx.onerror = () => reject(wrapIDBError(tx.error));
        tx.onabort = () => reject(wrapIDBError(tx.error));
        return;
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
  const maxTotalBytes = options.maxTotalBytes;

  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction([STORES.GRAPH_SNAPSHOTS], 'readwrite');
    const store = tx.objectStore(STORES.GRAPH_SNAPSHOTS);
    const getAllReq = store.getAll();

    getAllReq.onerror = () => reject(wrapIDBError(getAllReq.error));
    getAllReq.onsuccess = () => {
      const records = (getAllReq.result || []) as Array<{ createdAt: number; byteSize?: number }>;
      let currentCount = records.length;
      let currentBytes = records.reduce((sum, r) => sum + (r.byteSize || 0), 0);

      const needsCountEviction = currentCount > maxCount;
      const needsByteEviction = maxTotalBytes !== undefined && currentBytes > maxTotalBytes;

      if (!needsCountEviction && !needsByteEviction) {
        return resolve(0);
      }

      let evicted = 0;
      const index = store.index('lastUsedAt');
      const cursorReq = index.openCursor(); // ascending by lastUsedAt (oldest first)

      cursorReq.onerror = () => reject(wrapIDBError(cursorReq.error));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          const record = cursor.value as { byteSize?: number };
          const shouldEvictCount = currentCount > maxCount;
          const shouldEvictBytes = maxTotalBytes !== undefined && currentBytes > maxTotalBytes;

          if (shouldEvictCount || shouldEvictBytes) {
            cursor.delete();
            evicted++;
            currentCount--;
            currentBytes -= record.byteSize || 0;
            cursor.continue();
          }
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
  normalizerMatches: boolean;
  schemaVersion?: number;
  normalizerVersion?: number;
  reason?: string;
}

export async function checkSchemaCompatibility(db: IDBDatabase): Promise<CompatibilityResult> {
  const schemaMeta = await getMeta(db, 'schemaVersion');
  const normalizerMeta = await getMeta(db, 'normalizerVersion');

  const dbSchemaVersion = schemaMeta ? Number(schemaMeta.value) : SCHEMA_VERSION;
  const dbNormalizerVersion = normalizerMeta ? Number(normalizerMeta.value) : NORMALIZER_VERSION;

  if (dbSchemaVersion > SCHEMA_VERSION) {
    return {
      compatible: false,
      normalizerMatches: dbNormalizerVersion === NORMALIZER_VERSION,
      schemaVersion: dbSchemaVersion,
      normalizerVersion: dbNormalizerVersion,
      reason: `Stored database schema version (${dbSchemaVersion}) is newer than code schema version (${SCHEMA_VERSION}).`,
    };
  }

  return {
    compatible: true,
    normalizerMatches: dbNormalizerVersion === NORMALIZER_VERSION,
    schemaVersion: dbSchemaVersion,
    normalizerVersion: dbNormalizerVersion,
  };
}

export const NORMALIZED_MONTH_MAX_COUNT = 120;
export const NORMALIZED_MONTH_MAX_BYTES = 64 * 1024 * 1024;
export function normalizedMonthByteSize(record: unknown): number {
  return new TextEncoder().encode(JSON.stringify(record)).byteLength;
}

/** Use in the payload's write transaction so eviction cannot leave fresh coverage. */
export function retainNormalizedMonths(
  tx: IDBTransaction,
  options: EvictGraphSnapshotsOptions = {}
): Promise<number> {
  const maxCount = options.maxCount ?? NORMALIZED_MONTH_MAX_COUNT;
  const maxBytes = options.maxTotalBytes ?? NORMALIZED_MONTH_MAX_BYTES;
  if (!Number.isInteger(maxCount) || maxCount < 0 || !Number.isFinite(maxBytes) || maxBytes < 0)
    throw new TypeError('Invalid normalized month limits');
  return new Promise((resolve, reject) => {
    const store = tx.objectStore(STORES.NORMALIZED_MONTHS);
    const request = store.index('lastUsedAt').getAll();
    request.onerror = () => reject(wrapIDBError(request.error));
    request.onsuccess = () => {
      const records = request.result as import('./schema').NormalizedMonthRecord[];
      let bytes = records.reduce((sum, record) => sum + normalizedMonthByteSize(record), 0);
      let count = records.length;
      let evicted = 0;
      for (const record of records) {
        if (count <= maxCount && bytes <= maxBytes) break;
        store.delete([record.username, record.month]);
        tx.objectStore(STORES.ARCHIVE_SYNC).delete(`${record.username}:${record.month}`);
        count -= 1;
        bytes -= normalizedMonthByteSize(record);
        evicted += 1;
      }
      resolve(evicted);
    };
  });
}
export async function evictNormalizedMonths(
  db: IDBDatabase,
  options: EvictGraphSnapshotsOptions = {}
): Promise<number> {
  const tx = db.transaction([STORES.NORMALIZED_MONTHS, STORES.ARCHIVE_SYNC], 'readwrite');
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(wrapIDBError(tx.error));
  });
  const [evicted] = await Promise.all([retainNormalizedMonths(tx, options), done]);
  return evicted;
}
