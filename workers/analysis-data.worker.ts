/// <reference lib="webworker" />

import { OpeningGraphBuilder } from '../lib/chess/graph/openingGraph';
import { serializeOpeningGraph, snapshotPersistenceNotice } from '../lib/chess/graph/serialization';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { isWorkerRequest, PROTOCOL_VERSION } from './protocol';

const cancelledJobs = new Set<string>();
const PROGRESS_INTERVAL_MS = 50;

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
  const reportProgress = (builtCount: number, force = false): void => {
    const now = Date.now();
    if (!force && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
    lastProgressAt = now;
    post({
      protocolVersion: PROTOCOL_VERSION,
      jobId: request.jobId,
      type: 'PROGRESS',
      parsedCount: request.games.length,
      builtCount,
      diagnosticsCount: 0,
    });
  };
  reportProgress(0);
  if (cancelledJobs.delete(request.jobId)) {
    post({ protocolVersion: PROTOCOL_VERSION, jobId: request.jobId, type: 'CANCELLED' });
    return;
  }
  try {
    const graph = await new OpeningGraphBuilder(request.options).buildAsync(request.games, {
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
