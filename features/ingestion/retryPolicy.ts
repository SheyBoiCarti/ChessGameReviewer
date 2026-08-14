import { throwIfAborted } from '../../lib/api/errors';
import { RetryProgress } from './types';

export interface RetryOptions {
  signal: AbortSignal;
  baseDelayMs: number;
  random: () => number;
  wait: (delayMs: number, signal: AbortSignal) => Promise<void>;
  onRetry?: (progress: RetryProgress) => void;
}

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; retryable?: unknown; status?: unknown };
  if (candidate.retryable !== true) return false;
  if (candidate.code === 'CORS_ERROR' || candidate.code === 'TIMEOUT') return true;
  if (candidate.code === 'UPSTREAM_RATE_LIMITED') return candidate.status === 429;
  return (
    candidate.code === 'UPSTREAM_UNAVAILABLE' &&
    (candidate.status === 502 || candidate.status === 503 || candidate.status === 504)
  );
}

export async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    throwIfAborted(options.signal);
    try {
      return await operation(attempt);
    } catch (error) {
      if (!isRetryable(error) || attempt === 3) throw error;
      const exponentialCap = options.baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(options.random() * exponentialCap);
      const retryAfterMs =
        typeof error === 'object' &&
        error !== null &&
        'retryAfterMs' in error &&
        typeof (error as { retryAfterMs?: unknown }).retryAfterMs === 'number'
          ? (error as { retryAfterMs: number }).retryAfterMs
          : undefined;
      const delayMs = retryAfterMs ?? jitter;
      options.onRetry?.({ attempt: attempt + 1, delayMs });
      await options.wait(delayMs, options.signal);
    }
  }
  throw new Error('unreachable');
}
