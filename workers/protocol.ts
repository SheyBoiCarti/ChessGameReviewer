import type { Diagnostic, NormalizedGameSummary } from '../lib/api/contracts';
import type { GraphBuildOptions, OpeningGameProjection } from '../lib/chess/graph/types';
import {
  OPENING_PROJECTION_VERSION,
  PGN_PARSER_VERSION,
  POSITION_KEY_VERSION,
} from '../lib/chess/graph/types';
import type { SerializedOpeningGraph } from '../lib/chess/graph/serialization';

export const PROTOCOL_VERSION = 3;

export type WorkerRequest =
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'VALIDATE_PGNS';
      games: readonly NormalizedGameSummary[];
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'BUILD_GRAPH';
      games: readonly (NormalizedGameSummary | OpeningGameProjection)[];
      options: GraphBuildOptions;
      queryFingerprint: string;
    }
  | { protocolVersion: typeof PROTOCOL_VERSION; jobId: string; type: 'CANCEL_JOB' }
  | { protocolVersion: typeof PROTOCOL_VERSION; jobId: string; type: 'DISPOSE' };

export type WorkerResponse =
  | { protocolVersion: typeof PROTOCOL_VERSION; jobId: string; type: 'JOB_ACCEPTED' }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'PGN_VALIDATION_COMPLETE';
      validGameIds: readonly string[];
      projections: readonly OpeningGameProjection[];
      diagnostics: readonly Diagnostic[];
      totalInvalid: number;
      diagnosticCodes: readonly string[];
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'PROGRESS';
      parsedCount: number;
      builtCount: number;
      diagnosticsCount: number;
      diagnosticCodes: readonly string[];
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'COMPLETE';
      snapshot: SerializedOpeningGraph;
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'PARTIAL';
      snapshot: SerializedOpeningGraph;
      excludedGameCount: number;
      diagnosticCodes: readonly string[];
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'LIMITED';
      snapshot: SerializedOpeningGraph;
      reachedLimit: string;
      includedGameCount: number;
      remainingGameCount: number;
      excludedGameCount: number;
      diagnosticCodes: readonly string[];
    }
  | { protocolVersion: typeof PROTOCOL_VERSION; jobId: string; type: 'CANCELLED' }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'FAILED';
      code: string;
      message: string;
    };

export function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (
    !isRecord(value) ||
    value.protocolVersion !== PROTOCOL_VERSION ||
    typeof value.jobId !== 'string' ||
    value.jobId.length === 0 ||
    typeof value.type !== 'string'
  )
    return false;
  if (value.type === 'CANCEL_JOB' || value.type === 'DISPOSE') return true;
  if (value.type === 'VALIDATE_PGNS')
    return Array.isArray(value.games) && value.games.every(isNormalizedGameSummary);
  return (
    value.type === 'BUILD_GRAPH' &&
    Array.isArray(value.games) &&
    value.games.every((g) => isNormalizedGameSummary(g) || isOpeningGameProjection(g)) &&
    typeof value.queryFingerprint === 'string' &&
    value.queryFingerprint.length > 0 &&
    isGraphBuildOptions(value.options)
  );
}

export function isOpeningGameProjection(value: unknown): value is OpeningGameProjection {
  if (!isRecord(value)) return false;
  return (
    value.projectionVersion === OPENING_PROJECTION_VERSION &&
    value.parserVersion === PGN_PARSER_VERSION &&
    value.positionVersion === POSITION_KEY_VERSION &&
    typeof value.pgnDigest === 'string' &&
    /^[a-f0-9]{64}$/.test(value.pgnDigest) &&
    typeof value.id === 'string' &&
    typeof value.usernameKey === 'string' &&
    (value.userColor === 'white' || value.userColor === 'black') &&
    (value.result === 'win' || value.result === 'draw' || value.result === 'loss') &&
    typeof value.endedAt === 'number' &&
    Number.isFinite(value.endedAt) &&
    Array.isArray(value.plies) &&
    value.plies.length <= 40 &&
    value.plies.every(
      (ply, i, plies) =>
        isRecord(ply) &&
        ply.ply === i + 1 &&
        typeof ply.san === 'string' &&
        typeof ply.uci === 'string' &&
        /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(ply.uci) &&
        typeof ply.fenBefore === 'string' &&
        typeof ply.fenAfter === 'string' &&
        typeof ply.positionBefore === 'string' &&
        typeof ply.positionAfter === 'string' &&
        (i === 0 || (isRecord(plies[i - 1]) && plies[i - 1].fenAfter === ply.fenBefore))
    )
  );
}

function isNormalizedGameSummary(value: unknown): value is NormalizedGameSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.url === 'string' &&
    typeof value.usernameKey === 'string' &&
    (value.userColor === 'white' || value.userColor === 'black') &&
    (value.result === 'win' || value.result === 'draw' || value.result === 'loss') &&
    typeof value.endedAt === 'number' &&
    (value.timeClass === 'bullet' ||
      value.timeClass === 'blitz' ||
      value.timeClass === 'rapid' ||
      value.timeClass === 'daily') &&
    typeof value.rated === 'boolean' &&
    (typeof value.userRating === 'number' || value.userRating === null) &&
    (typeof value.opponentRating === 'number' || value.opponentRating === null) &&
    value.rules === 'chess' &&
    (typeof value.pgn === 'string' || value.pgn === undefined)
  );
}

function isGraphBuildOptions(value: unknown): value is GraphBuildOptions {
  return (
    isRecord(value) &&
    Number.isInteger(value.maxOpeningPlies) &&
    typeof value.maxOpeningPlies === 'number' &&
    value.maxOpeningPlies >= 2 &&
    value.maxOpeningPlies <= 40 &&
    typeof value.includeRepeatedPositions === 'boolean' &&
    (value.maxBytes === undefined ||
      (Number.isSafeInteger(value.maxBytes) && Number(value.maxBytes) > 0)) &&
    (value.structuralLimits === undefined ||
      (isRecord(value.structuralLimits) &&
        Object.entries(value.structuralLimits).every(
          ([key, limit]) =>
            ['maxPositions', 'maxEdges', 'maxPathNodes'].includes(key) &&
            Number.isSafeInteger(limit) &&
            Number(limit) > 0
        )))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
