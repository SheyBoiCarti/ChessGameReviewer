import type { GameRecord } from '@/lib/db/schema';
import { getMeta, setMeta } from '@/lib/db/repositories';
import type { AnalysisStrength } from '@/features/workspace/types';
import type { GameAnalysisResult } from './analyzeGame';

// Change this when the engine, accuracy heuristic or review format changes.
const REVIEW_VERSION = 'stockfish18-9067e33176e-accuracy-v3-review-v1';

function reviewKey(game: GameRecord, strength: AnalysisStrength): string {
  return `review:${game.username}:${game.id}:${strength}`;
}

export async function saveReview(
  db: IDBDatabase,
  game: GameRecord,
  strength: AnalysisStrength,
  result: GameAnalysisResult
): Promise<void> {
  await setMeta(db, reviewKey(game, strength), { version: REVIEW_VERSION, pgn: game.pgn, result });
}

export async function restoreReviews(
  db: IDBDatabase,
  games: readonly GameRecord[],
  strength: AnalysisStrength
): Promise<Record<string, GameAnalysisResult>> {
  const entries = await Promise.all(
    games.map(async (game) => {
      const record = await getMeta(db, reviewKey(game, strength));
      const saved = record?.value as
        | { version?: string; pgn?: string; result?: GameAnalysisResult }
        | undefined;
      if (
        saved?.version !== REVIEW_VERSION ||
        saved.pgn !== game.pgn ||
        !saved.result ||
        !['complete', 'partial', 'cancelled', 'failed'].includes(saved.result.status) ||
        !Array.isArray(saved.result.annotations) ||
        !saved.result.summary
      )
        return null;
      return [game.id, saved.result] as const;
    })
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}
