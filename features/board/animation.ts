import { Chess, type Square } from 'chess.js';

export interface AnimatedBoardMove {
  from: Square;
  to: Square;
}

export interface AnimationPosition {
  fen: string;
  lastMove?: AnimatedBoardMove | undefined;
}

// Only animate an actual adjacent move. History jumps and unrelated games snap
// to their requested position instead of replaying its last move.
export function getBoardTransitionMoves(
  previous: AnimationPosition,
  next: AnimationPosition
): AnimatedBoardMove[] {
  const forward = matchMove(previous.fen, next.fen, next.lastMove);
  if (forward.length > 0) return forward;
  return matchMove(next.fen, previous.fen, previous.lastMove).map(({ from, to }) => ({
    from: to,
    to: from,
  }));
}

function matchMove(
  beforeFen: string,
  afterFen: string,
  move: AnimatedBoardMove | undefined
): AnimatedBoardMove[] {
  if (!move) return [];
  try {
    const before = new Chess(beforeFen);
    const after = new Chess(afterFen);
    const promotion =
      before.get(move.from)?.type === 'p' && /[18]$/.test(move.to)
        ? after.get(move.to)?.type
        : undefined;
    const applied = before.move({ ...move, ...(promotion ? { promotion } : {}) });
    // Counters can differ when the opening graph reaches a transposition.
    const position = (chess: Chess) => chess.fen().split(' ').slice(0, 4).join(' ');
    if (position(before) !== position(after)) return [];
    const rookMove =
      applied.isKingsideCastle() || applied.isQueensideCastle()
        ? getCastlingRookMove(move.from, move.to)
        : null;
    return rookMove ? [move, rookMove] : [move];
  } catch {
    return [];
  }
}

export function getCastlingRookMove(from: Square, to: Square): AnimatedBoardMove | null {
  if (from === 'e1' && to === 'g1') return { from: 'h1', to: 'f1' };
  if (from === 'e1' && to === 'c1') return { from: 'a1', to: 'd1' };
  if (from === 'e8' && to === 'g8') return { from: 'h8', to: 'f8' };
  if (from === 'e8' && to === 'c8') return { from: 'a8', to: 'd8' };
  return null;
}
