import { describe, expect, it } from 'vitest';
import {
  CHESSCOM_RESULT_TOKENS,
  determineUserOutcome,
  isKnownResultToken,
} from '@/lib/chess/results';

describe('Chess.com player result token mapping and consistency validation', () => {
  describe('CHESSCOM_RESULT_TOKENS table', () => {
    it('defines explicit mappings for all documented Chess.com result tokens', () => {
      expect(CHESSCOM_RESULT_TOKENS['win']).toBe('win');
      expect(CHESSCOM_RESULT_TOKENS['checkmated']).toBe('loss');
      expect(CHESSCOM_RESULT_TOKENS['resigned']).toBe('loss');
      expect(CHESSCOM_RESULT_TOKENS['timeout']).toBe('loss');
      expect(CHESSCOM_RESULT_TOKENS['abandoned']).toBe('loss');
      expect(CHESSCOM_RESULT_TOKENS['agreed']).toBe('draw');
      expect(CHESSCOM_RESULT_TOKENS['repetition']).toBe('draw');
      expect(CHESSCOM_RESULT_TOKENS['stalemate']).toBe('draw');
      expect(CHESSCOM_RESULT_TOKENS['insufficient']).toBe('draw');
      expect(CHESSCOM_RESULT_TOKENS['50move']).toBe('draw');
      expect(CHESSCOM_RESULT_TOKENS['timevsinsufficient']).toBe('draw');
    });
  });

  describe('table-driven determineUserOutcome', () => {
    describe('White user outcomes', () => {
      it.each([
        ['win', 'resigned', 'win'],
        ['win', 'checkmated', 'win'],
        ['win', 'timeout', 'win'],
        ['win', 'abandoned', 'win'],
        ['checkmated', 'win', 'loss'],
        ['resigned', 'win', 'loss'],
        ['timeout', 'win', 'loss'],
        ['abandoned', 'win', 'loss'],
        ['agreed', 'agreed', 'draw'],
        ['repetition', 'repetition', 'draw'],
        ['stalemate', 'stalemate', 'draw'],
        ['insufficient', 'insufficient', 'draw'],
        ['50move', '50move', 'draw'],
        ['timevsinsufficient', 'insufficient', 'draw'],
        ['insufficient', 'timevsinsufficient', 'draw'],
        ['timevsinsufficient', 'timevsinsufficient', 'draw'],
      ])(
        'for White: whiteResult=%s, blackResult=%s => outcome %s',
        (whiteResult, blackResult, expectedOutcome) => {
          const outcome = determineUserOutcome({
            userColor: 'white',
            whiteResult,
            blackResult,
          });

          expect(outcome.success).toBe(true);
          if (outcome.success) {
            expect(outcome.userResult).toBe(expectedOutcome);
          }
        }
      );
    });

    describe('Black user outcomes', () => {
      it.each([
        ['resigned', 'win', 'win'],
        ['checkmated', 'win', 'win'],
        ['timeout', 'win', 'win'],
        ['win', 'resigned', 'loss'],
        ['win', 'checkmated', 'loss'],
        ['agreed', 'agreed', 'draw'],
        ['timevsinsufficient', 'insufficient', 'draw'],
        ['insufficient', 'timevsinsufficient', 'draw'],
        ['timevsinsufficient', 'timevsinsufficient', 'draw'],
      ])(
        'for Black: whiteResult=%s, blackResult=%s => outcome %s',
        (whiteResult, blackResult, expectedOutcome) => {
          const outcome = determineUserOutcome({
            userColor: 'black',
            whiteResult,
            blackResult,
          });

          expect(outcome.success).toBe(true);
          if (outcome.success) {
            expect(outcome.userResult).toBe(expectedOutcome);
          }
        }
      );
    });

    describe('inconsistent player result pairs', () => {
      it.each([
        ['win', 'win', 'both won'],
        ['win', 'agreed', 'win and draw'],
        ['checkmated', 'agreed', 'loss and draw'],
        ['agreed', 'resigned', 'draw and loss'],
      ])(
        'rejects inconsistent pair whiteResult=%s, blackResult=%s (%s)',
        (whiteResult, blackResult) => {
          const outcome = determineUserOutcome({
            userColor: 'white',
            whiteResult,
            blackResult,
          });

          expect(outcome.success).toBe(false);
          if (!outcome.success) {
            expect(outcome.diagnostic.code).toBe('INCONSISTENT_PLAYER_RESULTS');
          }
        }
      );
    });

    describe('unknown result tokens', () => {
      it('rejects unknown white result token without mapping to draw', () => {
        const outcome = determineUserOutcome({
          userColor: 'white',
          whiteResult: 'unknown_token_xyz',
          blackResult: 'win',
        });

        expect(outcome.success).toBe(false);
        if (!outcome.success) {
          expect(outcome.diagnostic.code).toBe('UNKNOWN_RESULT_TOKEN');
          expect(outcome.diagnostic.message).toContain('unknown_token_xyz');
        }
      });

      it('rejects unknown black result token', () => {
        const outcome = determineUserOutcome({
          userColor: 'black',
          whiteResult: 'win',
          blackResult: 'mystery_outcome',
        });

        expect(outcome.success).toBe(false);
        if (!outcome.success) {
          expect(outcome.diagnostic.code).toBe('UNKNOWN_RESULT_TOKEN');
        }
      });
    });
  });

  describe('isKnownResultToken helper', () => {
    it('returns true for documented tokens and false for unknown ones', () => {
      expect(isKnownResultToken('win')).toBe(true);
      expect(isKnownResultToken('checkmated')).toBe(true);
      expect(isKnownResultToken('foobar')).toBe(false);
    });
  });
});
