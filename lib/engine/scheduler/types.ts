export type EngineJobPriority = 1 | 2 | 3;

export interface EngineJob<TPayload> {
  id: string;
  priority: EngineJobPriority;
  relevanceToken: string;
  createdAt: number;
  deadlineAt: number;
  payload: TPayload;
  signal?: AbortSignal;
  /** A batch job is requeued after preemption only while this signal remains active. */
  parentSignal?: AbortSignal;
}

export interface ScheduledEngineAdapter<TPayload = unknown, TResult = unknown> {
  initialize?(): Promise<void>;
  evaluate(job: TPayload, signal?: AbortSignal): Promise<TResult>;
  stop(): void | Promise<void>;
  dispose(): void;
}

export class EngineSchedulerError extends Error {
  constructor(
    readonly code: 'ENGINE_DISABLED' | 'ENGINE_DISPOSED' | 'ENGINE_TIMEOUT' | 'ENGINE_CRASHED',
    message: string
  ) {
    super(message);
    this.name = 'EngineSchedulerError';
  }
}
