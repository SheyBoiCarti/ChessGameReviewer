import { describe, it, expect } from 'vitest';
import {
  DB_NAME,
  SCHEMA_VERSION,
  NORMALIZER_VERSION,
  STORES,
  isValidArchiveSyncRecord,
  isValidGameRecord,
  isValidEvaluationRecord,
  isValidGraphSnapshotRecord,
  isValidMetaRecord,
  ArchiveSyncRecord,
  GameRecord,
  EvaluationRecord,
  GraphSnapshotRecord,
  MetaRecord,
} from '../../../lib/db/schema';

describe('Schema & Runtime Validation', () => {
  it('exports schema version and store name constants', () => {
    expect(DB_NAME).toBe('ChessGameReviewerDB');
    expect(SCHEMA_VERSION).toBe(1);
    expect(NORMALIZER_VERSION).toBe(1);
    expect(STORES.ARCHIVE_SYNC).toBe('archiveSync');
    expect(STORES.GAMES).toBe('games');
    expect(STORES.EVALUATIONS).toBe('evaluations');
    expect(STORES.GRAPH_SNAPSHOTS).toBe('graphSnapshots');
    expect(STORES.META).toBe('meta');
  });

  describe('isValidArchiveSyncRecord', () => {
    it('validates correct archiveSync records', () => {
      const record: ArchiveSyncRecord = {
        key: 'janedoe:2024-05',
        username: 'janedoe',
        month: '2024-05',
        lastSuccessfulFetchAt: 1700000000000,
        status: 'success',
        observedGameIds: ['https://www.chess.com/game/live/12345'],
        observedGameCount: 1,
        normalizerVersion: 1,
      };
      expect(isValidArchiveSyncRecord(record)).toBe(true);
    });

    it('rejects invalid or incomplete archiveSync records', () => {
      expect(isValidArchiveSyncRecord(null)).toBe(false);
      expect(isValidArchiveSyncRecord({})).toBe(false);
      expect(
        isValidArchiveSyncRecord({
          key: 'janedoe:2024-05',
          username: 'janedoe',
          // missing month
          lastSuccessfulFetchAt: 1700000000000,
          status: 'success',
          observedGameIds: [],
          observedGameCount: 0,
          normalizerVersion: 1,
        })
      ).toBe(false);
    });

    it('proves archiveSync does not contain PGN or raw monthly JSON payload', () => {
      const record = {
        key: 'janedoe:2024-05',
        username: 'janedoe',
        month: '2024-05',
        lastSuccessfulFetchAt: 1700000000000,
        status: 'success',
        observedGameIds: [],
        observedGameCount: 0,
        normalizerVersion: 1,
        pgn: '1. e4 e5', // forbidden field
      };
      expect(isValidArchiveSyncRecord(record)).toBe(false);
    });
  });

  describe('isValidGameRecord', () => {
    it('validates correct game records', () => {
      const record: GameRecord = {
        id: 'https://www.chess.com/game/live/12345',
        username: 'janedoe',
        url: 'https://www.chess.com/game/live/12345',
        userColor: 'white',
        result: 'win',
        endedAt: 1700000000,
        timeClass: 'blitz',
        rated: true,
        userRating: 1500,
        opponentRating: 1480,
        pgn: '1. e4 e5 2. Nf3 Nc6',
        rules: 'chess',
      };
      expect(isValidGameRecord(record)).toBe(true);
    });

    it('rejects game records missing required fields', () => {
      expect(
        isValidGameRecord({
          id: '123',
          username: 'janedoe',
          // missing pgn
        })
      ).toBe(false);
    });
  });

  describe('isValidEvaluationRecord', () => {
    it('validates evaluation records', () => {
      const record: EvaluationRecord = {
        key: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -:v1',
        positionHash: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
        engineBuild: 'stockfish-16',
        lastUsedAt: 1700000000000,
        evaluation: { score: 0.1, depth: 18 },
      };
      expect(isValidEvaluationRecord(record)).toBe(true);
    });
  });

  describe('isValidGraphSnapshotRecord', () => {
    it('validates graph snapshot records', () => {
      const record: GraphSnapshotRecord = {
        key: 'fp_12345',
        username: 'janedoe',
        createdAt: 1700000000000,
        lastUsedAt: 1700000000000,
        snapshotData: { nodes: [] },
        byteSize: 1024,
      };
      expect(isValidGraphSnapshotRecord(record)).toBe(true);
    });
  });

  describe('isValidMetaRecord', () => {
    it('validates meta records', () => {
      const record: MetaRecord = {
        name: 'schemaVersion',
        value: 1,
        updatedAt: 1700000000000,
      };
      expect(isValidMetaRecord(record)).toBe(true);
    });

    it('proves meta record does not contain PGN', () => {
      const record = {
        name: 'schemaVersion',
        value: 1,
        updatedAt: 1700000000000,
        pgn: '1. e4 e5',
      };
      expect(isValidMetaRecord(record)).toBe(false);
    });
  });
});
