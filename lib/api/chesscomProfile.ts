import {
  buildProfileUrl,
  buildStatsUrl,
  isValidRedirectUrl,
  normalizeUsername,
} from './chesscomUrl';
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
import { parseUpstreamHttpError } from './chesscomSchemas';
import { pubApiCoordinator } from './pubApiCoordinator';
import type { FetchOptions } from './chesscomClient';

export type { FetchOptions };

export interface ChesscomPlayerProfile {
  username: string;
  avatar?: string | undefined;
  name?: string | undefined;
  title?: string | undefined;
  country?: string | undefined;
  joined: number; // Unix timestamp seconds
  status: string;
  url: string;
  followers?: number | undefined;
}

export interface RatingRecord {
  win: number;
  loss: number;
  draw: number;
}

export interface TimeClassStats {
  last?: { rating: number; date?: number | undefined } | undefined;
  best?: { rating: number; date?: number | undefined; game?: string | undefined } | undefined;
  record?: RatingRecord | undefined;
}

export interface ChesscomPlayerStats {
  chess_rapid?: TimeClassStats | undefined;
  chess_blitz?: TimeClassStats | undefined;
  chess_bullet?: TimeClassStats | undefined;
  chess_daily?: TimeClassStats | undefined;
  tactics?:
    | {
        highest?: { rating: number; date?: number | undefined } | undefined;
        lowest?: { rating: number; date?: number | undefined } | undefined;
      }
    | undefined;
}

export interface CachedProfileRecord {
  username: string;
  profile: ChesscomPlayerProfile | null;
  stats: ChesscomPlayerStats | null;
  fetchedAt: number; // Date.now()
}

const MAX_BODY_BYTES = 4 * 1024 * 1024; // 4 MiB for profile/stats

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

async function readResponseBody(
  response: Response,
  composed: { signal: AbortSignal; isTimeout: () => boolean }
): Promise<string> {
  const contentLengthStr = response.headers.get('content-length');
  if (contentLengthStr) {
    const contentLength = parseInt(contentLengthStr, 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      throw createResponseTooLargeError('Declared Content-Length exceeds limit');
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
            throw createResponseTooLargeError('Streamed body exceeded limit');
          }
          text += decoder.decode(value, { stream: true });
        }
      }
      text += decoder.decode();

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
    const text = await response.text();
    if (composed.signal.aborted) {
      if (composed.isTimeout()) {
        throw createTimeoutError();
      }
      throw createAbortError();
    }
    const byteLength = new TextEncoder().encode(text).byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      throw createResponseTooLargeError('Body text length exceeded limit');
    }
    return text;
  }
}

async function executeProfileRequest<T>(
  url: URL,
  expectedType: 'profile' | 'stats',
  username: string,
  options?: FetchOptions
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  let responseText: string;
  let composed: ReturnType<typeof createComposedSignal> | undefined;

  try {
    const response = await pubApiCoordinator.execute(async () => {
      composed = createComposedSignal(options?.signal, timeoutMs);
      if (composed.signal.aborted) {
        if (composed.isTimeout()) {
          throw createTimeoutError();
        }
        throw createAbortError();
      }

      const res = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        redirect: 'follow',
        cache: 'default',
        signal: composed.signal,
      });

      if (res.url && res.url.length > 0) {
        if (!isValidRedirectUrl(res.url, expectedType, username)) {
          throw createPubApiError(
            'REDIRECT_DISALLOWED',
            'Redirect target was outside allowed origin or path family',
            false
          );
        }
      } else {
        throw createInvalidResponseError('Response URL is absent or empty');
      }

      if (!res.ok) {
        const upstreamErr = parseUpstreamHttpError(res.status);
        let retryable = false;
        let retryAfterMs: number | undefined;

        if (res.status === 502 || res.status === 503 || res.status === 504 || res.status === 429) {
          retryable = true;
          const retryAfter = res.headers.get('retry-after');
          if (retryAfter) {
            const seconds = parseInt(retryAfter, 10);
            if (!Number.isNaN(seconds)) {
              retryAfterMs = seconds * 1000;
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

      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw createInvalidResponseError(
          `Invalid Content-Type: expected application/json, got ${contentType}`
        );
      }

      responseText = await readResponseBody(res, composed);
      return res;
    }, options?.signal);

    void response;
  } catch (err: unknown) {
    if (composed) {
      composed.cleanup();
    }
    if (err instanceof PubApiError) {
      throw err;
    }

    if (err && typeof err === 'object' && 'name' in err) {
      const errorName = (err as { name: string }).name;
      if (errorName === 'AbortError') {
        if (composed && composed.isTimeout()) {
          throw createTimeoutError();
        }
        throw createAbortError();
      }
      if (errorName === 'TypeError') {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          throw createOfflineError();
        }
        throw createCorsError();
      }
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw createOfflineError();
    }
    throw createCorsError();
  } finally {
    if (composed) {
      composed.cleanup();
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText!);
  } catch {
    throw createInvalidResponseError('Malformed JSON payload');
  }

  return parsed as T;
}

function validateProfile(data: unknown): ChesscomPlayerProfile {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw createInvalidResponseError('Profile payload must be an object');
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.username !== 'string' || obj.username.length === 0) {
    throw createInvalidResponseError('Profile missing valid username');
  }
  if (typeof obj.joined !== 'number' || !Number.isFinite(obj.joined)) {
    throw createInvalidResponseError('Profile missing valid joined date');
  }
  if (typeof obj.status !== 'string') {
    throw createInvalidResponseError('Profile missing valid status');
  }
  if (typeof obj.url !== 'string') {
    throw createInvalidResponseError('Profile missing valid url');
  }

  return {
    username: obj.username,
    avatar: typeof obj.avatar === 'string' ? obj.avatar : undefined,
    name: typeof obj.name === 'string' ? obj.name : undefined,
    title: typeof obj.title === 'string' ? obj.title : undefined,
    country: typeof obj.country === 'string' ? obj.country : undefined,
    joined: obj.joined,
    status: obj.status,
    url: obj.url,
    followers: typeof obj.followers === 'number' ? obj.followers : undefined,
  };
}

function validateStats(data: unknown): ChesscomPlayerStats {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw createInvalidResponseError('Stats payload must be an object');
  }

  const obj = data as Record<string, unknown>;

  const parseTimeClass = (val: unknown): TimeClassStats | undefined => {
    if (typeof val !== 'object' || val === null) return undefined;
    const tc = val as Record<string, unknown>;
    const res: TimeClassStats = {};

    if (tc.last && typeof tc.last === 'object') {
      const last = tc.last as Record<string, unknown>;
      if (typeof last.rating === 'number') {
        res.last = {
          rating: last.rating,
          date: typeof last.date === 'number' ? last.date : undefined,
        };
      }
    }

    if (tc.best && typeof tc.best === 'object') {
      const best = tc.best as Record<string, unknown>;
      if (typeof best.rating === 'number') {
        res.best = {
          rating: best.rating,
          date: typeof best.date === 'number' ? best.date : undefined,
          game: typeof best.game === 'string' ? best.game : undefined,
        };
      }
    }

    if (tc.record && typeof tc.record === 'object') {
      const rec = tc.record as Record<string, unknown>;
      if (
        typeof rec.win === 'number' &&
        typeof rec.loss === 'number' &&
        typeof rec.draw === 'number'
      ) {
        res.record = {
          win: rec.win,
          loss: rec.loss,
          draw: rec.draw,
        };
      }
    }

    return res;
  };

  const stats: ChesscomPlayerStats = {};

  if ('chess_rapid' in obj) {
    stats.chess_rapid = parseTimeClass(obj.chess_rapid);
  }
  if ('chess_blitz' in obj) {
    stats.chess_blitz = parseTimeClass(obj.chess_blitz);
  }
  if ('chess_bullet' in obj) {
    stats.chess_bullet = parseTimeClass(obj.chess_bullet);
  }
  if ('chess_daily' in obj) {
    stats.chess_daily = parseTimeClass(obj.chess_daily);
  }
  if ('tactics' in obj && typeof obj.tactics === 'object' && obj.tactics !== null) {
    const tac = obj.tactics as Record<string, unknown>;
    const tacResult: NonNullable<ChesscomPlayerStats['tactics']> = {};
    if (tac.highest && typeof tac.highest === 'object') {
      const h = tac.highest as Record<string, unknown>;
      if (typeof h.rating === 'number') {
        tacResult.highest = {
          rating: h.rating,
          date: typeof h.date === 'number' ? h.date : undefined,
        };
      }
    }
    if (tac.lowest && typeof tac.lowest === 'object') {
      const l = tac.lowest as Record<string, unknown>;
      if (typeof l.rating === 'number') {
        tacResult.lowest = {
          rating: l.rating,
          date: typeof l.date === 'number' ? l.date : undefined,
        };
      }
    }
    stats.tactics = tacResult;
  }

  return stats;
}

export async function fetchPlayerProfile(
  username: string,
  options?: FetchOptions
): Promise<ChesscomPlayerProfile> {
  const cleanUsername = normalizeUsername(username);
  const url = buildProfileUrl(cleanUsername);
  const rawData = await executeProfileRequest<unknown>(url, 'profile', cleanUsername, options);
  return validateProfile(rawData);
}

export async function fetchPlayerStats(
  username: string,
  options?: FetchOptions
): Promise<ChesscomPlayerStats> {
  const cleanUsername = normalizeUsername(username);
  const url = buildStatsUrl(cleanUsername);
  const rawData = await executeProfileRequest<unknown>(url, 'stats', cleanUsername, options);
  return validateStats(rawData);
}
