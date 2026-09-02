import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, closeDatabase } from '../../../lib/db/openDatabase';
import {
  DB_NAME,
  STORES,
  EvaluationRecord,
  GraphSnapshotRecord,
  SCHEMA_VERSION,
  NORMALIZER_VERSION,
} from '../../../lib/db/schema';
import {
  putEvaluation,
  putGraphSnapshot,
  setMeta,
  getGraphSnapshot,
} from '../../../lib/db/repositories';
import {
  evictEvaluations,
  evictGraphSnapshots,
  checkSchemaCompatibility,
} from '../../../lib/db/retention';

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

describe('Retention & LRU Eviction', () => {
  let db: IDBDatabase;

  beforeEach(async () => {
    indexedDB.deleteDatabase(DB_NAME);
    db = await openDatabase();
  });

  afterEach(() => {
    if (db) closeDatabase(db);
  });

  describe('evictEvaluations', () => {
    it('supports zero and rejects invalid retention limits', async () => {
      await putEvaluation(db, {
        key: 'remove-all',
        positionHash: 'position',
        engineBuild: 'engine',
        lastUsedAt: 1,
        evaluation: {},
      });
      await expect(evictEvaluations(db, { maxCount: 0 })).resolves.toBe(1);
      await expect(evictEvaluations(db, { maxCount: -1 })).rejects.toThrow(
        'maxCount must be a non-negative integer.'
      );
      await expect(evictEvaluations(db, { maxCount: 1.5 })).rejects.toThrow(
        'maxCount must be a non-negative integer.'
      );
    });

    it('uses the default limit and leaves a small cache untouched', async () => {
      await expect(evictEvaluations(db)).resolves.toBe(0);
    });

    it('evicts oldest evaluation records when count exceeds maxCount', async () => {
      const record1: EvaluationRecord = {
        key: 'fen-1',
        positionHash: 'fen-1',
        engineBuild: 'sf16',
        lastUsedAt: 1000,
        evaluation: { score: 0.1 },
      };
      const record2: EvaluationRecord = {
        key: 'fen-2',
        positionHash: 'fen-2',
        engineBuild: 'sf16',
        lastUsedAt: 2000,
        evaluation: { score: 0.2 },
      };
      const record3: EvaluationRecord = {
        key: 'fen-3',
        positionHash: 'fen-3',
        engineBuild: 'sf16',
        lastUsedAt: 3000,
        evaluation: { score: 0.3 },
      };

      await putEvaluation(db, record1);
      await putEvaluation(db, record2);
      await putEvaluation(db, record3);

      const evicted = await evictEvaluations(db, { maxCount: 2 });
      expect(evicted).toBe(1); // record1 (lastUsedAt=1000) should be evicted
    });
  });

  describe('evictGraphSnapshots', () => {
    it('uses default limits and leaves an empty cache untouched', async () => {
      await expect(evictGraphSnapshots(db)).resolves.toBe(0);
    });

    it('evicts oldest snapshots when maxCount is exceeded', async () => {
      const snap1: GraphSnapshotRecord = {
        key: 'snap-1',
        username: 'janedoe',
        createdAt: 1000,
        lastUsedAt: 1000,
        snapshotData: { data: 'a' },
        byteSize: 500,
      };
      const snap2: GraphSnapshotRecord = {
        key: 'snap-2',
        username: 'janedoe',
        createdAt: 2000,
        lastUsedAt: 2000,
        snapshotData: { data: 'b' },
        byteSize: 500,
      };

      await putGraphSnapshot(db, snap1);
      await putGraphSnapshot(db, snap2);

      const evicted = await evictGraphSnapshots(db, { maxCount: 1 });
      expect(evicted).toBe(1);
    });

    it('evicts oldest snapshots when cumulative byte size exceeds maxTotalBytes', async () => {
      const snap1: GraphSnapshotRecord = {
        key: 'snap-1',
        username: 'janedoe',
        createdAt: 1000,
        lastUsedAt: 1000,
        snapshotData: { data: 'a' },
        byteSize: 600,
      };
      const snap2: GraphSnapshotRecord = {
        key: 'snap-2',
        username: 'janedoe',
        createdAt: 2000,
        lastUsedAt: 2000,
        snapshotData: { data: 'b' },
        byteSize: 600,
      };

      await putGraphSnapshot(db, snap1);
      await putGraphSnapshot(db, snap2);

      // Total bytes = 1200. Max = 1000. snap1 (600 bytes) should be evicted.
      const evicted = await evictGraphSnapshots(db, { maxTotalBytes: 1000 });
      expect(evicted).toBe(1);
    });

    it('evicts snapshots by least-recently-used time, not creation time', async () => {
      const tx = db.transaction(STORES.GRAPH_SNAPSHOTS, 'readwrite');
      const store = tx.objectStore(STORES.GRAPH_SNAPSHOTS);
      store.put({
        key: 'old-created-recent-use',
        username: 'janedoe',
        createdAt: 1,
        lastUsedAt: 30,
        snapshotData: {},
        byteSize: 2,
      });
      store.put({
        key: 'new-created-old-use',
        username: 'janedoe',
        createdAt: 20,
        lastUsedAt: 2,
        snapshotData: {},
        byteSize: 2,
      });
      await transactionDone(tx);
      await evictGraphSnapshots(db, { maxCount: 1 });
      expect(await getGraphSnapshot(db, 'new-created-old-use')).toBeNull();
    });

    it('treats a missing byte size as zero while enforcing the count limit', async () => {
      const tx = db.transaction(STORES.GRAPH_SNAPSHOTS, 'readwrite');
      tx.objectStore(STORES.GRAPH_SNAPSHOTS).put({
        key: 'no-size',
        username: 'janedoe',
        createdAt: 1,
        lastUsedAt: 1,
        snapshotData: {},
      });
      await transactionDone(tx);

      await expect(evictGraphSnapshots(db, { maxCount: 0, maxTotalBytes: 0 })).resolves.toBe(1);
    });
  });

  describe('checkSchemaCompatibility', () => {
    it('uses current versions when compatibility metadata is absent', async () => {
      await expect(checkSchemaCompatibility(db)).resolves.toMatchObject({
        compatible: true,
        schemaVersion: SCHEMA_VERSION,
        normalizerVersion: NORMALIZER_VERSION,
      });
    });

    it('detects compatible schema and normalizer version', async () => {
      await setMeta(db, 'schemaVersion', 1);
      await setMeta(db, 'normalizerVersion', NORMALIZER_VERSION);

      const status = await checkSchemaCompatibility(db);
      expect(status.compatible).toBe(true);
      expect(status.schemaVersion).toBe(1);
      expect(status.normalizerVersion).toBe(NORMALIZER_VERSION);
    });

    it('detects incompatible normalizer version', async () => {
      await setMeta(db, 'schemaVersion', 1);
      await setMeta(db, 'normalizerVersion', 99); // incompatible

      const status = await checkSchemaCompatibility(db);
      expect(status.compatible).toBe(false);
    });

    it('detects a database schema newer than this build', async () => {
      await setMeta(db, 'schemaVersion', 99);

      const status = await checkSchemaCompatibility(db);
      expect(status).toMatchObject({ compatible: false, schemaVersion: 99 });
      expect(status.reason).toContain('newer than code schema version');
    });
  });
});
