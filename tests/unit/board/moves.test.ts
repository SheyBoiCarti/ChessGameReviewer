import { describe, expect, it } from 'vitest';

import {
  applyBoardMove,
  legalDestinations,
  promotionRequired,
} from '@/features/board/moves';

describe('controlled board move domain', () => {
  const initial = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const castling = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  const enPassant = '8/8/8/3pP3/8/8/8/K6k w - d6 0 2';
  const promotion = '7k/P7/8/8/8/8/8/K7 w - - 0 1';

  it('applies a normal pawn move e2->e4', () => {
    const move = applyBoardMove(initial, { from: 'e2', to: 'e4' });
    expect(move).not.toBeNull();
    expect(move?.uci).toBe('e2e4');
    expect(move?.san).toBe('e4');
    expect(move?.fenBefore).toBe(initial);
    expect(move?.fenAfter).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  });

  it('handles castling correctly', () => {
    const move = applyBoardMove(castling, { from: 'e1', to: 'g1' });
    expect(move).not.toBeNull();
    expect(move?.uci).toBe('e1g1');
    expect(move?.san).toBe('O-O');
    expect(move?.fenAfter).toContain('R4RK1');
  });

  it('handles en passant capture', () => {
    const move = applyBoardMove(enPassant, { from: 'e5', to: 'd6' });
    expect(move).not.toBeNull();
    expect(move?.uci).toBe('e5d6');
    expect(move?.san).toBe('exd6');
  });

  it('detects promotion requirement and applies promotion', () => {
    expect(promotionRequired(promotion, { from: 'a7', to: 'a8' })).toBe(true);
    expect(promotionRequired(initial, { from: 'e2', to: 'e4' })).toBe(false);

    const queenPromo = applyBoardMove(promotion, { from: 'a7', to: 'a8', promotion: 'q' });
    expect(queenPromo).not.toBeNull();
    expect(queenPromo?.uci).toBe('a7a8q');
    expect(queenPromo?.san).toBe('a8=Q+');
    expect(queenPromo?.promotion).toBe('q');
  });

  it('deduplicates legal destinations for pawns with promotion options', () => {
    const destinations = legalDestinations(promotion, 'a7');
    expect(destinations).toEqual(['a8']);
  });

  it('returns empty array / false / null for illegal and malformed inputs', () => {
    expect(applyBoardMove(initial, { from: 'e2', to: 'e5' })).toBeNull();
    expect(applyBoardMove('invalid-fen', { from: 'e2', to: 'e4' })).toBeNull();

    expect(legalDestinations('invalid-fen', 'e2')).toEqual([]);
    expect(legalDestinations(initial, 'e3')).toEqual([]);

    expect(promotionRequired('invalid-fen', { from: 'a7', to: 'a8' })).toBe(false);
    expect(promotionRequired(initial, { from: 'e2', to: 'e5' })).toBe(false);
  });
});
