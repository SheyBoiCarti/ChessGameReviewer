import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildArchivesUrl, buildMonthlyUrl, isValidRedirectUrl } from '../../lib/api/chesscomUrl';
import {
  createPubApiError,
  createTimeoutError,
  createAbortError,
  createOfflineError,
  createCorsError,
  createResponseTooLargeError,
} from '../../lib/api/errors';
import { PubApiCoordinator } from '../../lib/api/pubApiCoordinator';
import { fetchPlayerArchives, fetchMonthlyGames } from '../../lib/api/chesscomClient';

describe('chesscomUrl', () => {
  describe('buildArchivesUrl', () => {
    it('builds a valid URL for a valid username', () => {
      const url = buildArchivesUrl('hikaru');
      expect(url.toString()).toBe('https://api.chess.com/pub/player/hikaru/games/archives');
    });

    it('normalizes username to lowercase', () => {
      const url = buildArchivesUrl('MagnusCarlsen');
      expect(url.toString()).toBe('https://api.chess.com/pub/player/magnuscarlsen/games/archives');
    });

    it('throws for invalid usernames or injection attempts', () => {
      expect(() => buildArchivesUrl('')).toThrow();
      expect(() => buildArchivesUrl('user/with/slashes')).toThrow();
      expect(() => buildArchivesUrl('../relative')).toThrow();
      expect(() => buildArchivesUrl('user name')).toThrow();
      expect(() => buildArchivesUrl('user?query=1')).toThrow();
      expect(() => buildArchivesUrl('user#hash')).toThrow();
    });
  });

  describe('buildMonthlyUrl', () => {
    it('builds a valid URL for valid username, year, and month', () => {
      const url = buildArchivesUrl('hikaru'); // placeholder check
      const monthlyUrl = buildMonthlyUrl('hikaru', '2023', '05');
      expect(monthlyUrl.toString()).toBe('https://api.chess.com/pub/player/hikaru/games/2023/05');
    });

    it('pads single digit month numbers', () => {
      const monthlyUrl = buildMonthlyUrl('hikaru', 2023, 5);
      expect(monthlyUrl.toString()).toBe('https://api.chess.com/pub/player/hikaru/games/2023/05');
    });

    it('throws for invalid year or month values', () => {
      expect(() => buildMonthlyUrl('hikaru', '23', '05')).toThrow();
      expect(() => buildMonthlyUrl('hikaru', '2023', '00')).toThrow();
      expect(() => buildMonthlyUrl('hikaru', '2023', '13')).toThrow();
      expect(() => buildMonthlyUrl('hikaru', 'invalid', '05')).toThrow();
    });
  });

  describe('isValidRedirectUrl', () => {
    it('returns true for exact matching origin and path family', () => {
      expect(
        isValidRedirectUrl('https://api.chess.com/pub/player/hikaru/games/archives', 'archives', 'hikaru')
      ).toBe(true);

      expect(
        isValidRedirectUrl('https://api.chess.com/pub/player/hikaru/games/2023/05', 'monthly', 'hikaru', '2023', '05')
      ).toBe(true);
    });

    it('rejects origin mismatches (HTTP or third party origin)', () => {
      expect(
        isValidRedirectUrl('http://api.chess.com/pub/player/hikaru/games/archives', 'archives', 'hikaru')
      ).toBe(false);

      expect(
        isValidRedirectUrl('https://evil.com/pub/player/hikaru/games/archives', 'archives', 'hikaru')
      ).toBe(false);
    });

    it('rejects unexpected path families or username mismatches', () => {
      expect(
        isValidRedirectUrl('https://api.chess.com/pub/player/hikaru/stats', 'archives', 'hikaru')
      ).toBe(false);

      expect(
        isValidRedirectUrl('https://api.chess.com/pub/player/otheruser/games/archives', 'archives', 'hikaru')
      ).toBe(false);

      expect(
        isValidRedirectUrl('https://api.chess.com/pub/player/hikaru/games/2023/06', 'monthly', 'hikaru', '2023', '05')
      ).toBe(false);
    });
  });
});

describe('PubApiError', () => {
  it('creates typed errors with sanitized messages', () => {
    const err = createPubApiError('PLAYER_NOT_FOUND', 'Player hikaru not found at https://api.chess.com/pub/player/hikaru/games/archives', false, 404);
    expect(err.code).toBe('PLAYER_NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.retryable).toBe(false);
    expect(err.message).not.toContain('hikaru');
    expect(err.message).not.toContain('https://api.chess.com');
  });

  it('provides helpers for offline, timeout, cors, abort, and size limit errors', () => {
    expect(createTimeoutError().code).toBe('TIMEOUT');
    expect(createTimeoutError().retryable).toBe(true);

    expect(createAbortError().code).toBe('ABORTED');
    expect(createAbortError().retryable).toBe(false);

    expect(createOfflineError().code).toBe('OFFLINE');
    expect(createOfflineError().retryable).toBe(true);

    expect(createCorsError().code).toBe('CORS_ERROR');
    expect(createCorsError().retryable).toBe(true);

    expect(createResponseTooLargeError().code).toBe('RESPONSE_TOO_LARGE');
    expect(createResponseTooLargeError().retryable).toBe(false);
  });
});

describe('pubApiCoordinator', () => {
  let coordinator: PubApiCoordinator;

  beforeEach(() => {
    coordinator = new PubApiCoordinator();
  });

  it('executes tasks serially per tab', async () => {
    const executionOrder: number[] = [];

    const task1 = coordinator.execute(async () => {
      await new Promise((r) => setTimeout(r, 20));
      executionOrder.push(1);
      return 'task1';
    });

    const task2 = coordinator.execute(async () => {
      executionOrder.push(2);
      return 'task2';
    });

    const results = await Promise.all([task1, task2]);
    expect(results).toEqual(['task1', 'task2']);
    expect(executionOrder).toEqual([1, 2]);
  });

  it('acquires and releases Web Lock when navigator.locks is available', async () => {
    let lockAcquired = false;
    let lockReleased = false;

    const mockLocks = {
      request: vi.fn().mockImplementation(async (name: string, callback: () => Promise<unknown>) => {
        expect(name).toBe('chesscom-pubapi-lock');
        lockAcquired = true;
        try {
          return await callback();
        } finally {
          lockReleased = true;
        }
      }),
    };

    const originalNavigatorLocks = navigator.locks;
    Object.defineProperty(navigator, 'locks', {
      value: mockLocks,
      writable: true,
      configurable: true,
    });

    try {
      const res = await coordinator.execute(async () => 'success');
      expect(res).toBe('success');
      expect(mockLocks.request).toHaveBeenCalledTimes(1);
      expect(lockAcquired).toBe(true);
      expect(lockReleased).toBe(true);
    } finally {
      Object.defineProperty(navigator, 'locks', {
        value: originalNavigatorLocks,
        writable: true,
        configurable: true,
      });
    }
  });

  it('falls back seamlessly when navigator.locks is unavailable', async () => {
    const originalNavigatorLocks = navigator.locks;
    Object.defineProperty(navigator, 'locks', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    try {
      const res = await coordinator.execute(async () => 'fallback-result');
      expect(res).toBe('fallback-result');
    } finally {
      Object.defineProperty(navigator, 'locks', {
        value: originalNavigatorLocks,
        writable: true,
        configurable: true,
      });
    }
  });
});

describe('chesscomClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchPlayerArchives', () => {
    it('fetches archives successfully with correct fetch options', async () => {
      const mockArchives = [
        'https://api.chess.com/pub/player/hikaru/games/2023/04',
        'https://api.chess.com/pub/player/hikaru/games/2023/05',
      ];

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        expect(input.toString()).toBe('https://api.chess.com/pub/player/hikaru/games/archives');
        expect(init?.method).toBe('GET');
        expect(init?.mode).toBe('cors');
        expect(init?.credentials).toBe('omit');
        expect(init?.redirect).toBe('follow');
        expect(init?.cache).toBe('default');
        expect(init?.headers).toBeUndefined();

        return new Response(JSON.stringify({ archives: mockArchives }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const archives = await fetchPlayerArchives('hikaru');
      expect(archives).toEqual(mockArchives);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('maps 404 to PLAYER_NOT_FOUND', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ message: 'User not found' }), { status: 404 })
      );

      await expect(fetchPlayerArchives('nonexistentuser')).rejects.toThrowError(
        expect.objectContaining({ code: 'PLAYER_NOT_FOUND', status: 404, retryable: false })
      );
    });

    it('maps 410 to PLAYER_NOT_FOUND', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ message: 'Account closed' }), { status: 410 })
      );

      await expect(fetchPlayerArchives('closeduser')).rejects.toThrowError(
        expect.objectContaining({ code: 'PLAYER_NOT_FOUND', status: 410, retryable: false })
      );
    });

    it('maps 429 to UPSTREAM_RATE_LIMITED', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ message: 'Too many requests' }), { status: 429 })
      );

      await expect(fetchPlayerArchives('hikaru')).rejects.toThrowError(
        expect.objectContaining({ code: 'UPSTREAM_RATE_LIMITED', status: 429, retryable: true })
      );
    });

    it('maps 503 to UPSTREAM_UNAVAILABLE', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ message: 'Server error' }), { status: 503 })
      );

      await expect(fetchPlayerArchives('hikaru')).rejects.toThrowError(
        expect.objectContaining({ code: 'UPSTREAM_UNAVAILABLE', status: 503, retryable: true })
      );
    });
  });

  describe('fetchMonthlyGames', () => {
    it('fetches and validates raw games correctly', async () => {
      const mockGame = {
        url: 'https://www.chess.com/game/live/12345',
        end_time: 1683000000,
        time_class: 'blitz',
        rules: 'chess',
        white: { username: 'hikaru', rating: 2800, result: 'win' },
        black: { username: 'opponent', rating: 2750, result: 'checkmated' },
      };

      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        expect(input.toString()).toBe('https://api.chess.com/pub/player/hikaru/games/2023/05');
        return new Response(JSON.stringify({ games: [mockGame] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const games = await fetchMonthlyGames('hikaru', '2023', '05');
      expect(games).toHaveLength(1);
      expect(games[0]?.url).toBe(mockGame.url);
    });

    it('rejects responses with declared Content-Length > 32 MiB', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ games: [] }), {
          status: 200,
          headers: { 'Content-Length': (33 * 1024 * 1024).toString() },
        })
      );

      await expect(fetchMonthlyGames('hikaru', '2023', '05')).rejects.toThrowError(
        expect.objectContaining({ code: 'RESPONSE_TOO_LARGE' })
      );
    });

    it('rejects responses exceeding 20,000 game items', async () => {
      const hugeGamesList = new Array(20001).fill({
        url: 'https://www.chess.com/game/live/1',
        end_time: 1683000000,
        time_class: 'blitz',
        rules: 'chess',
        white: { username: 'a' },
        black: { username: 'b' },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ games: hugeGamesList }), { status: 200 })
      );

      await expect(fetchMonthlyGames('hikaru', '2023', '05')).rejects.toThrowError(
        expect.objectContaining({ code: 'RESPONSE_TOO_LARGE' })
      );
    });

    it('handles unexpected redirect targets safely', async () => {
      const response = new Response(JSON.stringify({ archives: [] }), { status: 200 });
      Object.defineProperty(response, 'url', {
        value: 'https://evil-domain.com/pub/player/hikaru/games/archives',
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

      await expect(fetchPlayerArchives('hikaru')).rejects.toThrowError(
        expect.objectContaining({ code: 'REDIRECT_DISALLOWED' })
      );
    });

    it('handles timeout deadline properly', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        return new Promise((_, reject) => {
          if (init?.signal) {
            if (init.signal.aborted) {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
              return;
            }
            init.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      });

      const promise = fetchPlayerArchives('hikaru', { timeoutMs: 50 });
      await expect(promise).rejects.toThrowError(
        expect.objectContaining({ code: 'TIMEOUT', retryable: true })
      );
    });

    it('handles caller signal cancellation properly', async () => {
      const controller = new AbortController();
      vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
        return new Promise((_, reject) => {
          if (init?.signal) {
            if (init.signal.aborted) {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
              return;
            }
            init.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      });

      const promise = fetchPlayerArchives('hikaru', { signal: controller.signal });
      controller.abort();

      await expect(promise).rejects.toThrowError(
        expect.objectContaining({ code: 'ABORTED', retryable: false })
      );
    });

    it('detects offline state and throws OFFLINE error', async () => {
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

      try {
        await expect(fetchPlayerArchives('hikaru')).rejects.toThrowError(
          expect.objectContaining({ code: 'OFFLINE', retryable: true })
        );
      } finally {
        Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
      }
    });

    it('detects network/CORS error and throws CORS_ERROR when online', async () => {
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

      try {
        await expect(fetchPlayerArchives('hikaru')).rejects.toThrowError(
          expect.objectContaining({ code: 'CORS_ERROR', retryable: true })
        );
      } finally {
        Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
      }
    });

    it('asserts error messages never expose full usernames, username-bearing URLs, response bodies, or PGNs', async () => {
      const rawUser = 'SuperSecretUser';
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Invalid json body with PGN 1. e4 e5 [Event "Secret Game"]', { status: 200 })
      );

      try {
        await fetchPlayerArchives(rawUser);
        expect.fail('Should have thrown');
      } catch (err: unknown) {
        const message = (err as Error).message;
        expect(message).not.toContain(rawUser);
        expect(message).not.toContain('supersecretuser');
        expect(message).not.toContain('https://api.chess.com');
        expect(message).not.toContain('[Event');
        expect(message).not.toContain('1. e4');
      }
    });

    it('handles mid-stream abort cleanly and throws ABORTED rather than JSON syntax error', async () => {
      const controller = new AbortController();

      const stream = new ReadableStream({
        async pull(streamController) {
          streamController.enqueue(new TextEncoder().encode('{"archives": ['));
          controller.abort();
          streamController.enqueue(new TextEncoder().encode(']}'));
          streamController.close();
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const promise = fetchPlayerArchives('hikaru', { signal: controller.signal });
      await expect(promise).rejects.toThrowError(
        expect.objectContaining({ code: 'ABORTED', retryable: false })
      );
    });

    it('translates stream read errors into typed errors', async () => {
      const stream = new ReadableStream({
        pull() {
          const err = new Error('Stream read error');
          err.name = 'AbortError';
          throw err;
        },
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const promise = fetchPlayerArchives('hikaru');
      await expect(promise).rejects.toThrowError(
        expect.objectContaining({ code: 'ABORTED', retryable: false })
      );
    });
  });
});





