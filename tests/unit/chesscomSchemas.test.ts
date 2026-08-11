import { describe, expect, it } from 'vitest';
import {
  parseUpstreamHttpError,
  validateArchivesResponse,
  validateMonthlyGamesResponse,
  validateRawGame,
} from '@/lib/api/chesscomSchemas';
import validArchives from '../fixtures/upstream/validArchives.json';
import validMonthlyGames from '../fixtures/upstream/validMonthlyGames.json';
import missingFieldsGame from '../fixtures/upstream/missingFieldsGame.json';
import malformedGame from '../fixtures/upstream/malformedGame.json';
import httpErrorResponses from '../fixtures/upstream/httpErrorResponses.json';

describe('chesscomSchemas runtime validation', () => {
  describe('validateArchivesResponse', () => {
    it('successfully validates valid archives response', () => {
      const result = validateArchivesResponse(validArchives);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.archives).toHaveLength(2);
        expect(result.archives[0]).toBe(
          'https://api.chess.com/pub/player/magnuscarlsen/games/2024/01'
        );
      }
    });

    it('rejects invalid archives payload shape', () => {
      const result = validateArchivesResponse({ archives: 'not an array' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostic.code).toBe('INVALID_UPSTREAM_RESPONSE');
      }
    });

    it('filters non-string archive URLs in array', () => {
      const result = validateArchivesResponse({
        archives: ['https://api.chess.com/pub/player/hikaru/games/2024/01', 12345, null],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.archives).toHaveLength(1);
      }
    });
  });

  describe('validateMonthlyGamesResponse', () => {
    it('successfully validates valid monthly games response', () => {
      const result = validateMonthlyGamesResponse(validMonthlyGames);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.games).toHaveLength(1);
        expect(result.diagnostics).toHaveLength(0);
      }
    });

    it('ignores unknown upstream fields on raw games', () => {
      const data = {
        games: [
          {
            ...validMonthlyGames.games[0],
            extra_field: 'should be ignored',
            internal_meta: { foo: 'bar' },
          },
        ],
      };
      const result = validateMonthlyGamesResponse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.games[0]).not.toHaveProperty('extra_field');
        expect(result.games[0]).not.toHaveProperty('internal_meta');
      }
    });

    it('handles missing required fields with structured diagnostics tied to stable game ID', () => {
      const result = validateMonthlyGamesResponse(missingFieldsGame);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.games).toHaveLength(0);
        expect(result.diagnostics).toHaveLength(1);
        const diag = result.diagnostics[0];
        expect(diag?.gameId).toBe('https://www.chess.com/game/live/101010102');
        expect(diag?.code).toBe('MISSING_REQUIRED_GAME_FIELD');
      }
    });

    it('handles malformed raw games producing structured diagnostics', () => {
      const result = validateMonthlyGamesResponse(malformedGame);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.games).toHaveLength(0);
        expect(result.diagnostics.length).toBeGreaterThan(0);
        expect(result.diagnostics[0]?.code).toBe('MALFORMED_GAME_RECORD');
      }
    });

    it('rejects oversized game response count > 20,000', () => {
      const oversizedGames = Array.from({ length: 20001 }, (_, i) => ({
        url: `https://www.chess.com/game/live/${i}`,
        end_time: 1700000000,
        time_class: 'blitz',
        rules: 'chess',
        white: { username: 'player1', result: 'win' },
        black: { username: 'player2', result: 'checkmated' },
      }));

      const result = validateMonthlyGamesResponse({ games: oversizedGames });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostic.code).toBe('RESPONSE_TOO_LARGE');
        expect(result.diagnostic.message).toContain('20000');
      }
    });
  });

  describe('parseUpstreamHttpError', () => {
    it('maps 404 response to PLAYER_NOT_FOUND without exposing raw body', () => {
      const err = parseUpstreamHttpError(404, httpErrorResponses.notFound404);
      expect(err.code).toBe('PLAYER_NOT_FOUND');
      expect(err.retryable).toBe(false);
      expect(err.status).toBe(404);
      expect(err.message).not.toContain('User or resource not found');
      expect(err.message).toBe('Upstream player or resource not found (HTTP 404)');
    });

    it('maps 410 response to PLAYER_NOT_FOUND', () => {
      const err = parseUpstreamHttpError(410, httpErrorResponses.gone410);
      expect(err.code).toBe('PLAYER_NOT_FOUND');
      expect(err.retryable).toBe(false);
      expect(err.status).toBe(410);
    });

    it('maps 429 rate limit error to UPSTREAM_RATE_LIMITED and retryable', () => {
      const err = parseUpstreamHttpError(429, httpErrorResponses.rateLimit429Html);
      expect(err.code).toBe('UPSTREAM_RATE_LIMITED');
      expect(err.retryable).toBe(true);
      expect(err.status).toBe(429);
      expect(err.message).not.toContain('<html>');
    });

    it('maps 5xx server error to UPSTREAM_UNAVAILABLE', () => {
      const err = parseUpstreamHttpError(503, httpErrorResponses.serverError500Html);
      expect(err.code).toBe('UPSTREAM_UNAVAILABLE');
      expect(err.retryable).toBe(true);
      expect(err.status).toBe(503);
      expect(err.message).not.toContain('<html>');
    });
  });
});
