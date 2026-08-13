import type { BoardPiece } from '@/features/board/position';

import { ChessPieceSvg } from './ChessPieceSvg';

export function Piece({ piece, square }: { piece: BoardPiece; square: string }) {
  return <ChessPieceSvg piece={piece} square={square} />;
}
