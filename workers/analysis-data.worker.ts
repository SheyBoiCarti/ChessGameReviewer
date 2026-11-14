/// <reference lib="webworker" />

import { createAbortError, PubApiError } from '../lib/api/errors';
import { canonicalGameOrder, OpeningGraphBuilder } from '../lib/chess/graph/openingGraph';
import {
  MAX_SERIALIZED_GRAPH_BYTES,
  serializeOpeningGraph,
  serializedGraphFits,
  type SerializedOpeningGraph,
} from '../lib/chess/graph/serialization';
import {
  OPENING_PROJECTION_VERSION,
  PGN_PARSER_VERSION,
  POSITION_KEY_VERSION,
  type GraphBuildOptions,
  type GraphStructuralLimits,
  type OpeningGameProjection,
} from '../lib/chess/graph/types';
import { parseGamePgn, type ParsedGame } from '../lib/chess/pgnParser';
import type { Diagnostic, NormalizedGameSummary } from '../lib/api/contracts';
import { computePgnDigest } from '../features/stockfish-analysis/reviewIdentity';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { isOpeningGameProjection, isWorkerRequest, PROTOCOL_VERSION } from './protocol';

const cancelledJobs = new Set<string>();
const PROGRESS_INTERVAL_MS = 50;
const PARSE_YIELD_EVERY_GAMES = 25;
const MAX_DIAGNOSTICS = 100;
const MAX_DIAGNOSTIC_CODES = 20;

const MAX_PARSED_CACHE_ENTRIES = 1000;
const MAX_PARSED_CACHE_BYTES = 64 * 1024 * 1024;
interface CachedParsedEntry {
  parsed: ParsedGame;
  projection: OpeningGameProjection;
  byteSize: number;
}
const parsedCache = new Map<string, CachedParsedEntry>();
let totalCachedBytes = 0;

export function clearParsedCache(): void {
  parsedCache.clear();
  totalCachedBytes = 0;
}

function parsedGameCacheKey(game: NormalizedGameSummary, pgnDigest: string): string {
  return JSON.stringify([
    game.id,
    pgnDigest,
    PGN_PARSER_VERSION,
    POSITION_KEY_VERSION,
    game.usernameKey,
    game.userColor,
    game.result,
    game.endedAt,
    game.timeClass,
    game.rated,
    game.userRating,
    game.opponentRating,
  ]);
}

function storeInParsedCache(
  key: string,
  parsed: ParsedGame,
  projection: OpeningGameProjection
): void {
  const byteSize = (JSON.stringify(projection).length + JSON.stringify(parsed).length) * 2;
  if (parsedCache.has(key)) {
    totalCachedBytes -= parsedCache.get(key)!.byteSize;
    parsedCache.delete(key);
  }
  while (
    (parsedCache.size >= MAX_PARSED_CACHE_ENTRIES ||
      totalCachedBytes + byteSize > MAX_PARSED_CACHE_BYTES) &&
    parsedCache.size > 0
  ) {
    const oldestKey = parsedCache.keys().next().value!;
    totalCachedBytes -= parsedCache.get(oldestKey)!.byteSize;
    parsedCache.delete(oldestKey);
  }
  parsedCache.set(key, { parsed, projection, byteSize });
  totalCachedBytes += byteSize;
}

if (typeof self !== 'undefined') {
  self.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!isWorkerRequest(event.data)) return;
    void handleRequest(event.data, (response) => self.postMessage(response));
  });
}

export async function handleRequest(
  request: WorkerRequest,
  post: (response: WorkerResponse) => void
): Promise<void> {
  if (request.type === 'DISPOSE') {
    cancelledJobs.add(request.jobId);
    return;
  }
  if (request.type === 'CANCEL_JOB') {
    cancelledJobs.add(request.jobId);
    return;
  }
  post({ protocolVersion: PROTOCOL_VERSION, jobId: request.jobId, type: 'JOB_ACCEPTED' });
  let lastProgressAt = Number.NEGATIVE_INFINITY;
  let parsedGameCount = 0;
  let diagnosticsCount = 0;
  let diagnosticCodes: readonly string[] = [];
  const reportProgress = (builtCount: number, force = false): void => {
    const now = Date.now();
    if (!force && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
    lastProgressAt = now;
    post({
      protocolVersion: PROTOCOL_VERSION,
      jobId: request.jobId,
      type: 'PROGRESS',
      parsedCount: parsedGameCount,
      builtCount,
      diagnosticsCount,
      diagnosticCodes,
    });
  };
  if (cancelledJobs.delete(request.jobId)) {
    post({ protocolVersion: PROTOCOL_VERSION, jobId: request.jobId, type: 'CANCELLED' });
    return;
  }
  if (request.type === 'VALIDATE_PGNS') {
    try {
      const result = await validatePgnsInWorker(request.games, request.jobId);
      if (!result || cancelledJobs.delete(request.jobId)) {
        post({ protocolVersion: PROTOCOL_VERSION, jobId: request.jobId, type: 'CANCELLED' });
        return;
      }
      post({
        protocolVersion: PROTOCOL_VERSION,
        jobId: request.jobId,
        type: 'PGN_VALIDATION_COMPLETE',
        ...result,
      });
    } catch {
      post({
        protocolVersion: PROTOCOL_VERSION,
        jobId: request.jobId,
        type: 'FAILED',
        code: 'PGN_VALIDATION_FAILED',
        message: 'PGN validation failed.',
      });
    }
    return;
  }
  try {
    const parsedGames = await parseGamesInWorker(
      request.games,
      request.jobId,
      (count, diagnostics, codes) => {
        parsedGameCount = count;
        diagnosticsCount = diagnostics;
        diagnosticCodes = codes;
        reportProgress(0);
      }
    );
    if (request.games.length === 0) reportProgress(0);
    if (!parsedGames || cancelledJobs.delete(request.jobId)) {
      post({ protocolVersion: PROTOCOL_VERSION, jobId: request.jobId, type: 'CANCELLED' });
      return;
    }
    let excludedGameCount = request.games.length - parsedGames.length;
    const graph = await buildGraphWithinByteBudget(
      parsedGames,
      request.options,
      {
        queryFingerprint: request.queryFingerprint,
        sourceGameCount: request.games.length,
        excludedGameCount,
        buildTimestamp: Date.now(),
      },
      {
        shouldCancel: () => cancelledJobs.has(request.jobId),
        onProgress: (includedGameCount) => reportProgress(includedGameCount),
      }
    );
    if (cancelledJobs.delete(request.jobId)) {
      post({ protocolVersion: PROTOCOL_VERSION, jobId: request.jobId, type: 'CANCELLED' });
      return;
    }
    const snapshot = graph.snapshot;
    excludedGameCount = snapshot.excludedGameCount;
    if (excludedGameCount > request.games.length - parsedGames.length) {
      diagnosticCodes = [...diagnosticCodes, 'GRAPH_GAME_SKIPPED'].slice(0, MAX_DIAGNOSTIC_CODES);
    }
    if (graph.status === 'limited')
      post({
        protocolVersion: PROTOCOL_VERSION,
        jobId: request.jobId,
        type: 'LIMITED',
        snapshot,
        reachedLimit: graph.reachedLimit ?? 'unknown',
        includedGameCount: graph.includedGameCount,
        remainingGameCount: graph.remainingGameCount,
        excludedGameCount,
        diagnosticCodes,
      });
    else if (excludedGameCount > 0)
      post({
        protocolVersion: PROTOCOL_VERSION,
        jobId: request.jobId,
        type: 'PARTIAL',
        snapshot,
        excludedGameCount,
        diagnosticCodes,
      });
    else
      post({
        protocolVersion: PROTOCOL_VERSION,
        jobId: request.jobId,
        type: 'COMPLETE',
        snapshot,
      });
  } catch (error) {
    if (error instanceof PubApiError && error.code === 'ABORTED') {
      cancelledJobs.delete(request.jobId);
      post({ protocolVersion: PROTOCOL_VERSION, jobId: request.jobId, type: 'CANCELLED' });
      return;
    }
    post({
      protocolVersion: PROTOCOL_VERSION,
      jobId: request.jobId,
      type: 'FAILED',
      code: 'GRAPH_BUILD_FAILED',
      message: 'Graph build failed.',
    });
  }
}

interface GraphBudgetMetadata {
  queryFingerprint: string;
  sourceGameCount: number;
  excludedGameCount: number;
  buildTimestamp: number;
}

interface GraphBudgetRuntime {
  maxBytes?: number;
  structuralLimits?: Partial<GraphStructuralLimits>;
  shouldCancel?: () => boolean;
  onProgress?: (includedGameCount: number) => void;
  onBuildAttempt?: (gameCount: number) => void;
}

export interface GraphBudgetResult {
  status: 'complete' | 'limited';
  snapshot: SerializedOpeningGraph;
  reachedLimit?: keyof GraphStructuralLimits | 'maxSnapshotBytes';
  includedGameCount: number;
  remainingGameCount: number;
}

export async function buildGraphWithinByteBudget(
  games: readonly (ParsedGame | OpeningGameProjection)[],
  options: GraphBuildOptions,
  metadata: GraphBudgetMetadata,
  runtime: GraphBudgetRuntime = {}
): Promise<GraphBudgetResult> {
  const orderedGames = canonicalGameOrder(games);
  const maxBytes = runtime.maxBytes ?? MAX_SERIALIZED_GRAPH_BYTES;

  const buildPrefix = async (count: number, byteLimited: boolean): Promise<GraphBudgetResult> => {
    if (runtime.shouldCancel?.()) throw createAbortError();
    runtime.onBuildAttempt?.(count);
    const graph = await new OpeningGraphBuilder(options, runtime.structuralLimits).buildAsync(
      orderedGames.slice(0, count),
      {
        ...(runtime.shouldCancel ? { shouldCancel: runtime.shouldCancel } : {}),
        ...(byteLimited
          ? {}
          : {
              onProgress: ({ includedGameCount }: { includedGameCount: number }) =>
                runtime.onProgress?.(includedGameCount),
            }),
      }
    );
    if (!graph) throw createAbortError();
    let snapshot = serializeOpeningGraph(graph, metadata);
    if (byteLimited) {
      snapshot = {
        ...snapshot,
        status: 'limited',
        reachedLimit: 'maxSnapshotBytes',
        includedGameCount: graph.includedGameCount,
        remainingGameCount: orderedGames.length - graph.includedGameCount - graph.excludedGameCount,
      };
    }
    return {
      status: snapshot.status,
      snapshot,
      ...(snapshot.reachedLimit
        ? {
            reachedLimit: snapshot.reachedLimit as keyof GraphStructuralLimits | 'maxSnapshotBytes',
          }
        : {}),
      includedGameCount: snapshot.includedGameCount,
      remainingGameCount: snapshot.remainingGameCount,
    };
  };

  const full = await buildPrefix(orderedGames.length, false);
  if (serializedGraphFits(full.snapshot, maxBytes)) return full;

  let low = 0;
  let high = orderedGames.length;
  let best = await buildPrefix(0, true);
  if (!serializedGraphFits(best.snapshot, maxBytes)) throw new Error('GRAPH_BYTE_BUDGET_TOO_SMALL');

  while (low <= high) {
    if (runtime.shouldCancel?.()) throw createAbortError();
    const middle = Math.floor((low + high) / 2);
    const candidate = await buildPrefix(middle, true);
    if (serializedGraphFits(candidate.snapshot, maxBytes)) {
      best = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return best;
}

async function validatePgnsInWorker(
  games: Extract<WorkerRequest, { type: 'VALIDATE_PGNS' }>['games'],
  jobId: string
): Promise<
  | {
      validGameIds: readonly string[];
      projections: readonly OpeningGameProjection[];
      diagnostics: readonly Diagnostic[];
      totalInvalid: number;
      diagnosticCodes: readonly string[];
    }
  | undefined
> {
  const validGameIds: string[] = [];
  const projections: OpeningGameProjection[] = [];
  const diagnostics: Diagnostic[] = [];
  const diagnosticCodes: string[] = [];
  let totalInvalid = 0;

  for (let index = 0; index < games.length; index += 1) {
    if (cancelledJobs.has(jobId)) return undefined;
    const game = games[index]!;
    const pgn = game.pgn?.trim() ?? '';
    const pgnDigest = pgn ? await computePgnDigest(game.pgn!) : '';
    const cacheKey = pgnDigest ? parsedGameCacheKey(game, pgnDigest) : null;
    const cached = cacheKey ? parsedCache.get(cacheKey) : undefined;

    if (cached) {
      parsedCache.delete(cacheKey!);
      parsedCache.set(cacheKey!, cached);
      validGameIds.push(game.id);
      projections.push(cached.projection);
    } else {
      const result = parseGamePgn({ game });
      if (result.ok) {
        validGameIds.push(game.id);
        const projection: OpeningGameProjection = {
          ...result.game,
          plies: result.game.plies.slice(0, 40),
          projectionVersion: OPENING_PROJECTION_VERSION,
          pgnDigest,
        };
        projections.push(projection);
        if (cacheKey) {
          storeInParsedCache(cacheKey, result.game, projection);
        }
      } else {
        totalInvalid += 1;
        for (const diagnostic of result.errors) {
          if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(diagnostic);
          if (
            diagnosticCodes.length < MAX_DIAGNOSTIC_CODES &&
            !diagnosticCodes.includes(diagnostic.code)
          ) {
            diagnosticCodes.push(diagnostic.code);
          }
        }
      }
    }
    if ((index + 1) % PARSE_YIELD_EVERY_GAMES === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return { validGameIds, projections, diagnostics, totalInvalid, diagnosticCodes };
}

async function parseGamesInWorker(
  games: Extract<WorkerRequest, { type: 'BUILD_GRAPH' }>['games'],
  jobId: string,
  onProgress: (
    parsedCount: number,
    diagnosticsCount: number,
    diagnosticCodes: readonly string[]
  ) => void
): Promise<(ParsedGame | OpeningGameProjection)[] | undefined> {
  const parsedGames: (ParsedGame | OpeningGameProjection)[] = [];
  let diagnosticsCount = 0;
  const diagnosticCodes: string[] = [];

  for (let index = 0; index < games.length; index += 1) {
    if (cancelledJobs.has(jobId)) return undefined;
    const game = games[index]!;
    if (isOpeningGameProjection(game)) {
      parsedGames.push(game);
      onProgress(parsedGames.length, diagnosticsCount, diagnosticCodes);
      if ((index + 1) % PARSE_YIELD_EVERY_GAMES === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      continue;
    }

    const pgn = game.pgn?.trim() ?? '';
    const pgnDigest = pgn ? await computePgnDigest(game.pgn!) : '';
    const cacheKey = pgnDigest ? parsedGameCacheKey(game, pgnDigest) : null;
    const cached = cacheKey ? parsedCache.get(cacheKey) : undefined;

    if (cached) {
      parsedCache.delete(cacheKey!);
      parsedCache.set(cacheKey!, cached);
      parsedGames.push(cached.projection);
    } else {
      const result = parseGamePgn({ game });
      if (result.ok) {
        const projection: OpeningGameProjection = {
          ...result.game,
          plies: result.game.plies.slice(0, 40),
          projectionVersion: OPENING_PROJECTION_VERSION,
          pgnDigest,
        };
        parsedGames.push(projection);
        if (cacheKey) {
          storeInParsedCache(cacheKey, result.game, projection);
        }
      } else {
        diagnosticsCount = Math.min(MAX_DIAGNOSTICS, diagnosticsCount + result.errors.length);
        for (const diagnostic of result.errors) {
          if (
            diagnosticCodes.length < MAX_DIAGNOSTIC_CODES &&
            !diagnosticCodes.includes(diagnostic.code)
          ) {
            diagnosticCodes.push(diagnostic.code);
          }
        }
      }
    }
    onProgress(parsedGames.length, diagnosticsCount, diagnosticCodes);
    if ((index + 1) % PARSE_YIELD_EVERY_GAMES === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return parsedGames;
}
