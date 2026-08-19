import type {
  Diagnostic,
  GameQuery,
  PlayerColor,
  PlayerMetadata,
  TimeClass,
  UpstreamError,
  UpstreamErrorCode,
} from '../../lib/api/contracts';
import type { RawChesscomGame } from '../../lib/api/chesscomSchemas';
import { PubApiError, createAbortError, throwIfAborted } from '../../lib/api/errors';
import { determineUserOutcome } from '../../lib/chess/results';
import { NORMALIZER_VERSION, type ArchiveSyncRecord, type GameRecord } from '../../lib/db/schema';
import { validateGameQuery } from '../../lib/validation/gameQuery';
import { fingerprintQuery, parseArchiveMonth, planArchiveMonths } from './archivePlanner';
import { executeWithRetry, type RetryOptions } from './retryPolicy';
import type {
  FailedMonth,
  IngestionDependencies,
  IngestionProgress,
  IngestionResult,
  IngestionTerminalStatus,
  RunIngestionOptions,
  StartOptions,
} from './types';

const ARCHIVE_LIST_FRESH_MS = 15 * 60_000;
const CURRENT_MONTH_FRESH_MS = 15 * 60_000;
const COMPLETED_MONTH_FRESH_MS = 30 * 24 * 60 * 60_000;

interface RequiredRuntimeOptions {
  deps: IngestionDependencies;
  jobId: string;
  signal: AbortSignal;
  manualRefresh: boolean;
  now: () => number;
  retry: RetryOptions;
  onProgress?: (progress: IngestionProgress) => void;
}

type NormalizationResult =
  | { success: true; game: GameRecord }
  | { success: false; diagnostic: Diagnostic };

const TIME_CLASSES: ReadonlySet<string> = new Set(['bullet', 'blitz', 'rapid', 'daily']);

function defaultWait(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = setTimeout(resolve, delayMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(createAbortError());
      },
      { once: true }
    );
  });
}

function isFresh(fetchedAt: number, thresholdMs: number, now: number): boolean {
  return fetchedAt <= now && now - fetchedAt <= thresholdMs;
}

function currentUtcMonth(now: number): string {
  const date = new Date(now);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isSyncFresh(record: ArchiveSyncRecord, now: number): boolean {
  const threshold =
    record.month === currentUtcMonth(now) ? CURRENT_MONTH_FRESH_MS : COMPLETED_MONTH_FRESH_MS;
  return (
    record.status === 'success' &&
    record.normalizerVersion === NORMALIZER_VERSION &&
    isFresh(record.lastSuccessfulFetchAt, threshold, now)
  );
}

export function isPubApiError(error: unknown, code?: UpstreamErrorCode): error is PubApiError {
  return error instanceof PubApiError && (code === undefined || error.code === code);
}

export function isOfflineError(error: unknown): boolean {
  return isPubApiError(error) && error.code === 'OFFLINE';
}

function safeDiagnostic(error: unknown): Diagnostic {
  if (isPubApiError(error)) {
    return { code: error.code, message: error.message, severity: 'error' };
  }
  return {
    code: 'INGESTION_FAILED',
    message: 'The ingestion job could not be completed.',
    severity: 'error',
  };
}

const UPSTREAM_ERROR_CODES: ReadonlySet<string> = new Set([
  'INVALID_REQUEST',
  'PLAYER_NOT_FOUND',
  'UPSTREAM_RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
  'RESPONSE_TOO_LARGE',
  'INVALID_UPSTREAM_RESPONSE',
  'CORS_ERROR',
  'OFFLINE',
  'TIMEOUT',
  'ABORTED',
  'MALFORMED_JSON',
  'INVALID_SCHEMA',
  'REDIRECT_DISALLOWED',
]);

function toUpstreamError(error: unknown): UpstreamError {
  if (isPubApiError(error) && UPSTREAM_ERROR_CODES.has(error.code)) {
    return {
      code: error.code as UpstreamErrorCode,
      message: error.message,
      retryable: error.retryable,
      ...(error.status === undefined ? {} : { status: error.status }),
    };
  }
  return {
    code: 'INVALID_UPSTREAM_RESPONSE',
    message: 'A month could not be processed safely.',
    retryable: false,
  };
}

function rawGameId(raw: RawChesscomGame): string {
  return raw.uuid ?? raw['@id'] ?? raw.url;
}

function normalizeRawGame(raw: RawChesscomGame, username: string): NormalizationResult {
  const normalizedUsername = username.toLowerCase();
  const whiteMatches = raw.white.username?.trim().toLowerCase() === normalizedUsername;
  const blackMatches = raw.black.username?.trim().toLowerCase() === normalizedUsername;
  const gameId = rawGameId(raw);

  if (whiteMatches === blackMatches) {
    return {
      success: false,
      diagnostic: {
        code: whiteMatches ? 'AMBIGUOUS_PLAYER_COLOR' : 'USER_NOT_IN_GAME',
        message: whiteMatches
          ? 'The player appears as both White and Black in this game.'
          : 'The requested player is not present in this game.',
        severity: 'warning',
        gameId,
      },
    };
  }

  if (raw.rules !== 'chess') {
    return {
      success: false,
      diagnostic: {
        code: 'NON_STANDARD_RULES',
        message: 'The game uses unsupported rules.',
        severity: 'warning',
        gameId,
      },
    };
  }
  if (!TIME_CLASSES.has(raw.time_class)) {
    return {
      success: false,
      diagnostic: {
        code: 'INVALID_TIME_CLASS',
        message: 'The game has an unsupported time class.',
        severity: 'warning',
        gameId,
      },
    };
  }

  const userColor: PlayerColor = whiteMatches ? 'white' : 'black';
  const outcome = determineUserOutcome({
    userColor,
    whiteResult: raw.white.result ?? '',
    blackResult: raw.black.result ?? '',
    gameId,
  });
  if (!outcome.success) return outcome;

  const whitePlayerUsername =
    raw.white.username !== undefined && raw.white.username.trim().length > 0
      ? raw.white.username.trim()
      : null;
  const whitePlayerRating =
    raw.white.rating !== undefined && Number.isFinite(raw.white.rating) && raw.white.rating > 0
      ? raw.white.rating
      : null;

  const blackPlayerUsername =
    raw.black.username !== undefined && raw.black.username.trim().length > 0
      ? raw.black.username.trim()
      : null;
  const blackPlayerRating =
    raw.black.rating !== undefined && Number.isFinite(raw.black.rating) && raw.black.rating > 0
      ? raw.black.rating
      : null;

  const whitePlayer: PlayerMetadata = {
    username: whitePlayerUsername,
    rating: whitePlayerRating,
  };
  const blackPlayer: PlayerMetadata = {
    username: blackPlayerUsername,
    rating: blackPlayerRating,
  };

  const userRating = userColor === 'white' ? whitePlayer.rating : blackPlayer.rating;
  const opponentRating = userColor === 'white' ? blackPlayer.rating : whitePlayer.rating;

  return {
    success: true,
    game: {
      id: gameId,
      username: normalizedUsername,
      url: raw.url,
      ...(raw.uuid ? { uuid: raw.uuid } : {}),
      userColor,
      result: outcome.userResult,
      endedAt: raw.end_time,
      timeClass: raw.time_class as TimeClass,
      ...(raw.time_control ? { timeControl: raw.time_control } : {}),
      rated: raw.rated ?? false,
      userRating,
      opponentRating,
      whitePlayer,
      blackPlayer,
      ...(raw.accuracies ? { accuracies: raw.accuracies } : {}),
      pgn: raw.pgn ?? '',
      rules: 'chess',
    },
  };
}

function matchesQuery(game: GameRecord, query: GameQuery): boolean {
  const from = query.dateFrom ? Date.parse(`${query.dateFrom}T00:00:00.000Z`) / 1000 : -Infinity;
  const to = query.dateTo ? Date.parse(`${query.dateTo}T23:59:59.999Z`) / 1000 : Infinity;
  return (
    game.rules === 'chess' &&
    game.endedAt >= from &&
    game.endedAt <= to &&
    query.timeClasses.includes(game.timeClass) &&
    query.colors.includes(game.userColor) &&
    (query.rated === undefined || game.rated === query.rated)
  );
}

function appendDiagnostic(target: Diagnostic[], diagnostic: Diagnostic): void {
  if (target.length < 100) target.push(diagnostic);
}

function terminal(
  runtime: RequiredRuntimeOptions,
  fingerprint: string,
  status: IngestionTerminalStatus,
  games: GameRecord[],
  failedMonths: FailedMonth[],
  diagnostics: Diagnostic[],
  offlineCacheOnly = false
): IngestionResult {
  return {
    jobId: runtime.jobId,
    fingerprint,
    status,
    games,
    failedMonths,
    diagnostics,
    offlineCacheOnly,
  };
}

async function resolveArchiveMonths(
  query: GameQuery,
  runtime: RequiredRuntimeOptions,
  syncs: ArchiveSyncRecord[]
): Promise<{ months: string[]; offlineCacheOnly: boolean }> {
  const cached = await runtime.deps.readArchiveList(query.username);
  const now = runtime.now();
  if (!runtime.manualRefresh && cached && isFresh(cached.fetchedAt, ARCHIVE_LIST_FRESH_MS, now)) {
    return { months: planArchiveMonths(cached.months, query), offlineCacheOnly: false };
  }

  try {
    const archives = await executeWithRetry(
      () => runtime.deps.fetchArchives(query.username, { signal: runtime.signal }),
      runtime.retry
    );
    throwIfAborted(runtime.signal);
    const months = archives.map((archive) => parseArchiveMonth(archive, query.username));
    await runtime.deps.writeArchiveList({
      username: query.username,
      months,
      fetchedAt: runtime.now(),
    });
    return { months: planArchiveMonths(months, query), offlineCacheOnly: false };
  } catch (error) {
    if (isOfflineError(error)) {
      const cachedMonths = cached?.months ?? syncs.map((sync) => sync.month);
      if (cachedMonths.length > 0) {
        return { months: planArchiveMonths(cachedMonths, query), offlineCacheOnly: true };
      }
    }
    throw error;
  }
}

async function executeIngestion(
  query: GameQuery,
  runtime: RequiredRuntimeOptions
): Promise<IngestionResult> {
  const fingerprint = fingerprintQuery(query);
  const diagnostics: Diagnostic[] = [];
  const games: GameRecord[] = [];
  const seen = new Set<string>();
  const failedMonths: FailedMonth[] = [];
  let monthsPlanned = 0;
  let monthsCompleted = 0;
  let recordsFetched = 0;
  let recordsExcluded = 0;
  let recordsFailed = 0;
  const emit = (
    phase: IngestionProgress['phase'],
    details: Pick<IngestionProgress, 'currentMonth' | 'source' | 'retry'> = {}
  ): void => {
    if (runtime.signal.aborted) return;
    runtime.onProgress?.({
      jobId: runtime.jobId,
      phase,
      monthsPlanned,
      monthsCompleted,
      recordsFetched,
      recordsAccepted: games.length,
      recordsExcluded,
      recordsFailed,
      ...(details.currentMonth ? { currentMonth: details.currentMonth } : {}),
      ...(details.source ? { source: details.source } : {}),
      ...(details.retry ? { retry: { ...details.retry } } : {}),
      diagnostics: diagnostics.map((diagnostic) => ({ ...diagnostic })),
    });
  };

  emit('planning');
  const syncs = await runtime.deps.readArchiveSyncs(query.username);
  const syncByMonth = new Map(syncs.map((sync) => [sync.month, sync]));
  const planning = await resolveArchiveMonths(query, runtime, syncs);
  monthsPlanned = planning.months.length;
  emit('loading-cache');

  if (planning.offlineCacheOnly) {
    diagnostics.push({
      code: 'OFFLINE_STALE_CACHE',
      message: 'Showing cached games because the network is unavailable.',
      severity: 'warning',
    });
  }

  for (const month of planning.months) {
    throwIfAborted(runtime.signal);
    const sync = syncByMonth.get(month);
    if (!runtime.manualRefresh && sync && isSyncFresh(sync, runtime.now())) {
      const cachedGames = await runtime.deps.readMonthGames(query.username, month);
      recordsFetched += cachedGames.length;
      for (const game of cachedGames) {
        if (matchesQuery(game, query) && !seen.has(game.id)) {
          seen.add(game.id);
          games.push(game);
          if (games.length === query.maxGames) break;
        } else {
          recordsExcluded += 1;
        }
      }
      monthsCompleted += 1;
      emit('filtering', { currentMonth: month, source: 'indexeddb' });
      if (games.length === query.maxGames) break;
      continue;
    }
    if (planning.offlineCacheOnly) {
      const cachedGames = await runtime.deps.readMonthGames(query.username, month);
      recordsFetched += cachedGames.length;
      for (const game of cachedGames) {
        if (matchesQuery(game, query) && !seen.has(game.id)) {
          seen.add(game.id);
          games.push(game);
          if (games.length === query.maxGames) break;
        } else {
          recordsExcluded += 1;
        }
      }
      monthsCompleted += 1;
      emit('filtering', { currentMonth: month, source: 'indexeddb' });
      if (games.length === query.maxGames) break;
      continue;
    }

    let attempts = 0;
    try {
      const [year, monthNumber] = month.split('-') as [string, string];
      emit('fetching', { currentMonth: month, source: 'browser-fetch' });
      const rawGames = await executeWithRetry(
        (attempt) => {
          attempts = attempt;
          return runtime.deps.fetchMonthlyGames(query.username, year, monthNumber, {
            signal: runtime.signal,
          });
        },
        {
          ...runtime.retry,
          onRetry: (retry) =>
            emit('fetching', {
              currentMonth: month,
              source: 'browser-fetch',
              retry,
            }),
        }
      );
      throwIfAborted(runtime.signal);
      recordsFetched += rawGames.length;
      const normalizedMonthGames: GameRecord[] = [];
      for (const raw of rawGames) {
        const normalized = normalizeRawGame(raw, query.username);
        if (!normalized.success) {
          appendDiagnostic(diagnostics, normalized.diagnostic);
          recordsExcluded += 1;
          recordsFailed += 1;
          continue;
        }
        normalizedMonthGames.push(normalized.game);
        if (matchesQuery(normalized.game, query) && !seen.has(normalized.game.id)) {
          seen.add(normalized.game.id);
          if (games.length < query.maxGames) {
            games.push(normalized.game);
          } else {
            recordsExcluded += 1;
          }
        } else {
          recordsExcluded += 1;
        }
      }
      await runtime.deps.persistMonth(
        normalizedMonthGames,
        {
          key: `${query.username}:${month}`,
          username: query.username,
          month,
          lastSuccessfulFetchAt: runtime.now(),
          status: 'success',
          observedGameIds: normalizedMonthGames.map((game) => game.id),
          observedGameCount: normalizedMonthGames.length,
          normalizerVersion: NORMALIZER_VERSION,
        },
        runtime.signal
      );
      monthsCompleted += 1;
      emit('filtering', { currentMonth: month, source: 'browser-fetch' });
    } catch (error) {
      if (isPubApiError(error, 'ABORTED') || runtime.signal.aborted) throw error;
      const upstreamError = toUpstreamError(error);
      failedMonths.push({
        month,
        error: upstreamError,
        retryable: upstreamError.retryable,
        attempts: Math.max(attempts, 1),
      });
      appendDiagnostic(diagnostics, safeDiagnostic(error));
      continue;
    }
    if (games.length === query.maxGames) break;
  }

  const status = failedMonths.length > 0 ? (games.length > 0 ? 'partial' : 'failed') : 'complete';
  return terminal(
    runtime,
    fingerprint,
    status,
    games,
    failedMonths,
    diagnostics,
    planning.offlineCacheOnly
  );
}

export async function runIngestion(
  input: unknown,
  options: RunIngestionOptions
): Promise<IngestionResult> {
  const controller = options.signal ? null : new AbortController();
  const signal = options.signal ?? controller!.signal;
  const runtime: RequiredRuntimeOptions = {
    deps: options.deps,
    jobId: options.jobId ?? 'ingestion-job',
    signal,
    manualRefresh: options.manualRefresh ?? false,
    now: options.now ?? Date.now,
    retry: {
      signal,
      baseDelayMs: 1_000,
      random: options.random ?? Math.random,
      wait: options.wait ?? defaultWait,
    },
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  };
  const validation = validateGameQuery(input);
  if (!validation.success) {
    return terminal(runtime, '', 'failed', [], [], validation.diagnostics);
  }

  try {
    return await executeIngestion(validation.data, runtime);
  } catch (error) {
    if (isPubApiError(error, 'ABORTED') || runtime.signal.aborted) {
      return terminal(runtime, fingerprintQuery(validation.data), 'cancelled', [], [], []);
    }
    return terminal(
      runtime,
      fingerprintQuery(validation.data),
      'failed',
      [],
      [],
      [safeDiagnostic(error)]
    );
  }
}

export function createJobId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class IngestionManager {
  private active: { token: symbol; controller: AbortController } | null = null;

  constructor(private readonly deps: IngestionDependencies) {}

  async start(input: unknown, options: StartOptions = {}): Promise<IngestionResult> {
    this.active?.controller.abort();
    const token = Symbol('ingestion-job');
    const controller = new AbortController();
    this.active = { token, controller };

    try {
      return await runIngestion(input, {
        ...options,
        deps: this.deps,
        jobId: createJobId(),
        signal: controller.signal,
        onProgress: (progress) => {
          if (this.active?.token === token) options.onProgress?.(progress);
        },
      });
    } finally {
      if (this.active?.token === token) this.active = null;
    }
  }

  cancel(): void {
    this.active?.controller.abort();
  }
}
