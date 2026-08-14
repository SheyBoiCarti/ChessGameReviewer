import { describe, expect, it } from 'vitest';

import { classifyMoveAccuracy } from '@/lib/engine/accuracy';
import {
  calculateCentipawnLoss,
  isExactScore,
  isFiniteScore,
  normalizeUciScoreToWhite,
  parseFenSideToMove,
  toMoverPerspective,
} from '@/lib/engine/evaluation';
import { selectEngineResources } from '@/lib/engine/resourcePolicy';
import {
  scoreToMoverWinProbability,
  scoreToWhiteWinProbability,
  terminalMoverWinProbability,
} from '@/lib/engine/winProbability';
import { parseUciLine } from '@/lib/engine/uci/parser';

describe('Engine domain extra edge case tests', () => {
  describe('winProbability', () => {
    it('handles mate scores correctly', () => {
      expect(scoreToWhiteWinProbability({ kind: 'mate', value: 1 })).toBe(1);
      expect(scoreToWhiteWinProbability({ kind: 'mate', value: -1 })).toBe(0);
      expect(scoreToWhiteWinProbability({ kind: 'mate', value: 0 })).toBe(null);
      expect(scoreToWhiteWinProbability({ kind: 'cp', value: 100, bound: 'lower' })).toBe(null);
    });

    it('handles mover perspective win probability', () => {
      expect(scoreToMoverWinProbability({ kind: 'cp', value: 200 }, 'white')).toBeGreaterThan(0.5);
      expect(scoreToMoverWinProbability({ kind: 'cp', value: 200 }, 'black')).toBeLessThan(0.5);
      expect(scoreToMoverWinProbability({ kind: 'cp', value: Number.NaN }, 'white')).toBe(null);
    });

    it('determines terminal mover win probabilities', () => {
      // Checkmate for black (white is checkmated)
      const whiteMatedFen = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
      expect(terminalMoverWinProbability(whiteMatedFen, 'white')).toBe(0);
      expect(terminalMoverWinProbability(whiteMatedFen, 'black')).toBe(1);

      // Stalemate
      const stalemateFen = '7k/5K2/6Q1/8/8/8/8/8 b - - 0 1';
      expect(terminalMoverWinProbability(stalemateFen, 'black')).toBe(0.5);

      // Normal playable position
      const normalFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      expect(terminalMoverWinProbability(normalFen, 'white')).toBe(null);
    });
  });

  describe('evaluation', () => {
    it('handles invalid FEN in parseFenSideToMove', () => {
      expect(() => parseFenSideToMove('invalid fen')).toThrow('expected exactly six FEN fields');
      expect(() =>
        parseFenSideToMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1')
      ).toThrow('INVALID_FEN');
    });

    it('normalizes score to white with bounds and non-finite scores', () => {
      expect(
        normalizeUciScoreToWhite(
          { kind: 'cp', value: Number.NaN },
          'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        )
      ).toBe(null);
      expect(
        normalizeUciScoreToWhite(
          { kind: 'cp', value: 50, bound: 'lower' },
          'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1'
        )
      ).toEqual({
        kind: 'cp',
        value: -50,
        bound: 'lower',
      });
    });

    it('converts to mover perspective with bounds and non-finite', () => {
      expect(toMoverPerspective({ kind: 'cp', value: Number.NaN }, 'white')).toBe(null);
      expect(toMoverPerspective({ kind: 'cp', value: 80, bound: 'upper' }, 'black')).toEqual({
        kind: 'cp',
        value: -80,
        bound: 'upper',
      });
    });

    it('calculates centipawn loss safely', () => {
      expect(
        calculateCentipawnLoss({ kind: 'cp', value: 100 }, { kind: 'cp', value: 50 }, 'white')
      ).toBe(50);
      expect(
        calculateCentipawnLoss({ kind: 'cp', value: 100 }, { kind: 'cp', value: 150 }, 'white')
      ).toBe(0);
      expect(
        calculateCentipawnLoss(
          { kind: 'cp', value: 100, bound: 'lower' },
          { kind: 'cp', value: 50 },
          'white'
        )
      ).toBe(null);
      expect(
        calculateCentipawnLoss({ kind: 'mate', value: 1 }, { kind: 'cp', value: 50 }, 'white')
      ).toBe(null);
      expect(
        calculateCentipawnLoss(
          { kind: 'cp', value: Number.NaN },
          { kind: 'cp', value: 50 },
          'white'
        )
      ).toBe(null);
    });

    it('validates finite and exact scores', () => {
      expect(isFiniteScore({ kind: 'cp', value: 0 })).toBe(true);
      expect(isFiniteScore({ kind: 'cp', value: Number.POSITIVE_INFINITY })).toBe(false);
      expect(isExactScore({ kind: 'cp', value: 10, bound: 'lower' })).toBe(false);
      expect(isExactScore({ kind: 'cp', value: 10 })).toBe(true);
    });
  });

  describe('resourcePolicy', () => {
    it('handles mobile resource limits', () => {
      const mobileResources = selectEngineResources({
        mobile: true,
        hardwareConcurrency: 8,
        deviceMemoryGb: 2,
      });
      expect(mobileResources.threads).toBe(4);
      expect(mobileResources.hashMb).toBe(16);

      const highMemory = selectEngineResources({ hardwareConcurrency: 4, deviceMemoryGb: 8 });
      expect(highMemory.hashMb).toBe(64);

      const normalMemory = selectEngineResources({ hardwareConcurrency: 2, deviceMemoryGb: 4 });
      expect(normalMemory.hashMb).toBe(32);
    });
  });

  describe('accuracy', () => {
    it('handles invalid probabilities in classifyProbabilities', () => {
      expect(
        classifyMoveAccuracy({ beforeProbability: Number.NaN, afterProbability: 0.5 })
      ).toEqual({
        status: 'indeterminate',
        reason: 'non-finite-probability',
      });
      expect(classifyMoveAccuracy({ beforeProbability: 1.5, afterProbability: 0.5 })).toEqual({
        status: 'indeterminate',
        reason: 'non-finite-probability',
      });
      expect(classifyMoveAccuracy({ beforeProbability: 0.5, afterProbability: -0.1 })).toEqual({
        status: 'indeterminate',
        reason: 'non-finite-probability',
      });
    });
  });

  describe('uci parser', () => {
    it('handles option lines and unknown lines', () => {
      expect(parseUciLine('option name Threads type spin default 1 min 1 max 512')).toEqual({
        type: 'option',
        name: 'Threads',
        value: 'option name Threads type spin default 1 min 1 max 512',
      });
      expect(parseUciLine('Unknown command: foo')).toEqual({
        type: 'error',
        message: 'Unknown command: foo',
      });
      expect(parseUciLine('something unparsed')).toEqual({
        type: 'unknown',
        raw: 'something unparsed',
      });
      expect(parseUciLine('option with-no-name')).toEqual({
        type: 'unknown',
        raw: 'option with-no-name',
      });
      expect(parseUciLine('info depth 10 score cp 45 time 100 nodes 1000 nps 10000')).toMatchObject(
        {
          type: 'info',
          depth: 10,
          score: { kind: 'cp', value: 45 },
        }
      );
    });
  });
});
