import type { BoardPiece } from '@/features/board/position';

const glyphs: Record<BoardPiece['color'], Record<BoardPiece['type'], string>> = {
  white: { pawn: '♙', knight: '♘', bishop: '♗', rook: '♖', queen: '♕', king: '♔' },
  black: { pawn: '♟', knight: '♞', bishop: '♝', rook: '♜', queen: '♛', king: '♚' },
};

export function Piece({ piece, square }: { piece: BoardPiece; square: string }) {
  return (
    <span
      className={`chess-piece piece-${piece.color}`}
      role="img"
      aria-label={`${piece.color} ${piece.type} on ${square}`}
    >
      {glyphs[piece.color][piece.type]}
    </span>
  );
}
