import { GameQuery, UpstreamError, Diagnostic } from '../../lib/api/contracts';
import { FetchOptions } from '../../lib/api/chesscomClient';
import { RawChesscomGame } from '../../lib/api/chesscomSchemas';
import { GameRecord, ArchiveSyncRecord } from '../../lib/db/schema';
import { ArchiveListMeta } from '../../lib/db/repositories';

export type IngestionPhase = 'planning' | 'loading-cache' | 'fetching' | 'filtering';
export type IngestionTerminalStatus = 'complete' | 'partial' | 'cancelled' | 'failed';
export type IngestionDataSource = 'indexeddb' | 'browser-fetch';

export interface FailedMonth {
  month: string;
  error: UpstreamError;
  retryable: boolean;
  attempts: number;
}

export interface RetryProgress {
  attempt: number;
  delayMs: number;
}

export interface IngestionProgress {
  jobId: string;
  phase: IngestionPhase;
  monthsPlanned: number;
  monthsCompleted: number;
  recordsFetched: number;
  recordsAccepted: number;
  recordsExcluded: number;
  recordsFailed: number;
  currentMonth?: string;
  source?: IngestionDataSource;
  retry?: RetryProgress;
  diagnostics: Diagnostic[];
}

export interface IngestionResult {
  jobId: string;
  fingerprint: string;
  status: IngestionTerminalStatus;
  games: GameRecord[];
  failedMonths: FailedMonth[];
  diagnostics: Diagnostic[];
  offlineCacheOnly: boolean;
}

export interface IngestionDependencies {
  fetchArchives(username: string, options: FetchOptions): Promise<string[]>;
  fetchMonthlyGames(
    username: string,
    year: string,
    month: string,
    options: FetchOptions
  ): Promise<RawChesscomGame[]>;
  readArchiveList(username: string): Promise<ArchiveListMeta | null>;
  writeArchiveList(record: ArchiveListMeta): Promise<void>;
  readArchiveSyncs(username: string): Promise<ArchiveSyncRecord[]>;
  readMonthGames(username: string, month: string): Promise<GameRecord[]>;
  persistMonth(games: GameRecord[], marker: ArchiveSyncRecord, signal?: AbortSignal): Promise<void>;
}

export interface RunIngestionOptions {
  deps: IngestionDependencies;
  jobId?: string;
  signal?: AbortSignal;
  manualRefresh?: boolean;
  now?: () => number;
  random?: () => number;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  onProgress?: (progress: IngestionProgress) => void;
}

export type StartOptions = Omit<RunIngestionOptions, 'deps' | 'jobId' | 'signal'>;
