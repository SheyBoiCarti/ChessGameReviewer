import { describe, expect, it } from 'vitest';

import { parseUciLine } from '../../../../lib/engine/uci/parser';

describe('parseUciLine', () => {
  it('parses a complete multipv info line regardless of field order', () => {
    expect(
      parseUciLine(
        'info nps 140000 score cp -23 lowerbound depth 18 multipv 2 nodes 125000 time 892 pv e7e5 g1f3'
      )
    ).toEqual({
      type: 'info',
      depth: 18,
      multiPv: 2,
      score: { kind: 'cp', value: -23, bound: 'lower' },
      nodes: 125000,
      nps: 140000,
      time: 892,
      pv: ['e7e5', 'g1f3'],
    });
  });

  it('parses mate scores and optional ponder moves', () => {
    expect(parseUciLine('info depth 30 score mate -4 pv a7a8q')).toEqual({
      type: 'info',
      depth: 30,
      score: { kind: 'mate', value: -4 },
      pv: ['a7a8q'],
    });
    expect(parseUciLine('bestmove e2e4 ponder e7e5')).toEqual({
      type: 'bestmove',
      move: 'e2e4',
      ponder: 'e7e5',
    });
  });

  it('rejects non-finite numeric values without throwing', () => {
    expect(parseUciLine('info depth NaN score cp Infinity pv e2e4')).toEqual({
      type: 'info',
      pv: ['e2e4'],
    });
  });

  it('recognizes UCI lifecycle and engine-error lines', () => {
    expect(parseUciLine('uciok')).toEqual({ type: 'uciok' });
    expect(parseUciLine('readyok')).toEqual({ type: 'readyok' });
    expect(parseUciLine('id name Stockfish 17')).toEqual({ type: 'id', field: 'name', value: 'Stockfish 17' });
    expect(parseUciLine('Unknown command: foo')).toEqual({ type: 'error', message: 'Unknown command: foo' });
  });
});
