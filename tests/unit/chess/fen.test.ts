import { describe, expect, it } from 'vitest';

import { normalizePositionKey } from '@/lib/chess/fen';

describe('normalizePositionKey', () => {
  it('removes move counters while retaining board state and castling rights', () => {
    expect(normalizePositionKey('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toBe(
      'r3k2r/8/8/8/8/8/8/R3K2R w KQkq -'
    );
    expect(normalizePositionKey('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 72 91')).toBe(
      'r3k2r/8/8/8/8/8/8/R3K2R w KQkq -'
    );
  });

  it('does not merge positions whose side to move, castling rights, or legal en-passant state differs', () => {
    const base = normalizePositionKey(
      'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3'
    );

    expect(base).not.toBe(
      normalizePositionKey('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3')
    );
    expect(base).not.toBe(
      normalizePositionKey('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQ - 0 3')
    );
    expect(base).not.toBe(
      normalizePositionKey('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3')
    );
  });

  it('drops an en-passant target when no legal capture exists', () => {
    expect(normalizePositionKey('4k3/8/8/3p4/8/8/8/4K3 w - d6 0 1')).toBe(
      '4k3/8/8/3p4/8/8/8/4K3 w - -'
    );
  });

  it('rejects malformed complete FEN values', () => {
    expect(() => normalizePositionKey('not a fen')).toThrow('INVALID_FEN');
  });

  it('rejects otherwise valid positions without all six required fields', () => {
    expect(() => normalizePositionKey('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -')).toThrow('expected exactly six FEN fields');
  });
});
