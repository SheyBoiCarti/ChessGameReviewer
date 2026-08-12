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
import { makeOversizedMonthlyGamesFixture } from '../helpers/phase1Fixtures';

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

    it('rejects a null archives payload before property inspection', () => {
      expect(validateArchivesResponse(null)).toMatchObject({
        success: false,
        diagnostic: { code: 'INVALID_UPSTREAM_RESPONSE' },
      });
    });

    it('fails the entire response if it contains non-string archive URLs', () => {
      const result = validateArchivesResponse({
        archives: ['https://api.chess.com/pub/player/hikaru/games/2024/01', 12345, null],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostic.code).toBe('INVALID_ARCHIVES_SCHEMA');
      }
    });

    it('fails the entire response if it contains non-approved archive URLs', () => {
      const result = validateArchivesResponse({
        archives: [
          'https://api.chess.com/pub/player/hikaru/games/2024/01',
          'https://malicious.com/api',
        ],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostic.code).toBe('INVALID_ARCHIVES_SCHEMA');
      }
    });

    it('rejects a non-string archives element instead of silently dropping it', () => {
      const result = validateArchivesResponse({ archives: ['https://api.chess.com/a', 42] });
      expect(result).toMatchObject({
        success: false,
        diagnostic: { code: 'INVALID_ARCHIVES_SCHEMA' },
      });
    });
  });

  describe('validateRawGame', () => {
    it('uses a UUID instead of a username-bearing game URL in diagnostics', () => {
      const result = validateRawGame({
        url: 'https://www.chess.com/game/live/private-user-123',
        uuid: 'safe-uuid',
      });
      expect(result).toMatchObject({ success: false, diagnostic: { gameId: 'safe-uuid' } });
    });

    it.each([
      [null, 'MALFORMED_GAME_RECORD'],
      [{ url: 42 }, 'MALFORMED_GAME_RECORD'],
      [{ url: 'game' }, 'MISSING_REQUIRED_GAME_FIELD'],
      [{ url: 'game', end_time: Number.NaN }, 'MALFORMED_GAME_RECORD'],
      [{ url: 'game', end_time: 1 }, 'MISSING_REQUIRED_GAME_FIELD'],
      [{ url: 'game', end_time: 1, time_class: 42 }, 'MALFORMED_GAME_RECORD'],
      [{ url: 'game', end_time: 1, time_class: 'blitz' }, 'MISSING_REQUIRED_GAME_FIELD'],
      [{ url: 'game', end_time: 1, time_class: 'blitz', rules: 42 }, 'MALFORMED_GAME_RECORD'],
      [
        { url: 'game', end_time: 1, time_class: 'blitz', rules: 'chess' },
        'MISSING_REQUIRED_GAME_FIELD',
      ],
      [
        {
          url: 'game',
          end_time: 1,
          time_class: 'blitz',
          rules: 'chess',
          white: null,
          black: {},
        },
        'MALFORMED_GAME_RECORD',
      ],
    ])('rejects malformed boundary value %# with %s', (value, code) => {
      expect(validateRawGame(value, 7)).toMatchObject({
        success: false,
        diagnostic: { code, gameId: 'game_index_7' },
      });
    });

    it('keeps every supported optional raw field and ignores malformed optional values', () => {
      const result = validateRawGame({
        url: 'game',
        end_time: 1,
        time_class: 'blitz',
        rules: 'chess',
        pgn: '1. e4',
        time_control: '300',
        rated: true,
        uuid: 'uuid',
        '@id': 'at-id',
        white: { username: 'a', rating: 1, result: 'win', uuid: 'w', '@id': 'wid' },
        black: { username: 'b', rating: Number.NaN, result: 'resigned' },
      });
      expect(result).toMatchObject({
        success: true,
        game: {
          pgn: '1. e4',
          time_control: '300',
          rated: true,
          uuid: 'uuid',
          '@id': 'at-id',
          white: { username: 'a', rating: 1, result: 'win', uuid: 'w', '@id': 'wid' },
          black: { username: 'b', result: 'resigned' },
        },
      });
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
        expect(diag?.gameId).toBe('game_index_0');
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
      const result = validateMonthlyGamesResponse(makeOversizedMonthlyGamesFixture());
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.diagnostic.code).toBe('RESPONSE_TOO_LARGE');
        expect(result.diagnostic.message).toContain('20000');
      }
    });

    it('rejects null and missing games collections', () => {
      expect(validateMonthlyGamesResponse(null)).toMatchObject({ success: false });
      expect(validateMonthlyGamesResponse({})).toMatchObject({ success: false });
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

    it('maps 400 and unexpected statuses without retrying', () => {
      expect(parseUpstreamHttpError(400)).toMatchObject({
        code: 'INVALID_REQUEST',
        retryable: false,
      });
      expect(parseUpstreamHttpError(418)).toMatchObject({
        code: 'INVALID_UPSTREAM_RESPONSE',
        retryable: false,
      });
    });
  });
});
