import type { BoardPiece } from '@/features/board/position';

import { ChessPieceSvg } from './ChessPieceSvg';

export function Piece({
  piece,
  square,
  className,
}: {
  piece: BoardPiece;
  square: string;
  className?: string | undefined;
}) {
  return <ChessPieceSvg piece={piece} square={square} className={className} />;
}
