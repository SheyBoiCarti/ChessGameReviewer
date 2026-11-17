import { Chess } from 'chess.js';

const PIECES: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

/** Only facts established by replaying this exact move, never inferred motives. */
export function explainMove(fenBefore: string, uci: string): string | null {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!match?.[1] || !match[2]) return null;
  try {
    const chess = new Chess(fenBefore);
    const move = chess.move({
      from: match[1],
      to: match[2],
      ...(match[3] ? { promotion: match[3] } : {}),
    });
    const facts: string[] = [];
    if (move.captured)
      facts.push(`captures a ${PIECES[move.captured]}${move.isEnPassant() ? ' en passant' : ''}`);
    if (move.promotion) facts.push(`promotes to a ${PIECES[move.promotion]}`);
    if (chess.isCheckmate()) facts.push('delivers checkmate');
    else if (chess.isCheck()) facts.push('gives check');
    return facts.length ? `This move ${facts.join(' and ')}.` : null;
  } catch {
    return null;
  }
}
