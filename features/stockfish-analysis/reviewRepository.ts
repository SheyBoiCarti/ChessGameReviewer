import { STORES, type GameRecord } from '@/lib/db/schema';
import { getMeta } from '@/lib/db/repositories';
import type { AnalysisStrength } from '@/features/workspace/types';
import type { GameAnalysisResult } from './analyzeGame';
import { computePgnDigest } from './reviewIdentity';

// Change this when the engine, accuracy heuristic or review format changes.
const LEGACY_VERSION = 'stockfish18-9067e33176e-accuracy-v3-review-v1';
const REVIEW_VERSION = 'stockfish18-9067e33176e-accuracy-v3-review-v2';

function reviewKey(game: GameRecord, strength: AnalysisStrength): string {
  return `review:${game.username}:${game.id}:${strength}`;
}

interface SavedReview {
  version: string;
  pgn: string;
  pgnDigest: string;
  strength: AnalysisStrength;
  contextRevision: null;
  lastComplete: GameAnalysisResult | null;
  latestAttempt: GameAnalysisResult;
}

function validResult(value: GameAnalysisResult | null | undefined): value is GameAnalysisResult {
  return (
    !!value &&
    ['complete', 'partial', 'cancelled', 'failed'].includes(value.status) &&
    Array.isArray(value.annotations) &&
    !!value.summary &&
    !!value.summary.white &&
    !!value.summary.black &&
    Number.isInteger(value.analyzedPlies) &&
    value.analyzedPlies === value.annotations.length &&
    Number.isInteger(value.totalPlies) &&
    value.totalPlies >= value.analyzedPlies &&
    value.annotations.every((annotation) => Number.isInteger(annotation.ply) && annotation.ply > 0)
  );
}

function convert(
  value: unknown,
  game: GameRecord,
  strength: AnalysisStrength,
  pgnDigest: string
): SavedReview | null {
  if (!value || typeof value !== 'object') return null;
  const saved = value as Partial<SavedReview> & { result?: GameAnalysisResult };
  if (saved.pgn !== game.pgn) return null;
  if (saved.version === LEGACY_VERSION && validResult(saved.result)) {
    return {
      version: REVIEW_VERSION,
      pgn: game.pgn,
      pgnDigest,
      strength,
      contextRevision: null,
      lastComplete: saved.result.status === 'complete' ? saved.result : null,
      latestAttempt: saved.result,
    };
  }
  if (
    saved.version !== REVIEW_VERSION ||
    saved.pgnDigest !== pgnDigest ||
    saved.strength !== strength ||
    saved.contextRevision !== null ||
    !validResult(saved.latestAttempt) ||
    (saved.lastComplete != null &&
      (!validResult(saved.lastComplete) || saved.lastComplete.status !== 'complete'))
  )
    return null;
  return saved as SavedReview;
}

export async function saveReview(
  db: IDBDatabase,
  game: GameRecord,
  strength: AnalysisStrength,
  result: GameAnalysisResult,
  isCurrent: () => boolean = () => true
): Promise<void> {
  const name = reviewKey(game, strength);
  const pgnDigest = await computePgnDigest(game.pgn);
  if (!isCurrent()) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.META, 'readwrite');
    const store = tx.objectStore(STORES.META);
    const request = store.get(name);
    request.onsuccess = () => {
      if (!isCurrent()) return;
      const previous = convert(request.result?.value, game, strength, pgnDigest);
      const value: SavedReview = {
        version: REVIEW_VERSION,
        pgn: game.pgn,
        pgnDigest,
        strength,
        contextRevision: null,
        lastComplete: result.status === 'complete' ? result : (previous?.lastComplete ?? null),
        latestAttempt: result,
      };
      store.put({ name, value, updatedAt: Date.now() });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function restoreSelected(
  db: IDBDatabase,
  game: GameRecord,
  strength: AnalysisStrength
): Promise<GameAnalysisResult | null> {
  const pgnDigest = await computePgnDigest(game.pgn);
  const record = await getMeta(db, reviewKey(game, strength));
  const saved = convert(record?.value, game, strength, pgnDigest);
  return saved?.lastComplete ?? saved?.latestAttempt ?? null;
}

export async function restoreReviews(
  db: IDBDatabase,
  games: readonly GameRecord[],
  strength: AnalysisStrength
): Promise<Record<string, GameAnalysisResult>> {
  const entries = await Promise.all(
    games.map(async (game) => {
      const result = await restoreSelected(db, game, strength);
      return result ? ([game.id, result] as const) : null;
    })
  );
  return Object.fromEntries(entries.filter((entry) => entry !== null));
}
