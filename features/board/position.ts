import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

import type { BoardOrientation } from '../workspace/types';

export type BoardPieceType = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king';

export interface BoardPiece {
  color: 'white' | 'black';
  type: BoardPieceType;
}

export interface BoardSquare {
  name: Square;
  file: string;
  rank: number;
  isLight: boolean;
  piece: BoardPiece | null;
}

export class InvalidBoardPositionError extends Error {
  constructor() {
    super('The selected chess position is invalid and cannot be displayed.');
    this.name = 'InvalidBoardPositionError';
  }
}

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const pieceNames: Record<PieceSymbol, BoardPieceType> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export function boardSquares(fen: string, orientation: BoardOrientation): BoardSquare[] {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    throw new InvalidBoardPositionError();
  }

  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const orderedFiles = orientation === 'white' ? files : [...files].reverse();
  return ranks.flatMap((rank) =>
    orderedFiles.map((file) => {
      const name = `${file}${rank}` as Square;
      const piece = chess.get(name);
      return {
        name,
        file,
        rank,
        isLight: (files.indexOf(file) + rank) % 2 === 1,
        piece: piece ? toBoardPiece(piece.color, piece.type) : null,
      };
    })
  );
}

function toBoardPiece(color: Color, type: PieceSymbol): BoardPiece {
  return { color: color === 'w' ? 'white' : 'black', type: pieceNames[type] };
}
