import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, closeDatabase } from '../../../lib/db/openDatabase';
import { DB_NAME, EvaluationRecord, GraphSnapshotRecord } from '../../../lib/db/schema';
import { putEvaluation, putGraphSnapshot, setMeta } from '../../../lib/db/repositories';
import { evictEvaluations, evictGraphSnapshots, checkSchemaCompatibility } from '../../../lib/db/retention';

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
    it('evicts oldest snapshots when count or byte limits are exceeded', async () => {
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
  });

  describe('checkSchemaCompatibility', () => {
    it('detects compatible schema and normalizer version', async () => {
      await setMeta(db, 'schemaVersion', 1);
      await setMeta(db, 'normalizerVersion', 1);

      const status = await checkSchemaCompatibility(db);
      expect(status.compatible).toBe(true);
      expect(status.schemaVersion).toBe(1);
      expect(status.normalizerVersion).toBe(1);
    });

    it('detects incompatible normalizer version', async () => {
      await setMeta(db, 'schemaVersion', 1);
      await setMeta(db, 'normalizerVersion', 99); // incompatible

      const status = await checkSchemaCompatibility(db);
      expect(status.compatible).toBe(false);
    });
  });
});
