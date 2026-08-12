export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'daily';
export type PlayerColor = 'white' | 'black';

export interface GameQuery {
  username: string;
  dateFrom?: string | undefined; // inclusive YYYY-MM-DD UTC
  dateTo?: string | undefined; // inclusive YYYY-MM-DD UTC
  maxGames: number; // 1..5000; default 500
  timeClasses: TimeClass[];
  colors: PlayerColor[];
  rated?: boolean | undefined;
}

export type UpstreamErrorCode =
  | 'INVALID_REQUEST'
  | 'PLAYER_NOT_FOUND'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'RESPONSE_TOO_LARGE'
  | 'INVALID_UPSTREAM_RESPONSE'
  | 'CORS_ERROR'
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'MALFORMED_JSON'
  | 'INVALID_SCHEMA'
  | 'REDIRECT_DISALLOWED';

export interface UpstreamError {
  code: UpstreamErrorCode;
  message: string;
  retryable: boolean;
  status?: number | undefined;
}

export type IngestionJobStatusCode =
  'idle' | 'running' | 'complete' | 'partial' | 'cancelled' | 'empty' | 'failed';

export interface IngestionJobStatus {
  status: IngestionJobStatusCode;
  username: string;
  processedArchivesCount: number;
  totalArchivesCount: number;
  fetchedGamesCount: number;
  acceptedGamesCount: number;
  excludedGamesCount: number;
  failedGamesCount: number;
  error?: UpstreamError | undefined;
}

export type DiagnosticSeverity = 'warning' | 'error';

export interface Diagnostic {
  code: string;
  message: string;
  severity: DiagnosticSeverity;
  gameId?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; diagnostics: Diagnostic[] };

export type GameResult = 'win' | 'draw' | 'loss';

export interface NormalizedGameSummary {
  id: string; // stable identifier: game URL or UUID
  url: string;
  uuid?: string | undefined;
  usernameKey: string; // lowercase normalized username
  userColor: PlayerColor;
  result: GameResult;
  endedAt: number; // unix timestamp in seconds
  timeClass: TimeClass;
  timeControl?: string | undefined;
  rated: boolean;
  userRating: number | null;
  opponentRating: number | null;
  pgn?: string | undefined;
  rules: 'chess';
}
