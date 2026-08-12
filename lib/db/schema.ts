import type { PlayerColor, TimeClass, GameResult } from '../api/contracts';

export const DB_NAME = 'ChessGameAnalyzerDB';
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

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isMonth = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function isValidArchiveSyncRecord(data: unknown): data is ArchiveSyncRecord {
  if (!isObject(data)) return false;
  if ('pgn' in data || 'rawMonthlyJson' in data || 'raw' in data) return false;
  return (
    typeof data['key'] === 'string' &&
    typeof data['username'] === 'string' &&
    isMonth(data['month']) &&
    isFiniteNumber(data['lastSuccessfulFetchAt']) &&
    (data['status'] === 'success' || data['status'] === 'failed' || data['status'] === 'partial') &&
    Array.isArray(data['observedGameIds']) &&
    isFiniteNumber(data['observedGameCount']) &&
    data['observedGameCount'] >= 0 &&
    isFiniteNumber(data['normalizerVersion'])
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
    isFiniteNumber(data['endedAt']) &&
    (data['timeClass'] === 'bullet' ||
      data['timeClass'] === 'blitz' ||
      data['timeClass'] === 'rapid' ||
      data['timeClass'] === 'daily') &&
    typeof data['rated'] === 'boolean' &&
    (isFiniteNumber(data['userRating']) || data['userRating'] === null) &&
    (isFiniteNumber(data['opponentRating']) || data['opponentRating'] === null) &&
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
    isFiniteNumber(data['lastUsedAt']) &&
    'evaluation' in data
  );
}

export function isValidGraphSnapshotRecord(data: unknown): data is GraphSnapshotRecord {
  if (!isObject(data)) return false;
  return (
    typeof data['key'] === 'string' &&
    typeof data['username'] === 'string' &&
    isFiniteNumber(data['createdAt']) &&
    isFiniteNumber(data['lastUsedAt']) &&
    isFiniteNumber(data['byteSize']) &&
    'snapshotData' in data
  );
}

export function isValidMetaRecord(data: unknown): data is MetaRecord {
  if (!isObject(data)) return false;
  if ('pgn' in data) return false;
  return (
    typeof data['name'] === 'string' &&
    'value' in data &&
    isFiniteNumber(data['updatedAt'])
  );
}
