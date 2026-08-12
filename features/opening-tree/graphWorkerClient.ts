import type { NormalizedGameSummary } from '../../lib/api/contracts';
import type { SerializedOpeningGraph } from '../../lib/chess/graph/serialization';
import type { GraphBuildOptions } from '../../lib/chess/graph/types';
import {
  PROTOCOL_VERSION,
  type SnapshotPersistenceNotice,
  type WorkerResponse,
} from '../../workers/protocol';

export type GraphBuildWorkerResult =
  | {
      status: 'complete';
      snapshot: SerializedOpeningGraph;
      persistenceNotice?: SnapshotPersistenceNotice;
    }
  | {
      status: 'limited';
      snapshot: SerializedOpeningGraph;
      reachedLimit: string;
      includedGameCount: number;
      remainingGameCount: number;
      persistenceNotice?: SnapshotPersistenceNotice;
    };

export class GraphWorkerClient {
  private jobId: string | undefined;
  private settle: ((result: GraphBuildWorkerResult) => void) | undefined;
  private reject: ((reason: Error) => void) | undefined;

  constructor(private readonly worker: Worker) {
    worker.addEventListener('message', this.onMessage);
    worker.addEventListener('error', this.onError);
  }

  build(
    games: readonly NormalizedGameSummary[],
    options: GraphBuildOptions,
    queryFingerprint = ''
  ): Promise<GraphBuildWorkerResult> {
    this.cancel();
    const jobId = crypto.randomUUID();
    this.jobId = jobId;
    return new Promise<GraphBuildWorkerResult>((resolve, reject) => {
      this.settle = resolve;
      this.reject = reject;
      this.worker.postMessage({
        protocolVersion: PROTOCOL_VERSION,
        jobId,
        type: 'BUILD_GRAPH',
        games,
        options,
        queryFingerprint,
      });
    });
  }

  cancel(): void {
    if (!this.jobId) return;
    this.worker.postMessage({
      protocolVersion: PROTOCOL_VERSION,
      jobId: this.jobId,
      type: 'CANCEL_JOB',
    });
    this.reject?.(new Error('GRAPH_BUILD_CANCELLED'));
    this.clearPending();
  }

  dispose(): void {
    this.cancel();
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onError);
    this.worker.terminate();
  }

  private readonly onMessage = (event: MessageEvent<WorkerResponse>): void => {
    const response = event.data;
    if (response.protocolVersion !== PROTOCOL_VERSION || response.jobId !== this.jobId) return;
    if (response.type === 'COMPLETE')
      this.finish({
        status: 'complete',
        snapshot: response.snapshot,
        ...(response.persistenceNotice ? { persistenceNotice: response.persistenceNotice } : {}),
      });
    if (response.type === 'LIMITED')
      this.finish({
        status: 'limited',
        snapshot: response.snapshot,
        reachedLimit: response.reachedLimit,
        includedGameCount: response.includedGameCount,
        remainingGameCount: response.remainingGameCount,
        ...(response.persistenceNotice ? { persistenceNotice: response.persistenceNotice } : {}),
      });
    if (response.type === 'CANCELLED') this.fail(new Error('GRAPH_BUILD_CANCELLED'));
    if (response.type === 'FAILED') this.fail(new Error(`${response.code}: ${response.message}`));
  };

  private readonly onError = (): void => this.fail(new Error('GRAPH_WORKER_FAILED'));
  private finish(result: GraphBuildWorkerResult): void {
    const settle = this.settle;
    this.clearPending();
    settle?.(result);
  }
  private fail(error: Error): void {
    const reject = this.reject;
    this.clearPending();
    reject?.(error);
  }
  private clearPending(): void {
    this.jobId = undefined;
    this.settle = undefined;
    this.reject = undefined;
  }
}
