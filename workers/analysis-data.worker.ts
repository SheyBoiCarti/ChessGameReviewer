/// <reference lib="webworker" />

import { OpeningGraphBuilder } from '../lib/chess/graph/openingGraph';
import { serializeOpeningGraph } from '../lib/chess/graph/serialization';
import type { WorkerRequest, WorkerResponse } from './protocol';
import { isWorkerRequest, PROTOCOL_VERSION } from './protocol';

const cancelledJobs = new Set<string>();

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (!isWorkerRequest(event.data)) return;
  void handleRequest(event.data, (response) => self.postMessage(response));
});

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
  if (cancelledJobs.delete(request.jobId)) {
    post({ protocolVersion: PROTOCOL_VERSION, jobId: request.jobId, type: 'CANCELLED' });
    return;
  }
  try {
    const graph = new OpeningGraphBuilder(request.options).build(request.games);
    if (cancelledJobs.delete(request.jobId)) {
      post({ protocolVersion: PROTOCOL_VERSION, jobId: request.jobId, type: 'CANCELLED' });
      return;
    }
    const snapshot = serializeOpeningGraph(graph, {
      queryFingerprint: '',
      sourceGameCount: request.games.length,
      buildTimestamp: Date.now(),
    });
    if (graph.status === 'limited')
      post({
        protocolVersion: PROTOCOL_VERSION,
        jobId: request.jobId,
        type: 'LIMITED',
        snapshot,
        reachedLimit: graph.reachedLimit ?? 'unknown',
        includedGameCount: graph.includedGameCount,
        remainingGameCount: graph.remainingGameCount,
      });
    else
      post({ protocolVersion: PROTOCOL_VERSION, jobId: request.jobId, type: 'COMPLETE', snapshot });
  } catch (error) {
    post({
      protocolVersion: PROTOCOL_VERSION,
      jobId: request.jobId,
      type: 'FAILED',
      code: 'GRAPH_BUILD_FAILED',
      message: error instanceof Error ? error.message : 'Graph build failed.',
    });
  }
}
