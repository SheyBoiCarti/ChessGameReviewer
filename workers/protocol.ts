import type { NormalizedGameSummary } from '../lib/api/contracts';
import type { GraphBuildOptions } from '../lib/chess/graph/types';
import type { SerializedOpeningGraph } from '../lib/chess/graph/serialization';

export const PROTOCOL_VERSION = 1;
export type SnapshotPersistenceNotice = 'SNAPSHOT_TOO_LARGE_TO_PERSIST';

export type WorkerRequest =
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'BUILD_GRAPH';
      games: readonly NormalizedGameSummary[];
      options: GraphBuildOptions;
      queryFingerprint?: string;
    }
  | { protocolVersion: typeof PROTOCOL_VERSION; jobId: string; type: 'CANCEL_JOB' }
  | { protocolVersion: typeof PROTOCOL_VERSION; jobId: string; type: 'DISPOSE' };

export type WorkerResponse =
  | { protocolVersion: typeof PROTOCOL_VERSION; jobId: string; type: 'JOB_ACCEPTED' }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'PROGRESS';
      parsedCount: number;
      builtCount: number;
      diagnosticsCount: number;
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'COMPLETE';
      snapshot: SerializedOpeningGraph;
      persistenceNotice?: SnapshotPersistenceNotice;
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'LIMITED';
      snapshot: SerializedOpeningGraph;
      reachedLimit: string;
      includedGameCount: number;
      remainingGameCount: number;
      persistenceNotice?: SnapshotPersistenceNotice;
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
  return (
    value.type === 'BUILD_GRAPH' &&
    Array.isArray(value.games) &&
    value.games.every(isNormalizedGameSummary) &&
    isGraphBuildOptions(value.options)
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
    typeof value.includeRepeatedPositions === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
