import { describe, it, expect, vi } from 'vitest';
import { executeWithRetry, RetryOptions } from '../../../features/ingestion/retryPolicy';
import { PubApiError, createAbortError } from '../../../lib/api/errors';
import { ExtendedErrorCode } from '../../../lib/api/errors';

function pubError(code: ExtendedErrorCode, status?: number, retryAfterMs?: number): PubApiError {
  const retryable = [
    'CORS_ERROR',
    'TIMEOUT',
    'UPSTREAM_RATE_LIMITED',
    'UPSTREAM_UNAVAILABLE',
  ].includes(code);
  return new PubApiError(code, 'Test error', retryable, status, retryAfterMs);
}

function fakeOptions(): RetryOptions {
  return {
    signal: new AbortController().signal,
    baseDelayMs: 100,
    random: () => 0.5,
    wait: vi.fn().mockResolvedValue(undefined),
  };
}

describe('executeWithRetry', () => {
  it.each([
    ['CORS_ERROR', undefined],
    ['TIMEOUT', undefined],
    ['UPSTREAM_RATE_LIMITED', 429],
    ['UPSTREAM_UNAVAILABLE', 502],
    ['UPSTREAM_UNAVAILABLE', 503],
    ['UPSTREAM_UNAVAILABLE', 504],
  ] as [ExtendedErrorCode, number | undefined][])(
    'retries %s/%s at most three total attempts',
    async (code, status) => {
      const operation = vi
        .fn()
        .mockRejectedValueOnce(pubError(code, status))
        .mockRejectedValueOnce(pubError(code, status))
        .mockResolvedValue('ok');
      await expect(executeWithRetry(operation, fakeOptions())).resolves.toBe('ok');
      expect(operation).toHaveBeenCalledTimes(3);
    }
  );

  it('does not retry 500, offline, abort, schema, or size errors', async () => {
    const errors = [
      pubError('INVALID_REQUEST', 400),
      pubError('PLAYER_NOT_FOUND', 404),
      new PubApiError('OFFLINE', 'Offline', true),
      pubError('ABORTED'),
      pubError('INVALID_SCHEMA'),
      pubError('RESPONSE_TOO_LARGE'),
      new PubApiError('UPSTREAM_UNAVAILABLE', 'Server Error', true, 500),
    ];

    for (const error of errors) {
      const operation = vi.fn().mockRejectedValue(error);
      await expect(executeWithRetry(operation, fakeOptions())).rejects.toThrow(error);
      expect(operation).toHaveBeenCalledTimes(1);
    }
  });

  it('honors readable Retry-After and aborts during the wait', async () => {
    const controller = new AbortController();
    const wait = vi.fn(
      (_ms, signal) =>
        new Promise<void>((_, reject) => {
          if (signal.aborted) return reject(createAbortError());
          signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
        })
    );
    const promise = executeWithRetry(
      () => Promise.reject(pubError('UPSTREAM_RATE_LIMITED', 429, 4000)),
      { ...fakeOptions(), signal: controller.signal, wait }
    );
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: 'ABORTED' });
    expect(wait).toHaveBeenCalledWith(4000, controller.signal);
  });
});
