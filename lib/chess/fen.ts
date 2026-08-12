import { Chess, validateFen } from 'chess.js';

export class FenValidationError extends Error {
  readonly code = 'INVALID_FEN';

  constructor(message: string) {
    super(`INVALID_FEN: ${message}`);
    this.name = 'FenValidationError';
  }
}

/**
 * Produces the four-field identity used exclusively for opening-graph merging.
 * Chess.js validates all six FEN fields and emits an en-passant target only when
 * the side to move can legally capture it.
 */
export function normalizePositionKey(fen: string): string {
  if (fen.trim().split(/\s+/).length !== 6) {
    throw new FenValidationError('expected exactly six FEN fields');
  }

  const validation = validateFen(fen);
  if (!validation.ok) {
    throw new FenValidationError(validation.error ?? 'invalid FEN');
  }

  try {
    const canonicalFen = new Chess(fen).fen();
    const fields = canonicalFen.split(' ');
    const key = fields.slice(0, 4).join(' ');
    if (fields.length !== 6 || key.split(' ').length !== 4) {
      throw new FenValidationError('could not canonicalize FEN');
    }
    return key;
  } catch (error) {
    if (error instanceof FenValidationError) throw error;
    throw new FenValidationError(error instanceof Error ? error.message : 'invalid FEN');
  }
}
