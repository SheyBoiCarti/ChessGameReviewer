import { Chess, type Square } from 'chess.js';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface BoardMoveIntent {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}

export interface AppliedBoardMove extends Required<Pick<BoardMoveIntent, 'from' | 'to'>> {
  promotion?: PromotionPiece;
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
}

export function legalDestinations(fen: string, from: Square): readonly Square[] {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ square: from, verbose: true });
    const unique = new Set<Square>();
    for (const move of moves) {
      unique.add(move.to as Square);
    }
    return Array.from(unique);
  } catch {
    return [];
  }
}

export function promotionRequired(
  fen: string,
  intent: Pick<BoardMoveIntent, 'from' | 'to'>
): boolean {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ square: intent.from, verbose: true });
    return moves.some(
      (m) =>
        m.to === intent.to &&
        (m.promotion !== undefined || m.flags.includes('p') || m.flags.includes('cp'))
    );
  } catch {
    return false;
  }
}

export function applyBoardMove(fen: string, intent: BoardMoveIntent): AppliedBoardMove | null {
  try {
    const chess = new Chess(fen);
    const fenBefore = chess.fen();
    const moveResult = chess.move({
      from: intent.from,
      to: intent.to,
      ...(intent.promotion ? { promotion: intent.promotion } : {}),
    });
    if (!moveResult) return null;
    const fenAfter = chess.fen();
    const uci = `${intent.from}${intent.to}${intent.promotion ?? ''}`;
    return {
      from: intent.from,
      to: intent.to,
      ...(intent.promotion ? { promotion: intent.promotion } : {}),
      uci,
      san: moveResult.san,
      fenBefore,
      fenAfter,
    };
  } catch {
    return null;
  }
}
