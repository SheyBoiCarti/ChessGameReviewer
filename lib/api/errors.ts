import type { UpstreamError, UpstreamErrorCode } from './contracts';

export type ExtendedErrorCode =
  | UpstreamErrorCode
  | 'CORS_ERROR'
  | 'OFFLINE'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'MALFORMED_JSON'
  | 'INVALID_SCHEMA'
  | 'REDIRECT_DISALLOWED';

export class PubApiError extends Error implements UpstreamError {
  readonly code: ExtendedErrorCode;
  readonly retryable: boolean;
  readonly status?: number | undefined;

  constructor(code: ExtendedErrorCode, rawMessage: string, retryable: boolean, status?: number) {
    const sanitizedMsg = sanitizeMessage(rawMessage);
    super(sanitizedMsg);
    this.name = 'PubApiError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

/**
 * Sanitizes any string (messages, diagnostic detail strings) so that:
 * - Full usernames / username parameters are not exposed
 * - Full URLs containing usernames are not exposed
 * - Raw response bodies are not exposed
 * - PGN strings are not exposed
 */
export function sanitizeMessage(input: string): string {
  if (!input) return 'An error occurred during PubAPI request';

  let sanitized = input;

  // Remove full URLs (e.g. https://api.chess.com/pub/player/username/...)
  sanitized = sanitized.replace(/https?:\/\/[^\s"']+/gi, '[URL_REDACTED]');

  // Remove username patterns if present in text like "player <username>" or "user=<username>"
  sanitized = sanitized.replace(/\bplayer\s+[\w-]+/gi, 'player [REDACTED]');
  sanitized = sanitized.replace(/\busername\s*[:=]\s*[\w-]+/gi, 'username=[REDACTED]');

  // Remove potential PGN text snippets (e.g., "[Event ...]", "1. e4 e5")
  sanitized = sanitized.replace(/\[\s*Event\s+"[^"]*"\s*\][\s\S]*/gi, '[PGN_REDACTED]');
  sanitized = sanitized.replace(/\b1\.\s+[eNdQbKcR1-8a-h]+[\s\S]*/g, '[PGN_REDACTED]');

  return sanitized;
}

export function createPubApiError(
  code: ExtendedErrorCode,
  message: string,
  retryable: boolean,
  status?: number
): PubApiError {
  return new PubApiError(code, message, retryable, status);
}

export function createTimeoutError(): PubApiError {
  return new PubApiError('TIMEOUT', 'Request timed out after deadline', true);
}

export function createAbortError(): PubApiError {
  return new PubApiError('ABORTED', 'Request was cancelled by caller', false);
}

export function createOfflineError(): PubApiError {
  return new PubApiError('OFFLINE', 'Network is offline', true);
}

export function createCorsError(): PubApiError {
  return new PubApiError('CORS_ERROR', 'Cross-Origin Request blocked or failed', true);
}

export function createResponseTooLargeError(detailMessage?: string): PubApiError {
  return new PubApiError(
    'RESPONSE_TOO_LARGE',
    detailMessage ? detailMessage : 'Upstream response exceeded 32 MiB or item limit',
    false
  );
}

export function createInvalidResponseError(detailMessage?: string): PubApiError {
  return new PubApiError(
    'INVALID_UPSTREAM_RESPONSE',
    detailMessage ? detailMessage : 'Upstream response was invalid or malformed',
    false
  );
}
