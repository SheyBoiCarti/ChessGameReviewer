import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPlayerProfile, fetchPlayerStats } from '../../lib/api/chesscomProfile';

function mockProfileResponse(body: unknown, init?: ResponseInit, username = 'erik') {
  const content = typeof body === 'string' ? body : JSON.stringify(body);
  const res = new Response(content, {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  Object.defineProperty(res, 'url', {
    value: `https://api.chess.com/pub/player/${username}`,
    configurable: true,
    writable: true,
  });
  return res;
}

function mockStatsResponse(body: unknown, init?: ResponseInit, username = 'erik') {
  const content = typeof body === 'string' ? body : JSON.stringify(body);
  const res = new Response(content, {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  Object.defineProperty(res, 'url', {
    value: `https://api.chess.com/pub/player/${username}/stats`,
    configurable: true,
    writable: true,
  });
  return res;
}

describe('chesscomProfile API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchPlayerProfile', () => {
    it('successfully fetches and parses complete player profile', async () => {
      const mockData = {
        username: 'erik',
        avatar: 'https://images.chesscomfiles.com/uploads/v1/user/1.png',
        name: 'Erik Allebest',
        title: 'NM',
        country: 'https://api.chess.com/pub/country/US',
        joined: 1178556600,
        status: 'premium',
        url: 'https://www.chess.com/member/erik',
        followers: 12345,
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockProfileResponse(mockData));

      const profile = await fetchPlayerProfile('erik');
      expect(profile).toEqual(mockData);
    });

    it('successfully fetches and parses minimal player profile', async () => {
      const mockData = {
        username: 'erik',
        joined: 1178556600,
        status: 'basic',
        url: 'https://www.chess.com/member/erik',
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockProfileResponse(mockData));

      const profile = await fetchPlayerProfile('erik');
      expect(profile.username).toBe('erik');
      expect(profile.joined).toBe(1178556600);
      expect(profile.status).toBe('basic');
      expect(profile.url).toBe('https://www.chess.com/member/erik');
      expect(profile.avatar).toBeUndefined();
    });

    it('rejects invalid username', async () => {
      await expect(fetchPlayerProfile('')).rejects.toThrow();
      await expect(fetchPlayerProfile('invalid username with spaces')).rejects.toThrow();
    });

    it('maps 404 to PLAYER_NOT_FOUND', async () => {
      const res = mockProfileResponse(
        { message: 'User not found' },
        { status: 404 },
        'nonexistentuser'
      );
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerProfile('nonexistentuser')).rejects.toThrowError(
        expect.objectContaining({ code: 'PLAYER_NOT_FOUND', status: 404 })
      );
    });

    it('handles malformed JSON gracefully', async () => {
      const res = mockProfileResponse('invalid json {', {
        headers: { 'content-type': 'application/json' },
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
        expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' })
      );
    });

    it('rejects payload missing required fields', async () => {
      const res = mockProfileResponse({ avatar: 'some-url' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
        expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' })
      );
    });

    it('validates each required profile property type', async () => {
      // empty username
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockProfileResponse({
          username: '',
          joined: 100,
          status: 'basic',
          url: 'https://chess.com',
        })
      );
      await expect(fetchPlayerProfile('erik')).rejects.toThrow();

      // invalid joined
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockProfileResponse({
          username: 'erik',
          joined: 'not-number',
          status: 'basic',
          url: 'https://chess.com',
        })
      );
      await expect(fetchPlayerProfile('erik')).rejects.toThrow();

      // invalid status
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockProfileResponse({
          username: 'erik',
          joined: 100,
          status: 123,
          url: 'https://chess.com',
        })
      );
      await expect(fetchPlayerProfile('erik')).rejects.toThrow();

      // invalid url
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        mockProfileResponse({ username: 'erik', joined: 100, status: 'basic', url: 123 })
      );
      await expect(fetchPlayerProfile('erik')).rejects.toThrow();

      // profile not an object
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockProfileResponse('null'));
      await expect(fetchPlayerProfile('erik')).rejects.toThrow();
    });

    it('respects pre-aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(fetchPlayerProfile('erik', { signal: controller.signal })).rejects.toThrowError(
        expect.objectContaining({ code: 'ABORTED' })
      );
    });

    it('respects abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(fetchPlayerProfile('erik', { signal: controller.signal })).rejects.toThrowError(
        expect.objectContaining({ code: 'ABORTED' })
      );
    });
  });

  describe('fetchPlayerStats', () => {
    it('successfully fetches and parses complete player stats', async () => {
      const mockData = {
        chess_rapid: {
          last: { rating: 1820, date: 1680000000 },
          best: { rating: 1890, date: 1670000000, game: 'https://chess.com/game/123' },
          record: { win: 50, loss: 30, draw: 10 },
        },
        chess_blitz: {
          last: { rating: 1750, date: 1680000000 },
          best: { rating: 1780, date: 1675000000 },
          record: { win: 100, loss: 80, draw: 20 },
        },
        chess_bullet: {
          last: { rating: 1600, date: 1680000000 },
          best: { rating: 1650, date: 1670000000 },
          record: { win: 40, loss: 40, draw: 5 },
        },
        chess_daily: {
          last: { rating: 1500, date: 1680000000 },
          best: { rating: 1550, date: 1660000000 },
          record: { win: 10, loss: 5, draw: 2 },
        },
        tactics: {
          highest: { rating: 2200, date: 1680000000 },
          lowest: { rating: 1400, date: 1600000000 },
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockStatsResponse(mockData));

      const stats = await fetchPlayerStats('erik');
      expect(stats.chess_rapid?.last?.rating).toBe(1820);
      expect(stats.chess_blitz?.best?.rating).toBe(1780);
      expect(stats.tactics?.highest?.rating).toBe(2200);
    });

    it('successfully parses empty stats payload', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockStatsResponse({}));

      const stats = await fetchPlayerStats('erik');
      expect(stats).toEqual({});
    });

    it('maps 404 to PLAYER_NOT_FOUND', async () => {
      const res = mockStatsResponse(
        { message: 'User not found' },
        { status: 404 },
        'nonexistentuser'
      );
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerStats('nonexistentuser')).rejects.toThrowError(
        expect.objectContaining({ code: 'PLAYER_NOT_FOUND', status: 404 })
      );
    });

    it('handles malformed JSON gracefully', async () => {
      const res = mockStatsResponse('invalid json {', {
        headers: { 'content-type': 'application/json' },
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerStats('erik')).rejects.toThrowError(
        expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' })
      );
    });

    it('rejects stats payload when not an object', async () => {
      const res = mockStatsResponse('["invalid", "array"]');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerStats('erik')).rejects.toThrowError(
        expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' })
      );
    });

    it('handles partial time class data gracefully', async () => {
      const mockData = {
        chess_rapid: {
          last: { rating: 'not-a-number' },
          best: { date: 12345 },
          record: { win: 'not-a-number' },
        },
        tactics: {
          highest: { date: 12345 },
          lowest: { rating: 'not-a-number' },
        },
      };

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockStatsResponse(mockData));
      const stats = await fetchPlayerStats('erik');
      expect(stats.chess_rapid?.last).toBeUndefined();
      expect(stats.chess_rapid?.best).toBeUndefined();
      expect(stats.chess_rapid?.record).toBeUndefined();
      expect(stats.tactics?.highest).toBeUndefined();
      expect(stats.tactics?.lowest).toBeUndefined();
    });
  });

  describe('executeProfileRequest branch coverage', () => {
    it('rejects when response URL is missing or empty', async () => {
      const res = mockProfileResponse({ username: 'erik' });
      Object.defineProperty(res, 'url', { value: '', configurable: true });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
        expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' })
      );
    });

    it('rejects when redirect target is disallowed', async () => {
      const res = mockProfileResponse({ username: 'erik' });
      Object.defineProperty(res, 'url', {
        value: 'https://evil.com/pub/player/erik',
        configurable: true,
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
        expect.objectContaining({ code: 'REDIRECT_DISALLOWED' })
      );
    });

    it('handles 429 rate limit with retry-after header', async () => {
      const res = mockProfileResponse(
        { message: 'Rate limit' },
        {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': '30',
          },
        }
      );
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
        expect.objectContaining({
          code: 'UPSTREAM_RATE_LIMITED',
          status: 429,
          retryAfterMs: 30000,
        })
      );
    });

    it('rejects non-json content-type', async () => {
      const res = mockProfileResponse('<html>Not JSON</html>', {
        headers: { 'content-type': 'text/html' },
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
        expect.objectContaining({ code: 'INVALID_UPSTREAM_RESPONSE' })
      );
    });

    it('rejects response with content-length exceeding max body bytes', async () => {
      const res = mockProfileResponse('{}', {
        headers: {
          'content-type': 'application/json',
          'content-length': '5000000',
        },
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
        expect.objectContaining({ code: 'RESPONSE_TOO_LARGE' })
      );
    });

    it('converts TypeError to offline error when navigator.onLine is false', async () => {
      const originalOnLine = navigator.onLine;
      try {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        const typeError = new TypeError('Failed to fetch');
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(typeError);

        await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
          expect.objectContaining({ code: 'OFFLINE' })
        );
      } finally {
        Object.defineProperty(navigator, 'onLine', {
          value: originalOnLine,
          configurable: true,
        });
      }
    });

    it('converts TypeError to CORS error when navigator.onLine is true', async () => {
      const originalOnLine = navigator.onLine;
      try {
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        const typeError = new TypeError('Failed to fetch');
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(typeError);

        await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
          expect.objectContaining({ code: 'CORS_ERROR' })
        );
      } finally {
        Object.defineProperty(navigator, 'onLine', {
          value: originalOnLine,
          configurable: true,
        });
      }
    });

    it('handles timeout from signal', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
        return new Promise((_, reject) => {
          const reqInit = init as RequestInit | undefined;
          reqInit?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      await expect(fetchPlayerProfile('erik', { timeoutMs: 20 })).rejects.toThrowError(
        expect.objectContaining({ code: 'TIMEOUT' })
      );
    });

    it('handles abort error without timeout', async () => {
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortErr);

      await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
        expect.objectContaining({ code: 'ABORTED' })
      );
    });

    it('handles fallback text reader when response.body is null and exceeds size', async () => {
      const res = mockProfileResponse('{}');
      Object.defineProperty(res, 'body', { value: null });
      vi.spyOn(res, 'text').mockResolvedValue('a'.repeat(5 * 1024 * 1024));
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
        expect.objectContaining({ code: 'RESPONSE_TOO_LARGE' })
      );
    });

    it('handles fallback text reader when response.body is null and valid', async () => {
      const res = mockProfileResponse(
        JSON.stringify({ username: 'erik', joined: 100, status: 'basic', url: 'https://chess.com' })
      );
      Object.defineProperty(res, 'body', { value: null });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      const profile = await fetchPlayerProfile('erik');
      expect(profile.username).toBe('erik');
    });

    it('handles unknown non-object errors when offline or online', async () => {
      const originalOnLine = navigator.onLine;
      try {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        vi.spyOn(globalThis, 'fetch').mockRejectedValue('network-string-failure');
        await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
          expect.objectContaining({ code: 'OFFLINE' })
        );

        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        vi.spyOn(globalThis, 'fetch').mockRejectedValue('network-string-failure');
        await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
          expect.objectContaining({ code: 'CORS_ERROR' })
        );
      } finally {
        Object.defineProperty(navigator, 'onLine', {
          value: originalOnLine,
          configurable: true,
        });
      }
    });

    it('rejects streamed response that exceeds max body bytes', async () => {
      const chunk = new Uint8Array(1024 * 1024); // 1 MiB chunk
      let sent = 0;
      const stream = new ReadableStream({
        pull(controller) {
          if (sent < 5) {
            controller.enqueue(chunk);
            sent++;
          } else {
            controller.close();
          }
        },
      });

      const res = new Response(stream, {
        headers: { 'content-type': 'application/json' },
      });
      Object.defineProperty(res, 'url', {
        value: 'https://api.chess.com/pub/player/erik',
      });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(res);

      await expect(fetchPlayerProfile('erik')).rejects.toThrowError(
        expect.objectContaining({ code: 'RESPONSE_TOO_LARGE' })
      );
    });
  });
});
