import { parseGamePgn, type ParsedGame } from '@/lib/chess/pgnParser';
import type { GameRecord } from '@/lib/db/schema';

export function parseSelectedGame(record: GameRecord | null): ParsedGame | null {
  if (!record) return null;
  const result = parseGamePgn({
    game: {
      id: record.id,
      url: record.url,
      ...(record.uuid ? { uuid: record.uuid } : {}),
      usernameKey: record.username,
      userColor: record.userColor,
      result: record.result,
      endedAt: record.endedAt,
      timeClass: record.timeClass,
      ...(record.timeControl ? { timeControl: record.timeControl } : {}),
      rated: record.rated,
      userRating: record.userRating,
      opponentRating: record.opponentRating,
      whitePlayer: record.whitePlayer,
      blackPlayer: record.blackPlayer,
      ...(record.accuracies ? { accuracies: record.accuracies } : {}),
      pgn: record.pgn,
      rules: record.rules,
    },
  });
  return result.ok ? result.game : null;
}
