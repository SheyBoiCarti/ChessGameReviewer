'use client';

import { IngestionManager } from '@/features/ingestion/ingestionService';
import { PgnValidationWorkerClient } from '@/features/ingestion/pgnValidationWorkerClient';
import type { IngestionDependencies } from '@/features/ingestion/types';
import { GraphWorkerClient } from '@/features/opening-tree/graphWorkerClient';
import type { WorkspaceServices } from './createWorkspaceController';
import { analyzeGame } from '@/features/stockfish-analysis/analyzeGame';
import { EngineService } from '@/features/stockfish-analysis/engineService';
import {
  createIndexedDbEvaluationRepository,
  EvaluationCache,
} from '@/features/stockfish-analysis/evaluationCache';
import { analysisPreset } from '@/features/stockfish-analysis/presentation';
import { fetchMonthlyGames, fetchPlayerArchives } from '@/lib/api/chesscomClient';
import { parseGamePgn } from '@/lib/chess/pgnParser';
import { clearAllData, deleteUserData } from '@/lib/db/deleteLocalData';
import { closeDatabase, initializeDatabaseMetadata, openDatabase } from '@/lib/db/openDatabase';
import {
  getArchiveListMeta,
  getArchiveSyncsForUser,
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
    }
    if (database) {
      try {
        database.transaction('metadata', 'readonly');
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
    return databasePromise;
  };
  const pgnValidator = new PgnValidationWorkerClient(
    () =>
      new Worker(new URL('../../workers/analysis-data.worker.ts', import.meta.url), {
        type: 'module',
      })
  );
  const dependencies: IngestionDependencies = {
    fetchArchives: fetchPlayerArchives,
    fetchMonthlyGames,
    readArchiveList: async (username) => getArchiveListMeta(await db(), username),
    writeArchiveList: async (record) => putArchiveListMeta(await db(), record),
    readArchiveSyncs: async (username) => getArchiveSyncsForUser(await db(), username),
    readMonthGames: async (username, month) => getGamesForMonth(await db(), username, month),
    validatePgns: (games, options) => pgnValidator.validate(games, options.signal),
    persistMonth: async (games, marker, signal) => saveSyncBatch(await db(), games, marker, signal),
  };
  const ingestionManager = new IngestionManager(dependencies);
  const ingestion = {
    start: ingestionManager.start.bind(ingestionManager),
    cancel: ingestionManager.cancel.bind(ingestionManager),
    dispose: () => {
      ingestionManager.cancel();
      pgnValidator.dispose();
    },
  };
  const graph = new GraphWorkerClient(
    () =>
      new Worker(new URL('../../workers/analysis-data.worker.ts', import.meta.url), {
        type: 'module',
      })
  );
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
      deleteUsername: async (username) => deleteUserData(await db(), username),
      clearAll: async () => clearAllData(await db()),
      dispose: () => {
        disposed = true;
        if (database) closeDatabase(database);
        database = null;
      },
    },
    analysis: {
      async analyze(game, strength, capability, context, signal, onProgress) {
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
        const cache = new EvaluationCache(createIndexedDbEvaluationRepository(await db()));
        return analyzeGame({
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
        });
      },
    },
  };
}
