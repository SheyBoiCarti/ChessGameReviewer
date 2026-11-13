import { Chess } from 'chess.js';
import { createEvaluationFixture } from '../../e2e/helpers/engineFixtures';
import scopeGames from '../../fixtures/openingScopeGames.json';
import { describe, expect, it } from 'vitest';

import { isWorkerRequest, PROTOCOL_VERSION } from '@/workers/protocol';

describe('analysis worker protocol validation', () => {
  it('accepts a versioned BUILD_GRAPH request and rejects malformed messages', () => {
    expect(
      isWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        jobId: 'job-1',
        type: 'BUILD_GRAPH',
        games: [],
        options: { maxOpeningPlies: 30, includeRepeatedPositions: true },
        queryFingerprint: 'query',
      })
    ).toBe(true);
    expect(isWorkerRequest({ protocolVersion: 99, jobId: 'job-1', type: 'BUILD_GRAPH' })).toBe(
      false
    );
    expect(
      isWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        jobId: 'job-1',
        type: 'BUILD_GRAPH',
        games: [],
        options: { maxOpeningPlies: 41, includeRepeatedPositions: true },
        queryFingerprint: 'query',
      })
    ).toBe(false);
    expect(
      isWorkerRequest({ protocolVersion: PROTOCOL_VERSION, jobId: '', type: 'CANCEL_JOB' })
    ).toBe(false);
  });

  it('accepts a versioned VALIDATE_PGNS request and rejects a non-array games payload', () => {
    expect(
      isWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        jobId: 'validation-job',
        type: 'VALIDATE_PGNS',
        games: [],
      })
    ).toBe(true);
    expect(
      isWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        jobId: 'validation-job',
        type: 'VALIDATE_PGNS',
        games: {},
      })
    ).toBe(false);
  });
});

// Legal PVs are generated from each FEN, unlike synthetic long-analysis transport fixtures.

describe('controlled engine fixture responses', () => {
  it('has legal primary/secondary PVs, depth and scores for every fixture position', () => {
    const fens = new Set<string>();
    for (const game of scopeGames) {
      const board = new Chess();
      board.loadPgn(game.pgn, { strict: true });
      for (const move of board.history({ verbose: true })) {
        fens.add(move.before);
        fens.add(move.after);
      }
    }
    for (const fen of fens) {
      const result = createEvaluationFixture(fen);
      expect(result.lines).toHaveLength(2);
      expect(result.bestMove).toBe(result.lines[0]?.pv[0]);
      for (const line of result.lines) {
        expect(line.depth).toBeGreaterThan(0);
        const board = new Chess(fen);
        for (const uci of line.pv)
          expect(
            board.move({
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              ...(uci[4] ? { promotion: uci[4] } : {}),
            })
          ).toBeTruthy();
      }
    }
  });
  it('supports mate scores and terminal positions without a fabricated move', () => {
    expect(
      createEvaluationFixture(new Chess().fen(), { kind: 'mate', value: -3 }).lines[0]?.score
    ).toEqual({ kind: 'mate', value: -3 });
    expect(createEvaluationFixture('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1')).toEqual({
      bestMove: '0000',
      lines: [],
    });
  });
});
