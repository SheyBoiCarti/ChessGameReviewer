import { describe, expect, it } from 'vitest';

import { boardSquares, InvalidBoardPositionError } from '@/features/board/position';

describe('boardSquares', () => {
  it('places real FEN pieces including a promotion-ready pawn', () => {
    const squares = boardSquares('7k/P7/8/8/8/8/8/K7 w - - 0 1', 'white');

    expect(squares.find((square) => square.name === 'a7')?.piece).toEqual({
      color: 'white',
      type: 'pawn',
    });
    expect(squares.find((square) => square.name === 'h8')?.piece).toEqual({
      color: 'black',
      type: 'king',
    });
  });

  it('changes only visual square order when orientation changes', () => {
    const fen = '8/8/8/8/8/8/8/K6k w - - 0 1';
    const white = boardSquares(fen, 'white');
    const black = boardSquares(fen, 'black');

    expect(white[0]?.name).toBe('a8');
    expect(black[0]?.name).toBe('h1');
    expect(white.find((square) => square.name === 'a1')?.piece).toEqual(
      black.find((square) => square.name === 'a1')?.piece
    );
  });

  it('rejects invalid FEN before rendering', () => {
    expect(() => boardSquares('not a fen', 'white')).toThrow(InvalidBoardPositionError);
  });
});
