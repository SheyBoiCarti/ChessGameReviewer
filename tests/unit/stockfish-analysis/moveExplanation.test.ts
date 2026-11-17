import { describe, it, expect } from 'vitest';
import { explainMove } from '@/features/stockfish-analysis/moveExplanation';

describe('legal move explanations', () => {
  it('rejects illegal moves, invalid FEN and malformed UCI', () => {
    expect(
      explainMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e5')
    ).toBeNull();
    expect(explainMove('bad', 'e2e4')).toBeNull();
    expect(explainMove('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8qgarbage')).toBeNull();
  });
  it('describes promotion and check from the resulting board', () => {
    expect(explainMove('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a7a8q')).toMatch(
      /promotes to a queen.*check/i
    );
  });
  it('describes ordinary and en passant captures', () => {
    expect(explainMove('7k/8/8/3p4/4P3/8/8/K7 w - - 0 1', 'e4d5')).toMatch(/captures a pawn/i);
    expect(explainMove('7k/8/8/3pP3/8/8/8/K7 w - d6 0 1', 'e5d6')).toMatch(
      /captures a pawn en passant/i
    );
  });
  it('distinguishes checkmate from check', () => {
    expect(explainMove('7k/8/5KQ1/8/8/8/8/8 w - - 0 1', 'g6g7')).toMatch(/checkmate/i);
  });
  it('leaves quiet moves for the neutral quality fallback', () => {
    expect(
      explainMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4')
    ).toBeNull();
  });
});
