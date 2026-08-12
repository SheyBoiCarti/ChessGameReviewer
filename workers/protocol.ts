import type { ParsedGame } from '../lib/chess/pgnParser';
import type { GraphBuildOptions } from '../lib/chess/graph/types';
import type { SerializedOpeningGraph } from '../lib/chess/graph/serialization';

export const PROTOCOL_VERSION = 1;

export type WorkerRequest =
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'BUILD_GRAPH';
      games: readonly ParsedGame[];
      options: GraphBuildOptions;
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
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      jobId: string;
      type: 'LIMITED';
      snapshot: SerializedOpeningGraph;
      reachedLimit: string;
      includedGameCount: number;
      remainingGameCount: number;
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
    isRecord(value.options) &&
    Number.isInteger(value.options.maxOpeningPlies) &&
    typeof value.options.includeRepeatedPositions === 'boolean'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
