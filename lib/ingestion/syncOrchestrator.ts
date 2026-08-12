import { Diagnostic, PlayerColor, TimeClass } from '../api/contracts';
import { fetchPlayerArchives, fetchMonthlyGames } from '../api/chesscomClient';
import { getArchiveSyncsForUser, saveSyncBatch } from '../db/repositories';
import { ArchiveSyncRecord, GameRecord, NORMALIZER_VERSION } from '../db/schema';
import { determineUserOutcome } from '../chess/results';
import { createAbortError } from '../api/errors';

export interface SyncOrchestratorOptions {
  signal?: AbortSignal | undefined;
  fetchArchivesFn?: typeof fetchPlayerArchives | undefined;
  fetchMonthlyGamesFn?: typeof fetchMonthlyGames | undefined;
  now?: (() => number) | undefined;
}

export type SyncProgressPhase =
  | 'init'
  | 'fetching_archives'
  | 'processing_month'
  | 'month_complete'
  | 'complete';

export interface SyncProgressEvent {
  phase: SyncProgressPhase;
  username: string;
  totalMonths: number;
  completedMonths: number;
  currentMonth?: string | undefined; // YYYY-MM
  currentGameRatio: number; // 0.0 to 1.0
  gamesSyncedInCurrentMonth?: number | undefined;
  totalGamesSynced?: number | undefined;
  diagnostics?: Diagnostic[] | undefined;
}

export interface SyncResult {
  username: string;
  totalMonths: number;
  syncedMonthsCount: number;
  totalGamesSynced: number;
  diagnostics: Diagnostic[];
}

function getCurrentUtcMonthStr(nowMs: number): string {
  const d = new Date(nowMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export async function* syncOrchestrator(
  db: IDBDatabase,
  username: string,
  options?: SyncOrchestratorOptions
): AsyncGenerator<SyncProgressEvent, SyncResult, void> {
  const signal = options?.signal;
  const fetchArchives = options?.fetchArchivesFn ?? fetchPlayerArchives;
  const fetchMonthly = options?.fetchMonthlyGamesFn ?? fetchMonthlyGames;
  const now = options?.now ?? Date.now;

  if (signal?.aborted) {
    throw createAbortError();
  }

  const normUser = username.toLowerCase().trim();
  const allDiagnostics: Diagnostic[] = [];

  yield {
    phase: 'init',
    username: normUser,
    totalMonths: 0,
    completedMonths: 0,
    currentGameRatio: 0,
  };

  // Step 1: Retrieve local archiveSync records
  const localSyncs = await getArchiveSyncsForUser(db, normUser);
  const syncMap = new Map<string, ArchiveSyncRecord>();
  for (const s of localSyncs) {
    syncMap.set(s.month, s);
  }

  if (signal?.aborted) {
    throw createAbortError();
  }

  // Step 2: Fetch player archives list
  yield {
    phase: 'fetching_archives',
    username: normUser,
    totalMonths: 0,
    completedMonths: 0,
    currentGameRatio: 0,
  };

  const archiveUrls = await fetchArchives(username, { signal });

  if (signal?.aborted) {
    throw createAbortError();
  }

  // Parse archive URLs to month info: e.g. { url, year, month, monthKey: "YYYY-MM" }
  const monthItems: { url: string; year: string; month: string; monthKey: string }[] = [];
  for (const url of archiveUrls) {
    const parts = url.split('/');
    if (parts.length >= 2) {
      const year = parts[parts.length - 2]!;
      const month = parts[parts.length - 1]!;
      if (/^\d{4}$/.test(year) && /^\d{2}$/.test(month)) {
        monthItems.push({ url, year, month, monthKey: `${year}-${month}` });
      }
    }
  }

  // Sort descending (newest first)
  monthItems.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const nowMs = now();
  const currentMonthKey = getCurrentUtcMonthStr(nowMs);

  // Identify stale/missing months
  const staleMonths = monthItems.filter((item) => {
    const isCurrent = item.monthKey === currentMonthKey;
    const staleThresholdMs = isCurrent ? 15 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
    const rec = syncMap.get(item.monthKey);
    if (!rec) return true;
    if (rec.status !== 'success') return true;
    if (rec.normalizerVersion !== NORMALIZER_VERSION) return true;
    return nowMs - rec.lastSuccessfulFetchAt > staleThresholdMs;
  });

  const totalMonthsToSync = staleMonths.length;
  let completedMonths = 0;
  let totalGamesSynced = 0;

  for (const item of staleMonths) {
    if (signal?.aborted) {
      throw createAbortError();
    }

    yield {
      phase: 'processing_month',
      username: normUser,
      totalMonths: totalMonthsToSync,
      completedMonths,
      currentMonth: item.monthKey,
      currentGameRatio: 0,
      totalGamesSynced,
      diagnostics: [...allDiagnostics],
    };

    // Step 5: Fetch stale month
    const rawGames = await fetchMonthly(username, item.year, item.month, { signal });

    if (signal?.aborted) {
      throw createAbortError();
    }

    // Step 6: Normalize games
    const normalizedGames: GameRecord[] = [];
    const monthDiagnostics: Diagnostic[] = [];

    for (let i = 0; i < rawGames.length; i++) {
      const rawGame = rawGames[i]!;
      const whiteUser = rawGame.white.username?.toLowerCase().trim();
      const blackUser = rawGame.black.username?.toLowerCase().trim();

      let userColor: PlayerColor | null = null;
      if (whiteUser === normUser) {
        userColor = 'white';
      } else if (blackUser === normUser) {
        userColor = 'black';
      }

      if (!userColor) {
        monthDiagnostics.push({
          code: 'USER_NOT_IN_GAME',
          message: `User '${username}' was neither white nor black in game ${rawGame.url}`,
          severity: 'warning',
          gameId: rawGame.url,
        });
        continue;
      }

      const outcome = determineUserOutcome({
        userColor,
        whiteResult: rawGame.white.result ?? '',
        blackResult: rawGame.black.result ?? '',
        gameId: rawGame.url,
      });

      if (!outcome.success) {
        monthDiagnostics.push(outcome.diagnostic);
        continue;
      }

      if (rawGame.rules !== 'chess') {
        monthDiagnostics.push({
          code: 'NON_STANDARD_RULES',
          message: `Game ${rawGame.url} uses non-standard rules: '${rawGame.rules}'`,
          severity: 'warning',
          gameId: rawGame.url,
        });
        continue;
      }

      const validTimeClasses = ['bullet', 'blitz', 'rapid', 'daily'];
      if (!validTimeClasses.includes(rawGame.time_class)) {
        monthDiagnostics.push({
          code: 'INVALID_TIME_CLASS',
          message: `Game ${rawGame.url} has unknown time class: '${rawGame.time_class}'`,
          severity: 'warning',
          gameId: rawGame.url,
        });
        continue;
      }

      normalizedGames.push({
        id: rawGame.url,
        username: normUser,
        url: rawGame.url,
        uuid: rawGame.uuid,
        userColor,
        result: outcome.userResult,
        endedAt: rawGame.end_time,
        timeClass: rawGame.time_class as TimeClass,
        timeControl: rawGame.time_control,
        rated: rawGame.rated ?? false,
        userRating: userColor === 'white' ? (rawGame.white.rating ?? null) : (rawGame.black.rating ?? null),
        opponentRating: userColor === 'white' ? (rawGame.black.rating ?? null) : (rawGame.white.rating ?? null),
        pgn: rawGame.pgn ?? '',
        rules: 'chess',
      });
    }

    allDiagnostics.push(...monthDiagnostics);

    if (signal?.aborted) {
      throw createAbortError();
    }

    // Step 7: Save batch in ONE transaction
    const syncMarker: ArchiveSyncRecord = {
      key: `${normUser}:${item.monthKey}`,
      username: normUser,
      month: item.monthKey,
      lastSuccessfulFetchAt: now(),
      status: 'success',
      observedGameIds: normalizedGames.map((g) => g.id),
      observedGameCount: normalizedGames.length,
      normalizerVersion: NORMALIZER_VERSION,
    };

    await saveSyncBatch(db, normalizedGames, syncMarker);

    completedMonths++;
    totalGamesSynced += normalizedGames.length;

    yield {
      phase: 'month_complete',
      username: normUser,
      totalMonths: totalMonthsToSync,
      completedMonths,
      currentMonth: item.monthKey,
      currentGameRatio: 1.0,
      gamesSyncedInCurrentMonth: normalizedGames.length,
      totalGamesSynced,
      diagnostics: [...allDiagnostics],
    };
  }

  yield {
    phase: 'complete',
    username: normUser,
    totalMonths: totalMonthsToSync,
    completedMonths: totalMonthsToSync,
    currentGameRatio: 1.0,
    totalGamesSynced,
    diagnostics: [...allDiagnostics],
  };

  return {
    username: normUser,
    totalMonths: totalMonthsToSync,
    syncedMonthsCount: completedMonths,
    totalGamesSynced,
    diagnostics: allDiagnostics,
  };
}
