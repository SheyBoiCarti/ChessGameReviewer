'use client';

import { IngestionManager } from '@/features/ingestion/ingestionService';
import { PgnValidationWorkerClient } from '@/features/ingestion/pgnValidationWorkerClient';
import type { IngestionDependencies } from '@/features/ingestion/types';
import { GraphWorkerClient } from '@/features/opening-tree/graphWorkerClient';
import { GraphService } from '@/features/opening-tree/graphService';
import { OpeningDataWorkerClient } from '@/features/opening-tree/openingDataWorkerClient';
import type { WorkspaceServices } from './createWorkspaceController';
import { analyzeGame } from '@/features/stockfish-analysis/analyzeGame';
import { EngineService } from '@/features/stockfish-analysis/engineService';
import {
  createIndexedDbEvaluationRepository,
  createMemoryEvaluationRepository,
  EvaluationCache,
} from '@/features/stockfish-analysis/evaluationCache';
import {
  restoreReviews,
  restoreSelected,
  saveReview,
} from '@/features/stockfish-analysis/reviewRepository';
import { analysisPreset } from '@/features/stockfish-analysis/presentation';
import { fetchMonthlyGames, fetchPlayerArchives } from '@/lib/api/chesscomClient';
import { STORES } from '@/lib/db/schema';
import { parseGamePgn } from '@/lib/chess/pgnParser';
import { clearAllData, deleteUserData } from '@/lib/db/deleteLocalData';
import { closeDatabase, initializeDatabaseMetadata, openDatabase } from '@/lib/db/openDatabase';
import {
  readNormalizedMonth,
  getArchiveListMeta,
  getArchiveSyncsForUser,
  getDistinctUsernames,
  getGamesForMonth,
  putArchiveListMeta,
  saveSyncBatch,
} from '@/lib/db/repositories';
const ENGINE_EVALUATION_CACHE_VERSION = 'engine-evaluation-v2';
const ENGINE_BUILD = 'Stockfish 18';
const NETWORK_HASH = '9067e33176e';
const NORMALIZATION_VERSION = 'white-perspective-v1';

export function createBrowserWorkspaceServices(): WorkspaceServices {
  let database: IDBDatabase | null = null;
  let databasePromise: Promise<IDBDatabase> | null = null;
  let disposed = false;
  const db = async () => {
    if (disposed) {
      disposed = false;
      database = null;
      databasePromise = null;
    }
    if (database) {
      try {
        database.transaction(STORES.META, 'readonly');
        return database;
      } catch {
        database = null;
        databasePromise = null;
      }
    }
    databasePromise ??= openDatabase().then(async (opened) => {
      try {
        await initializeDatabaseMetadata(opened);
        database = opened;
        return opened;
      } catch (error) {
        closeDatabase(opened);
        databasePromise = null;
        throw error;
      }
    });
    try {
      return await databasePromise;
    } catch (error) {
      databasePromise = null;
      throw error;
    }
  };
  const sharedDataWorker = new OpeningDataWorkerClient(
    () =>
      new Worker(new URL('../../workers/analysis-data.worker.ts', import.meta.url), {
        type: 'module',
      })
  );
  const pgnValidator = new PgnValidationWorkerClient(sharedDataWorker);
  const getPgnValidator = () => pgnValidator;
  const memoryEvaluations = createMemoryEvaluationRepository();
  const archives = new Map<string, Awaited<ReturnType<IngestionDependencies['readArchiveList']>>>();
  const months = new Map<
    string,
    {
      games: Awaited<ReturnType<IngestionDependencies['readMonthGames']>>;
      marker: Awaited<ReturnType<IngestionDependencies['readArchiveSyncs']>>[number];
    }
  >();
  let storageMisses = 0;
  const dependencies: IngestionDependencies = {
    fetchArchives: fetchPlayerArchives,
    fetchMonthlyGames,
    readArchiveList: async (username) => {
      try {
        return await getArchiveListMeta(await db(), username);
      } catch {
        storageMisses++;
        return archives.get(username) ?? null;
      }
    },
    writeArchiveList: async (record) => {
      try {
        await putArchiveListMeta(await db(), record);
      } catch {
        storageMisses++;
        archives.delete(record.username);
        if (JSON.stringify(record).length * 2 <= 1024 * 1024) archives.set(record.username, record);
        if (archives.size > 120) archives.delete(archives.keys().next().value!);
      }
    },
    readArchiveSyncs: async (username) => {
      try {
        return await getArchiveSyncsForUser(await db(), username);
      } catch {
        storageMisses++;
        return [...months.values()]
          .map(({ marker }) => marker)
          .filter((marker) => marker.username === username);
      }
    },
    readMonthGames: async (username, month) => {
      try {
        return await getGamesForMonth(await db(), username, month);
      } catch {
        storageMisses++;
        return months.get(JSON.stringify([username, month]))?.games ?? [];
      }
    },
    readNormalizedMonth: async (username, month) => {
      try {
        return await readNormalizedMonth(await db(), username, month);
      } catch {
        storageMisses++;
        return null;
      }
    },
    validatePgns: (games, options) => getPgnValidator().validate(games, options.signal),
    persistMonth: async (games, marker, signal, normalized) => {
      try {
        await saveSyncBatch(await db(), games, marker, signal, normalized);
      } catch {
        storageMisses++;
        if (signal?.aborted) return;
        const key = JSON.stringify([marker.username, marker.month]);
        months.delete(key);
        const bytes = JSON.stringify({ games, marker }).length * 2;
        if (bytes <= 16 * 1024 * 1024) months.set(key, { games, marker });
        while (
          months.size > 120 ||
          [...months.values()].reduce((sum, item) => sum + JSON.stringify(item).length * 2, 0) >
            16 * 1024 * 1024
        ) {
          months.delete(months.keys().next().value!);
        }
      }
    },
  };
  const ingestionManager = new IngestionManager(dependencies);
  const ingestion = {
    start: async (...args: Parameters<WorkspaceServices['ingestion']['start']>) => {
      const before = storageMisses;
      const result = await ingestionManager.start(...args);
      return storageMisses === before
        ? result
        : {
            ...result,
            diagnostics: [
              ...result.diagnostics,
              {
                code: 'LOCAL_STORAGE_UNAVAILABLE',
                severity: 'warning' as const,
                message:
                  'Some games could not be saved locally and are available only in this session.',
              },
            ],
          };
    },
    cancel: ingestionManager.cancel.bind(ingestionManager),
    dispose: () => {
      ingestionManager.cancel();
      sharedDataWorker.dispose();
    },
  };
  const graphWorkerClient = new GraphWorkerClient(sharedDataWorker);
  const graph = new GraphService({ workerClient: graphWorkerClient });
  const engineMode = new URLSearchParams(window.location.search).get('engine');
  const engine =
    engineMode === 'unavailable'
      ? new EngineService({
          createWorker: () =>
            new Worker('/forced-engine-unavailable.js', { type: 'module' }) as never,
          capabilityProbe: { crossOriginIsolated: false, sharedArrayBuffer: false, simd: false },
        })
      : engineMode === 'single'
        ? new EngineService({
            capabilityProbe: { crossOriginIsolated: false, sharedArrayBuffer: false, simd: false },
          })
        : new EngineService();

  return {
    ingestion,
    graph,
    engine,
    data: {
      deleteUsername: async (username) => {
        archives.delete(username.toLowerCase());
        for (const [key, value] of months)
          if (value.marker.username === username.toLowerCase()) months.delete(key);
        return deleteUserData(await db(), username);
      },
      clearAll: async () => {
        archives.clear();
        months.clear();
        await memoryEvaluations.recoverQuota();
        return clearAllData(await db());
      },
      listUsernames: async () => getDistinctUsernames(await db()),
      dispose: () => {
        disposed = true;
        if (database) closeDatabase(database);
        database = null;
        databasePromise = null;
      },
    },
    analysis: {
      restoreSelected: async (game, strength) => restoreSelected(await db(), game, strength),
      restore: async (games, strength) => restoreReviews(await db(), games, strength),
      async analyze(game, strength, capability, context, signal, onProgress, onUpdate) {
        const parsed = parseGamePgn({
          game: {
            id: game.id,
            url: game.url,
            ...(game.uuid ? { uuid: game.uuid } : {}),
            usernameKey: game.username,
            userColor: game.userColor,
            result: game.result,
            endedAt: game.endedAt,
            timeClass: game.timeClass,
            ...(game.timeControl ? { timeControl: game.timeControl } : {}),
            rated: game.rated,
            userRating: game.userRating,
            opponentRating: game.opponentRating,
            whitePlayer: game.whitePlayer,
            blackPlayer: game.blackPlayer,
            pgn: game.pgn,
            rules: game.rules,
          },
        });
        if (!parsed.ok)
          throw new Error(parsed.errors[0]?.message ?? 'The selected PGN is invalid.');
        const preset = analysisPreset(strength);
        let repository = memoryEvaluations;
        try {
          repository = createIndexedDbEvaluationRepository(await db());
        } catch {
          /* Session cache remains usable. */
        }
        const cache = new EvaluationCache(repository);
        const result = await analyzeGame({
          game: parsed.game,
          settings: {
            engineBuild: ENGINE_BUILD,
            networkHash: NETWORK_HASH,
            limit: preset.limit,
            multiPv: preset.multiPv,
            threads: capability.threads,
            hashMb: capability.hashMb,
            analysisVersion: ENGINE_EVALUATION_CACHE_VERSION,
            normalizationVersion: NORMALIZATION_VERSION,
          },
          engine: {
            evaluate: (fen, limit, multiPv, evaluationSignal) =>
              engine.evaluate({
                id: crypto.randomUUID(),
                priority: 2,
                relevanceToken: game.id,
                deadlineAt: Date.now() + 60_000,
                fen,
                limit,
                multiPv,
                ...(evaluationSignal ? { signal: evaluationSignal } : {}),
                parentSignal: signal,
              }),
          },
          cache,
          bookMoveKeys: new Set(context.bookMoveKeys),
          signal,
          onProgress,
          ...(onUpdate ? { onUpdate } : {}),
        });
        try {
          const database = await db();
          if (context.isCurrent?.() !== false)
            await saveReview(database, game, strength, result, context.isCurrent);
        } catch {
          return {
            ...result,
            warnings: [
              ...result.warnings,
              {
                code: 'EVALUATION_CACHE_WRITE_FAILED' as const,
                message:
                  'This review could not be saved locally. Keep this page open to retain it.',
              },
            ],
          };
        }
        return result;
      },
    },
  };
}
