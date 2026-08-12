import { buildArchivesUrl, buildMonthlyUrl, isValidRedirectUrl } from './chesscomUrl';
import {
  createPubApiError,
  createTimeoutError,
  createAbortError,
  createOfflineError,
  createCorsError,
  createResponseTooLargeError,
  createInvalidResponseError,
  PubApiError,
} from './errors';
import {
  parseUpstreamHttpError,
  validateArchivesResponse,
  validateMonthlyGamesResponse,
  RawChesscomGame,
} from './chesscomSchemas';
import { pubApiCoordinator } from './pubApiCoordinator';

export interface FetchOptions {
  signal?: AbortSignal;
  timeoutMs?: number; // defaults to 10000ms (10 seconds)
}

const MAX_BODY_BYTES = 32 * 1024 * 1024; // 32 MiB

/**
 * Creates a composed abort signal combining caller signal and timeout deadline.
 */
function createComposedSignal(
  callerSignal?: AbortSignal,
  timeoutMs: number = 10000
): { signal: AbortSignal; cleanup: () => void; isTimeout: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onCallerAbort = () => {
    controller.abort();
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }
  }

  const cleanup = () => {
    clearTimeout(timer);
    if (callerSignal) {
      callerSignal.removeEventListener('abort', onCallerAbort);
    }
  };

  return {
    signal: controller.signal,
    cleanup,
    isTimeout: () => timedOut,
  };
}

/**
 * Helper to safely read and byte-count response body stream up to 32 MiB limit.
 */
async function readResponseBody(
  response: Response,
  composed: { signal: AbortSignal; isTimeout: () => boolean }
): Promise<string> {
  const contentLengthStr = response.headers.get('content-length');
  if (contentLengthStr) {
    const contentLength = parseInt(contentLengthStr, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw createResponseTooLargeError('Declared Content-Length exceeds 32 MiB limit');
    }
  }

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let totalBytes = 0;
    let text = '';

    try {
      while (true) {
        if (composed.signal.aborted) {
          await reader.cancel().catch(() => {});
          if (composed.isTimeout()) {
            throw createTimeoutError();
          }
          throw createAbortError();
        }

        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          totalBytes += value.length;
          if (totalBytes > MAX_BODY_BYTES) {
            await reader.cancel().catch(() => {});
            throw createResponseTooLargeError('Streamed body exceeded 32 MiB limit');
          }
          text += decoder.decode(value, { stream: true });
        }
      }
      text += decoder.decode(); // flush decoder

      if (composed.signal.aborted) {
        if (composed.isTimeout()) {
          throw createTimeoutError();
        }
        throw createAbortError();
      }

      return text;
    } finally {
      reader.releaseLock();
    }
  } else {
    // Fallback if body stream reader unavailable
    const text = await response.text();
    if (composed.signal.aborted) {
      if (composed.isTimeout()) {
        throw createTimeoutError();
      }
      throw createAbortError();
    }
    const byteLength = new TextEncoder().encode(text).byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      throw createResponseTooLargeError('Body text length exceeded 32 MiB limit');
    }
    return text;
  }
}

/**
 * Low-level execution helper for PubAPI requests.
 */
async function executePubApiRequest<T>(
  url: URL,
  expectedType: 'archives' | 'monthly',
  username: string,
  year?: string | number,
  month?: string | number,
  options?: FetchOptions
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const composed = createComposedSignal(options?.signal, timeoutMs);

  try {
    let responseText: string;

    try {
      responseText = await pubApiCoordinator.execute(async () => {
        if (composed.signal.aborted) {
          if (composed.isTimeout()) {
            throw createTimeoutError();
          }
          throw createAbortError();
        }

        const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          redirect: 'follow',
          cache: 'default',
          signal: composed.signal,
        });

        // Check redirect safety
        if (response.url && response.url.length > 0) {
          if (!isValidRedirectUrl(response.url, expectedType, username, year, month)) {
            throw createPubApiError(
              'REDIRECT_DISALLOWED',
              'Redirect target was outside allowed origin or path family',
              false
            );
          }
          const finalUrl = new URL(response.url);
          if (finalUrl.search !== '' || finalUrl.hash !== '') {
            throw createPubApiError(
              'REDIRECT_DISALLOWED',
              'Final URL contained search query or hash fragment',
              false
            );
          }
        } else {
          throw createInvalidResponseError('Response URL is absent or empty');
        }

        // Handle HTTP error statuses
        if (!response.ok) {
          const upstreamErr = parseUpstreamHttpError(response.status);

          let retryable = false;
          let retryAfterMs: number | undefined;

          if (response.status === 502 || response.status === 503 || response.status === 504) {
            retryable = true;
          } else if (response.status === 429) {
            retryable = true;
          }

          if (retryable) {
            const retryAfter = response.headers.get('retry-after');
            if (retryAfter) {
              const seconds = parseInt(retryAfter, 10);
              if (!Number.isNaN(seconds)) {
                retryAfterMs = seconds * 1000;
              } else {
                const date = new Date(retryAfter).getTime();
                if (!Number.isNaN(date)) {
                  retryAfterMs = Math.max(0, date - Date.now());
                }
              }
            }
          }

          throw createPubApiError(
            upstreamErr.code,
            upstreamErr.message,
            retryable,
            upstreamErr.status,
            retryAfterMs
          );
        }

        // Validate JSON media type
        const contentType = response.headers.get('content-type') || '';
        const mediaType = (contentType.split(';')[0] ?? '').trim().toLowerCase();
        if (mediaType !== 'application/json' && !mediaType.endsWith('+json')) {
          throw createPubApiError('WRONG_CONTENT_TYPE', `Expected JSON, got ${mediaType}`, false);
        }

        // Read stream with size protection
        return await readResponseBody(response, composed);
      }, composed.signal);
    } catch (err: unknown) {
      if (err instanceof PubApiError) {
        throw err;
      }

      if (err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError') {
        if (composed.isTimeout()) {
          throw createTimeoutError();
        }
        throw createAbortError();
      }

      if (composed.signal.aborted) {
        if (composed.isTimeout()) {
          throw createTimeoutError();
        }
        throw createAbortError();
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw createOfflineError();
      }

      throw createCorsError();
    }

    // Parse JSON
    let json: unknown;
    try {
      json = JSON.parse(responseText);
    } catch {
      if (composed.signal.aborted) {
        if (composed.isTimeout()) {
          throw createTimeoutError();
        }
        throw createAbortError();
      }
      throw createPubApiError('MALFORMED_JSON', 'Failed to parse JSON response', false);
    }

    // Schema validation
    if (expectedType === 'archives') {
      const result = validateArchivesResponse(json);
      if (!result.success) {
        throw createPubApiError('INVALID_SCHEMA', result.diagnostic.message, false);
      }
      return result.archives as unknown as T;
    } else {
      const result = validateMonthlyGamesResponse(json);
      if (!result.success) {
        if (result.diagnostic.code === 'RESPONSE_TOO_LARGE') {
          throw createResponseTooLargeError(result.diagnostic.message);
        }
        throw createPubApiError('INVALID_SCHEMA', result.diagnostic.message, false);
      }
      return result.games as unknown as T;
    }
  } finally {
    composed.cleanup();
  }
}

/**
 * Fetches player archive list from Chess.com PubAPI.
 */
export async function fetchPlayerArchives(
  username: string,
  options?: FetchOptions
): Promise<string[]> {
  const url = buildArchivesUrl(username);
  return executePubApiRequest<string[]>(url, 'archives', username, undefined, undefined, options);
}

/**
 * Fetches monthly games archive for a player from Chess.com PubAPI.
 */
export async function fetchMonthlyGames(
  username: string,
  year: string | number,
  month: string | number,
  options?: FetchOptions
): Promise<RawChesscomGame[]> {
  const url = buildMonthlyUrl(username, year, month);
  return executePubApiRequest<RawChesscomGame[]>(url, 'monthly', username, year, month, options);
}
