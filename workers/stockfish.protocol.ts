import type { EvaluationLimit, EvaluationResult } from '../lib/engine/stockfishAdapter';
import type { EngineResources } from '../lib/engine/resourcePolicy';

export const ENGINE_WORKER_PROTOCOL_VERSION = 1;

export type EngineWorkerRequest =
  | { protocolVersion: typeof ENGINE_WORKER_PROTOCOL_VERSION; jobId: string; type: 'INITIALIZE'; mode: 'threaded' | 'single-thread'; resources: EngineResources }
  | { protocolVersion: typeof ENGINE_WORKER_PROTOCOL_VERSION; jobId: string; type: 'EVALUATE'; fen: string; limit: EvaluationLimit; multiPv: number }
  | { protocolVersion: typeof ENGINE_WORKER_PROTOCOL_VERSION; jobId: string; type: 'STOP' }
  | { protocolVersion: typeof ENGINE_WORKER_PROTOCOL_VERSION; jobId: string; type: 'NEW_GAME' }
  | { protocolVersion: typeof ENGINE_WORKER_PROTOCOL_VERSION; jobId: string; type: 'DISPOSE' };

export type EngineWorkerResponse =
  | { protocolVersion: typeof ENGINE_WORKER_PROTOCOL_VERSION; jobId: string; type: 'READY' }
  | { protocolVersion: typeof ENGINE_WORKER_PROTOCOL_VERSION; jobId: string; type: 'RESULT'; result: EvaluationResult }
  | { protocolVersion: typeof ENGINE_WORKER_PROTOCOL_VERSION; jobId: string; type: 'STOPPED' }
  | { protocolVersion: typeof ENGINE_WORKER_PROTOCOL_VERSION; jobId: string; type: 'FAILED'; code: string; message: string };

export function isEngineWorkerRequest(value: unknown): value is EngineWorkerRequest {
  if (!record(value) || value.protocolVersion !== ENGINE_WORKER_PROTOCOL_VERSION || typeof value.jobId !== 'string' || value.jobId.length === 0) return false;
  if (value.type === 'STOP' || value.type === 'NEW_GAME' || value.type === 'DISPOSE') return true;
  if (value.type === 'INITIALIZE') return (value.mode === 'threaded' || value.mode === 'single-thread') && resources(value.resources);
  return value.type === 'EVALUATE' && typeof value.fen === 'string' && record(value.limit) && typeof value.multiPv === 'number' && Number.isInteger(value.multiPv) && value.multiPv > 0;
}

function resources(value: unknown): value is EngineResources {
  return record(value) && Number.isInteger(value.threads) && typeof value.threads === 'number' && value.threads >= 1 && Number.isInteger(value.hashMb) && typeof value.hashMb === 'number' && value.hashMb >= 1;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
