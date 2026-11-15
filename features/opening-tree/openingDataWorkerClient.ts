import type { Diagnostic, NormalizedGameSummary } from '../../lib/api/contracts';
import { createAbortError } from '../../lib/api/errors';
import type { GameRecord } from '../../lib/db/schema';
import type { GraphBuildOptions, OpeningGameProjection } from '../../lib/chess/graph/types';
import { computePgnDigest } from '../stockfish-analysis/reviewIdentity';
import {
  OPENING_PROJECTION_VERSION,
  PGN_PARSER_VERSION,
  POSITION_KEY_VERSION,
} from '../../lib/chess/graph/types';
import {
  isOpeningGameProjection,
  PROTOCOL_VERSION,
  type WorkerResponse,
} from '../../workers/protocol';
import type { PgnValidationResult } from '../ingestion/types';
import type { GraphBuildWorkerResult } from './graphWorkerClient';

interface BaseJob {
  jobId: string;
  subscribers: Map<string, { signal?: AbortSignal; onAbort?: () => void }>;
}

interface ValidateJob extends BaseJob {
  type: 'validate';
  resolve: (result: PgnValidationResult) => void;
  reject: (reason: Error) => void;
}

interface BuildJob extends BaseJob {
  type: 'build';
  resolve: (result: GraphBuildWorkerResult) => void;
  reject: (reason: Error) => void;
}

type ActiveJob = ValidateJob | BuildJob;

export class OpeningDataWorkerClient {
  private worker: Worker | null = null;
  private readonly workerFactory: () => Worker;
  private readonly restartable: boolean;
  private failure: Error | null = null;
  private readonly jobs = new Map<string, ActiveJob>();
  private readonly projections = new Map<string, OpeningGameProjection>();
  private readonly projectionBytes = new Map<string, number>();
  private totalProjectionBytes = 0;
  private disposed = false;
  private generation = 0;

  constructor(workerOrFactory: Worker | (() => Worker)) {
    this.restartable = typeof workerOrFactory === 'function';
    if (typeof workerOrFactory === 'function') {
      this.workerFactory = workerOrFactory;
    } else {
      this.workerFactory = () => workerOrFactory;
      this.worker = workerOrFactory;
      workerOrFactory.addEventListener('message', this.onMessage);
      workerOrFactory.addEventListener('error', this.onError);
    }
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = this.workerFactory();
      this.worker.addEventListener('message', this.onMessage);
      this.worker.addEventListener('error', this.onError);
    }
    return this.worker;
  }

  validate(games: readonly GameRecord[], signal?: AbortSignal): Promise<PgnValidationResult> {
    if (this.disposed) return Promise.reject(new Error('OPENING_DATA_WORKER_DISPOSED'));
    if (this.failure) return Promise.reject(this.failure);
    if (signal?.aborted) return Promise.reject(createAbortError());

    const worker = this.getWorker();
    const jobId = crypto.randomUUID();
    const subscriberId = crypto.randomUUID();

    return new Promise<PgnValidationResult>((resolve, reject) => {
      const subscribers = new Map<string, { signal?: AbortSignal; onAbort?: () => void }>();

      const job: ValidateJob = {
        type: 'validate',
        jobId,
        subscribers,
        resolve,
        reject,
      };

      if (signal) {
        const onAbort = (): void => {
          subscribers.delete(subscriberId);
          if (subscribers.size === 0) {
            this.sendCancel(jobId);
            this.jobs.delete(jobId);
          }
          reject(createAbortError());
        };
        signal.addEventListener('abort', onAbort, { once: true });
        subscribers.set(subscriberId, { signal, onAbort });
      } else {
        subscribers.set(subscriberId, {});
      }

      this.jobs.set(jobId, job);
      worker.postMessage({
        protocolVersion: PROTOCOL_VERSION,
        jobId,
        type: 'VALIDATE_PGNS',
        games: games.map(toNormalizedGameSummary),
      });
    });
  }

  async build(
    games: readonly (NormalizedGameSummary | GameRecord)[],
    options: GraphBuildOptions,
    queryFingerprint: string,
    signal?: AbortSignal
  ): Promise<GraphBuildWorkerResult> {
    if (this.disposed) return Promise.reject(new Error('OPENING_DATA_WORKER_DISPOSED'));
    if (this.failure) return Promise.reject(this.failure);
    if (!queryFingerprint) return Promise.reject(new Error('MISSING_QUERY_FINGERPRINT'));
    if (signal?.aborted) return Promise.reject(createAbortError());

    const worker = this.getWorker();
    const jobId = crypto.randomUUID();
    const subscriberId = crypto.randomUUID();

    const generation = this.generation;
    const gamesWithProjections = await Promise.all(
      games.map(async (rawGame) => {
        const game = 'usernameKey' in rawGame ? rawGame : toNormalizedGameSummary(rawGame);
        const cached = game.openingProjection ?? this.projections.get(game.id);
        if (
          isOpeningGameProjection(cached) &&
          cached.projectionVersion === OPENING_PROJECTION_VERSION &&
          cached.parserVersion === PGN_PARSER_VERSION &&
          cached.positionVersion === POSITION_KEY_VERSION &&
          cached.id === game.id &&
          cached.pgnDigest === (await computePgnDigest(game.pgn ?? '')) &&
          [
            'usernameKey',
            'userColor',
            'result',
            'endedAt',
            'timeClass',
            'rated',
            'userRating',
            'opponentRating',
            'whitePlayer',
            'blackPlayer',
            'accuracies',
          ].every(
            (field) =>
              JSON.stringify(cached[field as keyof OpeningGameProjection]) ===
              JSON.stringify(game[field as keyof NormalizedGameSummary])
          )
        ) {
          return cached;
        }
        return game;
      })
    );
    if (this.disposed || signal?.aborted || generation !== this.generation)
      throw createAbortError();

    return new Promise<GraphBuildWorkerResult>((resolve, reject) => {
      const subscribers = new Map<string, { signal?: AbortSignal; onAbort?: () => void }>();

      const job: BuildJob = {
        type: 'build',
        jobId,
        subscribers,
        resolve,
        reject,
      };

      if (signal) {
        const onAbort = (): void => {
          subscribers.delete(subscriberId);
          if (subscribers.size === 0) {
            this.sendCancel(jobId);
            this.jobs.delete(jobId);
          }
          reject(new Error('GRAPH_BUILD_CANCELLED'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        subscribers.set(subscriberId, { signal, onAbort });
      } else {
        subscribers.set(subscriberId, {});
      }

      this.jobs.set(jobId, job);
      worker.postMessage({
        protocolVersion: PROTOCOL_VERSION,
        jobId,
        type: 'BUILD_GRAPH',
        games: gamesWithProjections,
        options,
        queryFingerprint,
      });
    });
  }

  cancel(jobId?: string): void {
    if (jobId) {
      const job = this.jobs.get(jobId);
      if (!job) return;
      this.sendCancel(jobId);
      this.cleanupJobSubscribers(job);
      this.jobs.delete(jobId);
      job.reject(job.type === 'validate' ? createAbortError() : new Error('GRAPH_BUILD_CANCELLED'));
    } else {
      for (const [id, job] of Array.from(this.jobs.entries())) {
        this.sendCancel(id);
        this.cleanupJobSubscribers(job);
        this.jobs.delete(id);
        job.reject(
          job.type === 'validate' ? createAbortError() : new Error('GRAPH_BUILD_CANCELLED')
        );
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation++;
    this.cancel();
    if (this.worker) {
      this.worker.removeEventListener('message', this.onMessage);
      this.worker.removeEventListener('error', this.onError);
      this.worker.terminate();
      this.worker = null;
    }
    this.projections.clear();
    this.projectionBytes.clear();
    this.totalProjectionBytes = 0;
  }

  clearUserData(): void {
    if (!this.restartable) this.failure = new Error('OPENING_DATA_WORKER_RESTART_REQUIRED');
    this.generation++;
    this.cancel();
    if (this.worker) {
      this.worker.removeEventListener('message', this.onMessage);
      this.worker.removeEventListener('error', this.onError);
      this.worker.terminate();
      this.worker = null;
    }
    this.projections.clear();
    this.projectionBytes.clear();
    this.totalProjectionBytes = 0;
  }

  storeProjections(projections: readonly OpeningGameProjection[]): void {
    for (const projection of projections) {
      this.storeProjection(projection);
    }
  }

  getProjection(id: string): OpeningGameProjection | undefined {
    return this.projections.get(id);
  }

  private storeProjection(projection: OpeningGameProjection): void {
    if (this.projections.has(projection.id)) {
      this.totalProjectionBytes -= this.projectionBytes.get(projection.id) ?? 0;
      this.projectionBytes.delete(projection.id);
      this.projections.delete(projection.id);
    }
    const byteSize = new TextEncoder().encode(JSON.stringify(projection)).byteLength;
    if (byteSize > 64 * 1024 * 1024) return;
    while (
      this.projections.size >= 1000 ||
      this.totalProjectionBytes + byteSize > 64 * 1024 * 1024
    ) {
      const oldest = this.projections.keys().next().value;
      if (oldest === undefined) break;
      this.totalProjectionBytes -= this.projectionBytes.get(oldest) ?? 0;
      this.projectionBytes.delete(oldest);
      this.projections.delete(oldest);
    }
    this.totalProjectionBytes += byteSize;
    this.projectionBytes.set(projection.id, byteSize);
    this.projections.set(projection.id, projection);
  }

  private sendCancel(jobId: string): void {
    this.worker?.postMessage({
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      type: 'CANCEL_JOB',
    });
  }

  private cleanupJobSubscribers(job: ActiveJob): void {
    for (const sub of Array.from(job.subscribers.values())) {
      if (sub.signal && sub.onAbort) {
        sub.signal.removeEventListener('abort', sub.onAbort);
      }
    }
    job.subscribers.clear();
  }

  private readonly onMessage = (event: MessageEvent<WorkerResponse>): void => {
    const response = event.data;
    if (response.protocolVersion !== PROTOCOL_VERSION) return;
    const job = this.jobs.get(response.jobId);
    if (!job) return;

    if (response.type === 'PGN_VALIDATION_COMPLETE' && job.type === 'validate') {
      if (response.projections) {
        this.storeProjections(response.projections);
      }
      this.cleanupJobSubscribers(job);
      this.jobs.delete(response.jobId);
      job.resolve({
        validGameIds: response.validGameIds,
        projections: response.projections,
        diagnostics: response.diagnostics,
        totalInvalid: response.totalInvalid,
        diagnosticCodes: response.diagnosticCodes,
      });
      return;
    }

    if (job.type === 'build') {
      if (response.type === 'COMPLETE') {
        this.cleanupJobSubscribers(job);
        this.jobs.delete(response.jobId);
        job.resolve({
          status: 'complete',
          snapshot: response.snapshot,
        });
        return;
      }
      if (response.type === 'PARTIAL') {
        this.cleanupJobSubscribers(job);
        this.jobs.delete(response.jobId);
        job.resolve({
          status: 'partial',
          snapshot: response.snapshot,
          excludedGameCount: response.excludedGameCount,
          diagnosticCodes: response.diagnosticCodes,
        });
        return;
      }
      if (response.type === 'LIMITED') {
        this.cleanupJobSubscribers(job);
        this.jobs.delete(response.jobId);
        job.resolve({
          status: 'limited',
          snapshot: response.snapshot,
          reachedLimit: response.reachedLimit,
          includedGameCount: response.includedGameCount,
          remainingGameCount: response.remainingGameCount,
          excludedGameCount: response.excludedGameCount,
          diagnosticCodes: response.diagnosticCodes,
        });
        return;
      }
    }

    if (response.type === 'CANCELLED') {
      this.cleanupJobSubscribers(job);
      this.jobs.delete(response.jobId);
      job.reject(job.type === 'validate' ? createAbortError() : new Error('GRAPH_BUILD_CANCELLED'));
      return;
    }

    if (response.type === 'FAILED') {
      this.cleanupJobSubscribers(job);
      this.jobs.delete(response.jobId);
      job.reject(new Error(`${response.code}: ${response.message}`));
      return;
    }
  };

  private readonly onError = (): void => {
    this.generation++;
    if (this.worker) {
      this.worker.removeEventListener('message', this.onMessage);
      this.worker.removeEventListener('error', this.onError);
      this.worker.terminate();
      this.worker = null;
    }
    this.projections.clear();
    this.projectionBytes.clear();
    this.totalProjectionBytes = 0;
    const error = new Error('OPENING_DATA_WORKER_FAILED');
    if (!this.restartable) this.failure = error;
    for (const [id, job] of Array.from(this.jobs.entries())) {
      this.cleanupJobSubscribers(job);
      this.jobs.delete(id);
      job.reject(error);
    }
  };
}

function toNormalizedGameSummary(record: GameRecord): NormalizedGameSummary {
  return {
    ...(record.openingProjection ? { openingProjection: record.openingProjection } : {}),
    id: record.id,
    url: record.url,
    ...(record.uuid ? { uuid: record.uuid } : {}),
    usernameKey: record.username.toLowerCase(),
    userColor: record.userColor,
    result: record.result,
    endedAt: record.endedAt,
    timeClass: record.timeClass,
    rated: record.rated,
    userRating: record.userRating,
    opponentRating: record.opponentRating,
    whitePlayer: record.whitePlayer,
    blackPlayer: record.blackPlayer,
    ...(record.accuracies ? { accuracies: record.accuracies } : {}),
    rules: record.rules,
    pgn: record.pgn,
  };
}
