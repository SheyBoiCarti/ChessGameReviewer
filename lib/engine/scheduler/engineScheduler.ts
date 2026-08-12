import { EngineSchedulerError, type EngineJob, type ScheduledEngineAdapter } from './types';

interface QueueEntry<TPayload, TResult> {
  job: EngineJob<TPayload>;
  resolve: (value: TResult) => void;
  reject: (reason: Error) => void;
  sequence: number;
  retries: number;
}

interface ActiveEntry<TPayload, TResult> extends QueueEntry<TPayload, TResult> {
  controller: AbortController;
  preempted: boolean;
  deadlineTimer: ReturnType<typeof setTimeout> | undefined;
}

export interface EngineSchedulerOptions<TPayload, TResult> {
  createAdapter?: () => ScheduledEngineAdapter<TPayload, TResult>;
  now?: () => number;
}

/** A single-engine, priority-stable queue. It never creates a pool. */
export class EngineScheduler<TPayload = unknown, TResult = unknown> {
  private adapter: ScheduledEngineAdapter<TPayload, TResult>;
  private readonly queue: QueueEntry<TPayload, TResult>[] = [];
  private active: ActiveEntry<TPayload, TResult> | undefined;
  private sequence = 0;
  private pumping = false;
  private disposed = false;
  private disabled = false;
  private hidden = false;
  private userActivityWhileHidden = false;

  constructor(
    adapter: ScheduledEngineAdapter<TPayload, TResult>,
    private readonly options: EngineSchedulerOptions<TPayload, TResult> = {}
  ) {
    this.adapter = adapter;
  }

  schedule(job: EngineJob<TPayload>): Promise<TResult> {
    if (this.disposed) return Promise.reject(disposedError());
    if (this.disabled) return Promise.reject(disabledError());
    if (job.signal?.aborted) return Promise.reject(abortError());
    if (this.now() >= job.deadlineAt) return Promise.reject(timeoutError());
    return new Promise<TResult>((resolve, reject) => {
      const entry: QueueEntry<TPayload, TResult> = {
        job,
        resolve,
        reject,
        sequence: this.sequence++,
        retries: 0,
      };
      if (job.priority === 1) this.supersedeQueuedInteractive(entry);
      this.queue.push(entry);
      this.requestPreemption(entry);
      void this.pump();
    });
  }

  setDocumentHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (!hidden) this.userActivityWhileHidden = false;
    if (hidden && this.active && this.active.job.priority > 1) this.preempt(this.active);
    void this.pump();
  }

  notifyUserActivity(): void {
    this.userActivityWhileHidden = true;
    void this.pump();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.active) {
      this.active.controller.abort();
      clearTimeout(this.active.deadlineTimer);
      this.active.reject(abortError());
      void this.adapter.stop();
      this.active = undefined;
    }
    this.rejectQueued(disposedError());
    this.adapter.dispose();
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.active || this.disposed || this.disabled) return;
    this.pumping = true;
    try {
      while (!this.active && !this.disposed && !this.disabled) {
        const entry = this.takeNextRunnable();
        if (!entry) return;
        if (entry.job.signal?.aborted) {
          entry.reject(abortError());
          continue;
        }
        if (this.now() >= entry.job.deadlineAt) {
          entry.reject(timeoutError());
          continue;
        }
        const controller = new AbortController();
        const active: ActiveEntry<TPayload, TResult> = {
          ...entry,
          controller,
          preempted: false,
          deadlineTimer: undefined,
        };
        this.active = active;
        const remaining = Math.max(0, entry.job.deadlineAt - this.now());
        active.deadlineTimer = setTimeout(() => {
          if (this.active !== active) return;
          controller.abort();
          void this.adapter.stop();
        }, remaining);
        try {
          const result = await this.adapter.evaluate(entry.job.payload, controller.signal);
          this.completeActive(active, result);
        } catch (reason) {
          await this.failActive(active, asError(reason));
        }
      }
    } finally {
      this.pumping = false;
      if (!this.active && this.queue.length && !this.disposed && !this.disabled) void this.pump();
    }
  }

  private completeActive(active: ActiveEntry<TPayload, TResult>, result: TResult): void {
    if (this.active !== active) return;
    clearTimeout(active.deadlineTimer);
    this.active = undefined;
    if (this.disposed) return;
    if (active.preempted) {
      if (!active.job.parentSignal?.aborted && !active.job.signal?.aborted)
        this.queue.push({ ...active, retries: active.retries });
      else active.reject(abortError());
      return;
    }
    if (active.controller.signal.aborted)
      active.reject(this.now() >= active.job.deadlineAt ? timeoutError() : abortError());
    else active.resolve(result);
  }

  private async failActive(active: ActiveEntry<TPayload, TResult>, error: Error): Promise<void> {
    if (this.active !== active) return;
    clearTimeout(active.deadlineTimer);
    this.active = undefined;
    if (this.disposed) return;
    if (active.preempted || active.controller.signal.aborted) {
      if (active.preempted && !active.job.parentSignal?.aborted && !active.job.signal?.aborted)
        this.queue.push({ ...active, retries: active.retries });
      else active.reject(this.now() >= active.job.deadlineAt ? timeoutError() : abortError());
      return;
    }
    if (active.retries === 0 && this.options.createAdapter) {
      try {
        this.adapter.dispose();
        this.adapter = this.options.createAdapter();
        await this.adapter.initialize?.();
        this.queue.unshift({ ...active, retries: 1 });
        return;
      } catch {
        // The normal repeated-crash path below provides a terminal typed failure.
      }
    }
    this.disabled = true;
    active.reject(new EngineSchedulerError('ENGINE_CRASHED', error.message));
    this.rejectQueued(disabledError());
    this.adapter.dispose();
  }

  private takeNextRunnable(): QueueEntry<TPayload, TResult> | undefined {
    const index = this.queue
      .map((entry, index) => ({ entry, index }))
      .filter(
        ({ entry }) => !this.hidden || (entry.job.priority === 1 && this.userActivityWhileHidden)
      )
      .sort(
        (a, b) => a.entry.job.priority - b.entry.job.priority || a.entry.sequence - b.entry.sequence
      )[0]?.index;
    return index === undefined ? undefined : this.queue.splice(index, 1)[0];
  }

  private requestPreemption(incoming: QueueEntry<TPayload, TResult>): void {
    if (incoming.job.priority !== 1 || !this.active || this.active.job.priority <= 1) return;
    this.preempt(this.active);
  }

  private preempt(active: ActiveEntry<TPayload, TResult>): void {
    if (active.preempted) return;
    active.preempted = true;
    active.controller.abort();
    void this.adapter.stop();
  }

  private supersedeQueuedInteractive(incoming: QueueEntry<TPayload, TResult>): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const candidate = this.queue[index]!;
      if (
        candidate.job.priority === 1 &&
        candidate.job.relevanceToken === incoming.job.relevanceToken
      ) {
        this.queue.splice(index, 1);
        candidate.reject(abortError());
      }
    }
  }

  private rejectQueued(error: Error): void {
    for (const entry of this.queue.splice(0)) entry.reject(error);
  }
  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

function abortError(): Error {
  const error = new Error('Analysis cancelled.');
  error.name = 'AbortError';
  return error;
}
function timeoutError(): EngineSchedulerError {
  return new EngineSchedulerError('ENGINE_TIMEOUT', 'Analysis exceeded its deadline.');
}
function disposedError(): EngineSchedulerError {
  return new EngineSchedulerError('ENGINE_DISPOSED', 'The engine scheduler has been disposed.');
}
function disabledError(): EngineSchedulerError {
  return new EngineSchedulerError(
    'ENGINE_DISABLED',
    'The engine is disabled for this session after repeated failures.'
  );
}
function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error('Engine operation failed.');
}
