import { computePgnDigest } from '../stockfish-analysis/reviewIdentity';
import { computeDatasetRevision } from '../opening-tree/graphIdentity';
import { PGN_PARSER_VERSION, POSITION_KEY_VERSION } from '../../lib/chess/graph/types';
import {
  isValidValidationEnvelope,
  type NormalizedMonthCandidate,
  type NormalizedMonthRecord,
} from '../../lib/db/schema';
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
import {
  QuotaExceededError,
  SchemaVersionError,
  StorageUnavailableError,
} from '../../lib/db/errors';
import { validateGameQuery } from '../../lib/validation/gameQuery';
import { fingerprintQuery, parseArchiveMonth, planArchiveMonths } from './archivePlanner';
import { executeWithRetry, type RetryOptions } from './retryPolicy';
import type {
  FailedMonth,
  IngestionBatch,
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
  cacheOnly: boolean;
  now: () => number;
  retry: RetryOptions;
  onProgress?: (progress: IngestionProgress) => void;
  onBatch?: (batch: IngestionBatch) => void;
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
  if (error instanceof SchemaVersionError) {
    return {
      code: 'LOCAL_STORAGE_INCOMPATIBLE',
      message: 'Local storage was created by a newer app version. Clear local data and try again.',
      severity: 'error',
    };
  }
  if (error instanceof StorageUnavailableError) {
    return {
      code: 'LOCAL_STORAGE_UNAVAILABLE',
      message: 'Local storage is unavailable. Check your browser settings and try again.',
      severity: 'error',
    };
  }
  if (error instanceof QuotaExceededError) {
    return {
      code: 'LOCAL_STORAGE_QUOTA',
      message: 'Local storage is full. Clear some local data and try again.',
      severity: 'error',
    };
  }
  if (isPubApiError(error)) {
    return {
      code: error.code,
      message:
        error.code === 'PLAYER_NOT_FOUND'
          ? 'No Chess.com account was found. Check the username and try again.'
          : error.message,
      severity: 'error',
    };
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

function newestFirst(a: GameRecord, b: GameRecord): number {
  return b.endedAt - a.endedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
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
  if (runtime.cacheOnly) {
    return {
      months: planArchiveMonths(cached?.months ?? syncs.map((sync) => sync.month), query),
      offlineCacheOnly: false,
    };
  }
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
  let offlineCacheOnly = false;
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
  let batchSequence = 0;
  const emitBatch = async (): Promise<void> => {
    if (games.length === 0 || !runtime.onBatch || runtime.signal.aborted) return;
    batchSequence += 1;
    const datasetRevision = await computeDatasetRevision(games);
    if (runtime.signal.aborted) return;
    runtime.onBatch({
      jobId: runtime.jobId,
      fingerprint,
      sequence: batchSequence,
      datasetRevision,
      games: Object.freeze([...games]),
    });
  };
  const isEligibleForReplay = (game: GameRecord): boolean => {
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
  };

  const validateGames = async (
    monthGames: readonly GameRecord[],
    month: string,
    fetchedAt: number,
    completeFetch: boolean,
    priorMonth?: NormalizedMonthRecord | null
  ): Promise<{ validGames: GameRecord[]; normalized: NormalizedMonthRecord }> => {
    const cached =
      priorMonth === undefined
        ? await runtime.deps.readNormalizedMonth(query.username, month)
        : priorMonth;
    throwIfAborted(runtime.signal);
    const cachedById = new Map(
      cached?.candidates.map((candidate) => [candidate.game.id, candidate.validation])
    );
    const candidates: NormalizedMonthCandidate[] = await Promise.all(
      monthGames.map(async (game) => {
        const pgnDigest = await computePgnDigest(game.pgn);
        const prior = cachedById.get(game.id);
        const reusable =
          isValidValidationEnvelope(prior) &&
          prior.state !== 'unknown' &&
          prior.pgnDigest === pgnDigest &&
          prior.parserVersion === PGN_PARSER_VERSION &&
          prior.positionVersion === POSITION_KEY_VERSION &&
          prior.normalizerVersion === NORMALIZER_VERSION;
        return {
          game,
          validation: reusable
            ? prior
            : {
                state: 'unknown',
                pgnDigest,
                parserVersion: PGN_PARSER_VERSION,
                positionVersion: POSITION_KEY_VERSION,
                normalizerVersion: NORMALIZER_VERSION,
                diagnosticCodes: [],
              },
        };
      })
    );
    throwIfAborted(runtime.signal);
    // Walk newest first, validating only enough unknown candidates to fill the cap.
    // Full fetch coverage still retains the untouched candidates as unknown.
    const eligible = candidates
      .filter((c) => isEligibleForReplay(c.game) && !seen.has(c.game.id))
      .sort((a, b) => newestFirst(a.game, b.game));
    let remaining = query.maxGames - games.length;
    let cursor = 0;
    while (cursor < eligible.length && remaining > 0) {
      const pending: NormalizedMonthCandidate[] = [];
      while (cursor < eligible.length && pending.length < remaining) {
        const candidate = eligible[cursor++]!;
        if (candidate.validation.state === 'valid') remaining--;
        else if (candidate.validation.state === 'unknown') pending.push(candidate);
        if (remaining === 0) break;
      }
      if (pending.length === 0) continue;
      const result = await runtime.deps.validatePgns(
        pending.map((c) => c.game),
        { signal: runtime.signal }
      );
      throwIfAborted(runtime.signal);
      const validIds = new Set(result.validGameIds);
      for (const diagnostic of result.diagnostics) appendDiagnostic(diagnostics, diagnostic);
      for (const candidate of pending) {
        const valid = validIds.has(candidate.game.id);
        const projection = result.projections?.find((p) => p.id === candidate.game.id);
        candidate.validation = {
          ...candidate.validation,
          state: valid ? 'valid' : 'invalid',
          ...(projection ? { projection } : {}),
          diagnosticCodes: valid
            ? []
            : [
                ...new Set(
                  result.diagnostics
                    .filter((d) => d.gameId === candidate.game.id)
                    .map((d) => d.code)
                    .concat(result.diagnosticCodes)
                ),
              ].slice(0, 20),
        };
        if (valid) remaining--;
      }
    }
    recordsExcluded += candidates.filter((c) => c.validation.state === 'unknown').length;
    for (const candidate of candidates) {
      if (candidate.validation.state !== 'invalid') continue;
      recordsExcluded += 1;
      recordsFailed += 1;
      if (!diagnostics.some((diagnostic) => diagnostic.gameId === candidate.game.id)) {
        appendDiagnostic(diagnostics, {
          code: candidate.validation.diagnosticCodes[0] ?? 'ILLEGAL_PGN',
          severity: 'warning',
          gameId: candidate.game.id,
          message: 'This game could not be replayed and was excluded.',
        });
      }
    }
    return {
      validGames: candidates
        .filter((candidate) => candidate.validation.state === 'valid')
        .map((candidate) => ({
          ...candidate.game,
          ...(candidate.validation.projection
            ? { openingProjection: candidate.validation.projection }
            : {}),
        })),
      normalized: {
        username: query.username,
        month,
        fetchedAt,
        completeFetch,
        lastUsedAt: runtime.now(),
        candidates,
      },
    };
  };
  const validateCachedGames = async (
    monthGames: readonly GameRecord[],
    month: string,
    sync: ArchiveSyncRecord | undefined
  ) => {
    const coverage = await runtime.deps.readNormalizedMonth(query.username, month);
    const existingIds = new Set(monthGames.map((g) => g.id));
    const extraCoverageGames =
      coverage?.candidates
        .filter((candidate) => !existingIds.has(candidate.game.id))
        .map((candidate) => candidate.game) ?? [];
    const candidateGames = [...monthGames, ...extraCoverageGames];
    const { validGames, normalized } = await validateGames(
      candidateGames,
      month,
      coverage?.fetchedAt ?? sync?.lastSuccessfulFetchAt ?? 0,
      coverage?.completeFetch ?? false,
      coverage
    );
    throwIfAborted(runtime.signal);
    // Keep candidates outside the accepted set intact; a later query may need them.
    const updatedIds = new Set(normalized.candidates.map((candidate) => candidate.game.id));
    normalized.candidates.push(
      ...(coverage?.candidates.filter((candidate) => !updatedIds.has(candidate.game.id)) ?? [])
    );
    if (JSON.stringify(normalized.candidates) !== JSON.stringify(coverage?.candidates)) {
      await runtime.deps.persistMonth(
        validGames,
        {
          ...(sync ?? {
            key: `${query.username}:${month}`,
            username: query.username,
            month,
            lastSuccessfulFetchAt: coverage?.fetchedAt ?? 0,
            status: 'partial',
            normalizerVersion: NORMALIZER_VERSION,
          }),
          observedGameIds: validGames.map((game) => game.id),
          observedGameCount: validGames.length,
        },
        runtime.signal,
        normalized
      );
    }
    throwIfAborted(runtime.signal);
    return validGames;
  };

  try {
    emit('planning');
    const syncs = await runtime.deps.readArchiveSyncs(query.username);
    const syncByMonth = new Map(syncs.map((sync) => [sync.month, sync]));
    const planning = await resolveArchiveMonths(query, runtime, syncs);
    offlineCacheOnly = planning.offlineCacheOnly;
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
        const validCachedGames = await validateCachedGames(cachedGames, month, sync);
        for (const game of [...validCachedGames].sort(newestFirst)) {
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
        await emitBatch();
        if (games.length === query.maxGames) break;
        continue;
      }
      if (runtime.cacheOnly || planning.offlineCacheOnly) {
        const cachedGames = await runtime.deps.readMonthGames(query.username, month);
        recordsFetched += cachedGames.length;
        const validCachedGames = await validateCachedGames(cachedGames, month, sync);
        for (const game of [...validCachedGames].sort(newestFirst)) {
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
        await emitBatch();
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
        }
        // Stable IDs can be repeated within an upstream payload; retain one candidate per ID.
        const uniqueMonthGames = [
          ...new Map(normalizedMonthGames.map((game) => [game.id, game])).values(),
        ];
        const { validGames: validMonthGames, normalized } = await validateGames(
          uniqueMonthGames,
          month,
          runtime.now(),
          true
        );
        const stagedMatches: GameRecord[] = [];
        const stagedIds = new Set<string>();
        for (const game of [...validMonthGames].sort(newestFirst)) {
          if (matchesQuery(game, query) && !seen.has(game.id) && !stagedIds.has(game.id)) {
            if (games.length + stagedMatches.length < query.maxGames) {
              stagedIds.add(game.id);
              stagedMatches.push(game);
            } else {
              recordsExcluded += 1;
            }
          } else {
            recordsExcluded += 1;
          }
        }
        await runtime.deps.persistMonth(
          validMonthGames,
          {
            key: `${query.username}:${month}`,
            username: query.username,
            month,
            lastSuccessfulFetchAt: runtime.now(),
            status: 'success',
            observedGameIds: validMonthGames.map((game) => game.id),
            observedGameCount: validMonthGames.length,
            normalizerVersion: NORMALIZER_VERSION,
          },
          runtime.signal,
          normalized
        );
        throwIfAborted(runtime.signal);
        for (const game of stagedMatches) {
          seen.add(game.id);
          games.push(game);
        }
        monthsCompleted += 1;
        emit('filtering', { currentMonth: month, source: 'browser-fetch' });
        await emitBatch();
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
      offlineCacheOnly
    );
  } catch (error) {
    if (isPubApiError(error, 'ABORTED') || runtime.signal.aborted) {
      return terminal(
        runtime,
        fingerprint,
        'cancelled',
        games,
        failedMonths,
        diagnostics,
        offlineCacheOnly
      );
    }
    throw error;
  }
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
    cacheOnly: options.cacheOnly ?? false,
    now: options.now ?? Date.now,
    retry: {
      signal,
      baseDelayMs: 1_000,
      random: options.random ?? Math.random,
      wait: options.wait ?? defaultWait,
    },
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.onBatch ? { onBatch: options.onBatch } : {}),
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
        onBatch: (batch) => {
          if (this.active?.token === token) options.onBatch?.(batch);
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
