const PUB_API_LOCK_NAME = 'chesscom-pubapi-lock';

export class PubApiCoordinator {
  private queue: Promise<unknown> = Promise.resolve();

  /**
   * Executes a task serially per-tab, acquiring the Web Lock for the duration
   * of the task if the Web Locks API is available.
   */
  async execute<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    // 1. Enqueue task serially per tab
    const previousQueue = this.queue;

    let resolveNextQueue!: () => void;
    this.queue = new Promise<void>((resolve) => {
      resolveNextQueue = resolve;
    });

    try {
      // Wait for previous queued operation in this tab to finish (ignore its error if any)
      await previousQueue.catch(() => {});

      // 2. Acquire Web Lock if supported
      if (
        typeof navigator !== 'undefined' &&
        'locks' in navigator &&
        typeof navigator.locks?.request === 'function'
      ) {
        if (signal) {
          return await navigator.locks.request(PUB_API_LOCK_NAME, { signal }, async () => {
            return await task();
          });
        } else {
          return await navigator.locks.request(PUB_API_LOCK_NAME, async () => {
            return await task();
          });
        }
      }

      // 3. Fallback when Web Locks unavailable
      return await task();
    } finally {
      resolveNextQueue();
    }
  }
}

export const pubApiCoordinator = new PubApiCoordinator();
