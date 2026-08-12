import { createAbortError } from '../api/errors';

export type SyncTask<T> = (signal: AbortSignal) => Promise<T>;

interface ActiveCaller<T> {
  signal?: AbortSignal | undefined;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  onSignalAbort?: (() => void) | undefined;
}

interface QueuedJob<T> {
  id: string;
  username: string;
  task: SyncTask<T>;
  callers: ActiveCaller<T>[];
  taskController: AbortController;
}

export class JobQueue {
  private activeJob: QueuedJob<unknown> | null = null;
  private queue: QueuedJob<unknown>[] = [];
  private jobMap = new Map<string, QueuedJob<unknown>>();

  /**
   * Enqueues a sync task for a username.
   * If a job for the same username is already queued or active, deduplicates and returns the existing promise.
   * Ensures no two jobs run concurrently across the queue.
   */
  public enqueue<T>(
    username: string,
    task: SyncTask<T>,
    signal?: AbortSignal
  ): Promise<T> {
    const normUser = username.toLowerCase().trim();

    // Check if job for this username is already active or queued
    let existingJob = this.jobMap.get(normUser) as QueuedJob<T> | undefined;

    if (existingJob && existingJob.taskController.signal.aborted) {
      this.jobMap.delete(normUser);
      const qIndex = this.queue.indexOf(existingJob as QueuedJob<unknown>);
      if (qIndex !== -1) {
        this.queue.splice(qIndex, 1);
      }
      existingJob = undefined;
    }

    if (existingJob) {
      return this.attachCallerToJob(existingJob, signal);
    }

    // Create new job
    const taskController = new AbortController();

    const job: QueuedJob<T> = {
      id: `${normUser}:${Date.now()}:${Math.random().toString(36).substring(2, 7)}`,
      username: normUser,
      task,
      callers: [],
      taskController,
    };

    this.jobMap.set(normUser, job as QueuedJob<unknown>);

    const callerPromise = this.attachCallerToJob(job, signal);

    this.queue.push(job as QueuedJob<unknown>);
    this.processNext();

    return callerPromise;
  }

  private attachCallerToJob<T>(job: QueuedJob<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    return new Promise<T>((resolve, reject) => {
      const caller: ActiveCaller<T> = {
        signal,
        resolve,
        reject,
      };

      if (signal) {
        const onAbort = () => {
          // Remove caller from job callers
          const index = job.callers.indexOf(caller);
          if (index !== -1) {
            job.callers.splice(index, 1);
          }
          if (caller.onSignalAbort) {
            signal.removeEventListener('abort', caller.onSignalAbort);
          }
          reject(createAbortError());

          // If no active callers remain for this job, abort the task and remove from map & queue
          if (job.callers.length === 0) {
            job.taskController.abort();
            if (this.jobMap.get(job.username) === (job as QueuedJob<unknown>)) {
              this.jobMap.delete(job.username);
            }
            const qIndex = this.queue.indexOf(job as QueuedJob<unknown>);
            if (qIndex !== -1) {
              this.queue.splice(qIndex, 1);
            }
          }
        };

        caller.onSignalAbort = onAbort;
        signal.addEventListener('abort', onAbort, { once: true });
      }

      job.callers.push(caller);
    });
  }

  private async processNext(): Promise<void> {
    if (this.activeJob !== null) {
      return; // Already running a job
    }

    const nextJob = this.queue.shift();
    if (!nextJob) {
      return; // Queue empty
    }

    this.activeJob = nextJob;

    try {
      if (nextJob.callers.length === 0 || nextJob.taskController.signal.aborted) {
        // Job was aborted before starting
        const err = createAbortError();
        for (const caller of nextJob.callers) {
          caller.reject(err);
        }
      } else {
        const result = await nextJob.task(nextJob.taskController.signal);
        // Distribute result to remaining active callers
        for (const caller of [...nextJob.callers]) {
          if (caller.onSignalAbort && caller.signal) {
            caller.signal.removeEventListener('abort', caller.onSignalAbort);
          }
          caller.resolve(result);
        }
      }
    } catch (err) {
      // Distribute error to remaining active callers
      for (const caller of [...nextJob.callers]) {
        if (caller.onSignalAbort && caller.signal) {
          caller.signal.removeEventListener('abort', caller.onSignalAbort);
        }
        caller.reject(err);
      }
    } finally {
      if (this.jobMap.get(nextJob.username) === nextJob) {
        this.jobMap.delete(nextJob.username);
      }
      this.activeJob = null;
      // Process next in queue
      this.processNext();
    }
  }
}

export const jobQueue = new JobQueue();
