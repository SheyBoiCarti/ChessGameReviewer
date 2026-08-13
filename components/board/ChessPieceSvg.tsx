import type { BoardPiece } from '@/features/board/position';

const pieceCodes: Record<BoardPiece['color'], Record<BoardPiece['type'], string>> = {
  white: { pawn: 'wp', knight: 'wn', bishop: 'wb', rook: 'wr', queen: 'wq', king: 'wk' },
  black: { pawn: 'bp', knight: 'bn', bishop: 'bb', rook: 'br', queen: 'bq', king: 'bk' },
};

export function ChessPieceSvg({ piece, square }: { piece: BoardPiece; square: string }) {
  const label = `${piece.color} ${piece.type} on ${square}`;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- local board art needs one native-image accessible name.
    <img
      className={`chess-piece piece-${piece.color}`}
      src={`/chess-pieces/${pieceCodes[piece.color][piece.type]}.svg`}
      alt=""
      aria-label={label}
      draggable={false}
    />
  );
}
