import type { PlayerColor, TimeClass, GameResult } from '../api/contracts';

export const DB_NAME = 'ChessGameReviewerDB';
export const SCHEMA_VERSION = 1;
export const NORMALIZER_VERSION = 1;

export const STORES = {
  ARCHIVE_SYNC: 'archiveSync',
  GAMES: 'games',
  EVALUATIONS: 'evaluations',
  GRAPH_SNAPSHOTS: 'graphSnapshots',
  META: 'meta',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

export interface ArchiveSyncRecord {
  key: string; // username:YYYY-MM
  username: string; // lowercase normalized username
  month: string; // YYYY-MM
  lastSuccessfulFetchAt: number;
  status: 'success' | 'failed' | 'partial';
  observedGameIds: string[];
  observedGameCount: number;
  normalizerVersion: number;
}

export interface GameRecord {
  id: string; // stable identifier
  username: string; // lowercase normalized username
  url: string;
  uuid?: string | undefined;
  userColor: PlayerColor;
  result: GameResult;
  endedAt: number;
  timeClass: TimeClass;
  timeControl?: string | undefined;
  rated: boolean;
  userRating: number | null;
  opponentRating: number | null;
  pgn: string;
  rules: 'chess';
}

export interface EvaluationRecord {
  key: string;
  positionHash: string;
  engineBuild: string;
  lastUsedAt: number;
  evaluation: unknown;
}

export interface GraphSnapshotRecord {
  key: string;
  username: string;
  createdAt: number;
  lastUsedAt: number;
  snapshotData: unknown;
  byteSize: number;
}

export interface MetaRecord {
  name: string;
  value: unknown;
  updatedAt: number;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

export function isValidArchiveSyncRecord(data: unknown): data is ArchiveSyncRecord {
  if (!isObject(data)) return false;
  if ('pgn' in data || 'rawMonthlyJson' in data || 'raw' in data) return false;
  return (
    typeof data['key'] === 'string' &&
    typeof data['username'] === 'string' &&
    typeof data['month'] === 'string' &&
    typeof data['lastSuccessfulFetchAt'] === 'number' &&
    (data['status'] === 'success' || data['status'] === 'failed' || data['status'] === 'partial') &&
    Array.isArray(data['observedGameIds']) &&
    typeof data['observedGameCount'] === 'number' &&
    typeof data['normalizerVersion'] === 'number'
  );
}

export function isValidGameRecord(data: unknown): data is GameRecord {
  if (!isObject(data)) return false;
  return (
    typeof data['id'] === 'string' &&
    typeof data['username'] === 'string' &&
    typeof data['url'] === 'string' &&
    (data['userColor'] === 'white' || data['userColor'] === 'black') &&
    (data['result'] === 'win' || data['result'] === 'draw' || data['result'] === 'loss') &&
    typeof data['endedAt'] === 'number' &&
    (data['timeClass'] === 'bullet' ||
      data['timeClass'] === 'blitz' ||
      data['timeClass'] === 'rapid' ||
      data['timeClass'] === 'daily') &&
    typeof data['rated'] === 'boolean' &&
    (typeof data['userRating'] === 'number' || data['userRating'] === null) &&
    (typeof data['opponentRating'] === 'number' || data['opponentRating'] === null) &&
    typeof data['pgn'] === 'string' &&
    data['rules'] === 'chess'
  );
}

export function isValidEvaluationRecord(data: unknown): data is EvaluationRecord {
  if (!isObject(data)) return false;
  return (
    typeof data['key'] === 'string' &&
    typeof data['positionHash'] === 'string' &&
    typeof data['engineBuild'] === 'string' &&
    typeof data['lastUsedAt'] === 'number' &&
    'evaluation' in data
  );
}

export function isValidGraphSnapshotRecord(data: unknown): data is GraphSnapshotRecord {
  if (!isObject(data)) return false;
  return (
    typeof data['key'] === 'string' &&
    typeof data['username'] === 'string' &&
    typeof data['createdAt'] === 'number' &&
    typeof data['lastUsedAt'] === 'number' &&
    typeof data['byteSize'] === 'number' &&
    'snapshotData' in data
  );
}

export function isValidMetaRecord(data: unknown): data is MetaRecord {
  if (!isObject(data)) return false;
  if ('pgn' in data) return false;
  return (
    typeof data['name'] === 'string' &&
    'value' in data &&
    typeof data['updatedAt'] === 'number'
  );
}
