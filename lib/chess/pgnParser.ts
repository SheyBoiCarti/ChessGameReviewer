import { Chess } from 'chess.js';

import type { Diagnostic, NormalizedGameSummary } from '../api/contracts';
import { sanitizeMessage } from '../api/errors';
import { normalizePositionKey } from './fen';

export interface MovePly {
  ply: number;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  positionBefore: string;
  positionAfter: string;
}

export interface ParsedGame {
  id: string;
  usernameKey: string;
  userColor: NormalizedGameSummary['userColor'];
  result: NormalizedGameSummary['result'];
  endedAt: number;
  timeClass: NormalizedGameSummary['timeClass'];
  rated: boolean;
  userRating: number | null;
  opponentRating: number | null;
  accuracies?: NormalizedGameSummary['accuracies'];
  plies: readonly MovePly[];
  warnings: readonly Diagnostic[];
}

export type ParseResult =
  | { ok: true; game: ParsedGame }
  | { ok: false; gameId: string; errors: readonly Diagnostic[] };

export function parseGamePgn({ game }: { game: NormalizedGameSummary }): ParseResult {
  if (!game.pgn?.trim()) {
    return parseFailure(game.id, 'MISSING_PGN', 'The game does not contain PGN.');
  }

  try {
    const chess = new Chess();
    chess.loadPgn(game.pgn, { strict: true });
    const history = chess.history({ verbose: true });
    const plies: MovePly[] = history.map((move, index) => ({
      ply: index + 1,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      fenBefore: move.before,
      fenAfter: move.after,
      positionBefore: normalizePositionKey(move.before),
      positionAfter: normalizePositionKey(move.after),
    }));

    for (let index = 1; index < plies.length; index += 1) {
      if (plies[index]?.fenBefore !== plies[index - 1]?.fenAfter) {
        return parseFailure(
          game.id,
          'PGN_DISCONTINUITY',
          'The PGN move sequence is not continuous.'
        );
      }
    }

    return {
      ok: true,
      game: {
        id: game.id,
        usernameKey: game.usernameKey,
        userColor: game.userColor,
        result: game.result,
        endedAt: game.endedAt,
        timeClass: game.timeClass,
        rated: game.rated,
        userRating: game.userRating,
        opponentRating: game.opponentRating,
        ...(game.accuracies ? { accuracies: game.accuracies } : {}),
        plies,
        warnings: [],
      },
    };
  } catch (error) {
    const sanitized = error instanceof Error ? sanitizeMessage(error.message) : '';
    return parseFailure(
      game.id,
      'ILLEGAL_PGN',
      sanitized ? `The PGN could not be replayed: ${sanitized}` : 'The PGN could not be replayed.'
    );
  }
}

function parseFailure(gameId: string, code: string, message: string): ParseResult {
  return {
    ok: false,
    gameId,
    errors: [{ code, message, severity: 'error', gameId }],
  };
}
