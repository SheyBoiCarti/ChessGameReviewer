import type { NormalizedGameSummary } from '../../lib/api/contracts';
import type { GameRecord } from '../../lib/db/schema';
import { PROTOCOL_VERSION, type WorkerResponse } from '../../workers/protocol';
import type { PgnValidationResult } from './types';

interface ActiveValidation {
  jobId: string;
  signal: AbortSignal;
  onAbort: () => void;
  resolve: (result: PgnValidationResult) => void;
  reject: (reason: Error) => void;
}

export class PgnValidationWorkerClient {
  private worker: Worker | null = null;
  private active: ActiveValidation | null = null;
  private disposed = false;

  constructor(private readonly workerFactory: () => Worker) {}

  validate(
    games: readonly GameRecord[],
    signal: AbortSignal
  ): Promise<PgnValidationResult> {
    if (this.disposed) return Promise.reject(new Error('PGN_VALIDATION_CLIENT_DISPOSED'));
    if (signal.aborted) return Promise.reject(abortError());
    this.cancel();

    const worker = this.getWorker();
    const jobId = crypto.randomUUID();
    return new Promise<PgnValidationResult>((resolve, reject) => {
      const onAbort = (): void => this.cancelJob(jobId);
      this.active = { jobId, signal, onAbort, resolve, reject };
      signal.addEventListener('abort', onAbort, { once: true });
      worker.postMessage({
        protocolVersion: PROTOCOL_VERSION,
        jobId,
        type: 'VALIDATE_PGNS',
        games: games.map(toNormalizedGameSummary),
      });
    });
  }

  cancel(): void {
    if (this.active) this.cancelJob(this.active.jobId);
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.retireWorker();
    this.disposed = true;
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = this.workerFactory();
      this.worker.addEventListener('message', this.onMessage);
      this.worker.addEventListener('error', this.onError);
    }
    return this.worker;
  }

  private cancelJob(jobId: string): void {
    if (!this.active || this.active.jobId !== jobId) return;
    this.worker?.postMessage({
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      type: 'CANCEL_JOB',
    });
    const reject = this.active.reject;
    this.clearActive();
    this.retireWorker();
    reject(abortError());
  }

  private readonly onMessage = (event: MessageEvent<WorkerResponse>): void => {
    const response = event.data;
    if (
      response.protocolVersion !== PROTOCOL_VERSION ||
      !this.active ||
      response.jobId !== this.active.jobId
    ) {
      return;
    }
    if (response.type === 'PGN_VALIDATION_COMPLETE') {
      const resolve = this.active.resolve;
      this.clearActive();
      resolve({
        validGameIds: response.validGameIds,
        diagnostics: response.diagnostics,
        totalInvalid: response.totalInvalid,
        diagnosticCodes: response.diagnosticCodes,
      });
    } else if (response.type === 'CANCELLED') {
      this.fail(abortError());
    } else if (response.type === 'FAILED') {
      this.fail(new Error(`${response.code}: ${response.message}`));
    }
  };

  private readonly onError = (): void => {
    this.fail(new Error('PGN_VALIDATION_WORKER_FAILED'));
    this.retireWorker();
  };

  private fail(error: Error): void {
    if (!this.active) return;
    const reject = this.active.reject;
    this.clearActive();
    reject(error);
  }

  private clearActive(): void {
    if (!this.active) return;
    this.active.signal.removeEventListener('abort', this.active.onAbort);
    this.active = null;
  }

  private retireWorker(): void {
    if (!this.worker) return;
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onError);
    this.worker.terminate();
    this.worker = null;
  }
}

function toNormalizedGameSummary(game: GameRecord): NormalizedGameSummary {
  return {
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
    ...(game.accuracies ? { accuracies: game.accuracies } : {}),
    pgn: game.pgn,
    rules: game.rules,
  };
}

function abortError(): DOMException {
  return new DOMException('PGN validation was cancelled.', 'AbortError');
}
