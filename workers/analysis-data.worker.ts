/// <reference lib="webworker" />

import { OpeningGraphBuilder } from '../lib/chess/graph/openingGraph';
import { serializeOpeningGraph, snapshotPersistenceNotice } from '../lib/chess/graph/serialization';
import { parseGamePgn, type ParsedGame } from '../lib/chess/pgnParser';
import type { Diagnostic } from '../lib/api/contracts';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { isWorkerRequest, PROTOCOL_VERSION } from './protocol';

const cancelledJobs = new Set<string>();
const PROGRESS_INTERVAL_MS = 50;
const PARSE_YIELD_EVERY_GAMES = 25;
const MAX_DIAGNOSTICS = 100;
const MAX_DIAGNOSTIC_CODES = 20;

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
    const graph = await new OpeningGraphBuilder(request.options).buildAsync(parsedGames, {
      shouldCancel: () => cancelledJobs.has(request.jobId),
      onProgress: ({ includedGameCount }) => reportProgress(includedGameCount),
    });
    if (!graph || cancelledJobs.delete(request.jobId)) {
      post({ protocolVersion: PROTOCOL_VERSION, jobId: request.jobId, type: 'CANCELLED' });
      return;
    }
    const snapshot = serializeOpeningGraph(graph, {
      queryFingerprint: request.queryFingerprint ?? '',
      sourceGameCount: request.games.length,
      excludedGameCount: request.games.length - parsedGames.length,
      buildTimestamp: Date.now(),
    });
    const persistenceNotice = snapshotPersistenceNotice(snapshot);
    if (graph.status === 'limited')
      post({
        protocolVersion: PROTOCOL_VERSION,
        jobId: request.jobId,
        type: 'LIMITED',
        snapshot,
        reachedLimit: graph.reachedLimit ?? 'unknown',
        includedGameCount: graph.includedGameCount,
        remainingGameCount: graph.remainingGameCount,
        ...(persistenceNotice ? { persistenceNotice } : {}),
      });
    else
      post({
        protocolVersion: PROTOCOL_VERSION,
        jobId: request.jobId,
        type: 'COMPLETE',
        snapshot,
        ...(persistenceNotice ? { persistenceNotice } : {}),
      });
  } catch {
    post({
      protocolVersion: PROTOCOL_VERSION,
      jobId: request.jobId,
      type: 'FAILED',
      code: 'GRAPH_BUILD_FAILED',
      message: 'Graph build failed.',
    });
  }
}

async function validatePgnsInWorker(
  games: Extract<WorkerRequest, { type: 'VALIDATE_PGNS' }>['games'],
  jobId: string
): Promise<
  | {
      validGameIds: readonly string[];
      diagnostics: readonly Diagnostic[];
      totalInvalid: number;
      diagnosticCodes: readonly string[];
    }
  | undefined
> {
  const validGameIds: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const diagnosticCodes: string[] = [];
  let totalInvalid = 0;

  for (let index = 0; index < games.length; index += 1) {
    if (cancelledJobs.has(jobId)) return undefined;
    const result = parseGamePgn({ game: games[index]! });
    if (result.ok) validGameIds.push(games[index]!.id);
    else {
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
    if ((index + 1) % PARSE_YIELD_EVERY_GAMES === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  return { validGameIds, diagnostics, totalInvalid, diagnosticCodes };
}

async function parseGamesInWorker(
  games: Extract<WorkerRequest, { type: 'BUILD_GRAPH' }>['games'],
  jobId: string,
  onProgress: (
    parsedCount: number,
    diagnosticsCount: number,
    diagnosticCodes: readonly string[]
  ) => void
): Promise<ParsedGame[] | undefined> {
  const parsedGames: ParsedGame[] = [];
  let diagnosticsCount = 0;
  const diagnosticCodes: string[] = [];
  for (let index = 0; index < games.length; index += 1) {
    if (cancelledJobs.has(jobId)) return undefined;
    const result = parseGamePgn({ game: games[index]! });
    if (result.ok) parsedGames.push(result.game);
    else {
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
    onProgress(parsedGames.length, diagnosticsCount, diagnosticCodes);
    if ((index + 1) % PARSE_YIELD_EVERY_GAMES === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return parsedGames;
}
