import { STORES, type GameRecord } from '@/lib/db/schema';
import { getMeta } from '@/lib/db/repositories';
import type { AnalysisStrength } from '@/features/workspace/types';
import type { GameAnalysisResult } from './analyzeGame';
import { computePgnDigest } from './reviewIdentity';
import { REVIEW_MOVE_QUALITIES } from '@/lib/engine/accuracy';

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
  const count = (number: number) => Number.isInteger(number) && number >= 0;
  const positive = (number: number) => Number.isFinite(number) && number > 0;
  const percent = (number: number) => Number.isFinite(number) && number >= 0 && number <= 100;
  const strings = (items: readonly string[]) =>
    Array.isArray(items) && items.every((item) => typeof item === 'string');
  const validScore = (score: GameAnalysisResult['annotations'][number]['before']['score']) =>
    !!score &&
    (score.kind === 'cp' || score.kind === 'mate') &&
    Number.isFinite(score.value) &&
    (score.bound === undefined || score.bound === 'lower' || score.bound === 'upper');
  const validPosition = (position: GameAnalysisResult['annotations'][number]['before']) =>
    !!position &&
    validScore(position.score) &&
    count(position.depth) &&
    strings(position.pv) &&
    Array.isArray(position.candidates) &&
    position.candidates.every(
      (candidate) =>
        !!candidate &&
        positive(candidate.multiPv) &&
        count(candidate.depth) &&
        validScore(candidate.score) &&
        strings(candidate.pv)
    ) &&
    typeof position.bestMove === 'string';
  const validSummary = (summary: GameAnalysisResult['summary']['white']) =>
    !!summary &&
    (summary.accuracyEstimate === null || percent(summary.accuracyEstimate)) &&
    count(summary.eligibleMoves) &&
    count(summary.excludedMoves) &&
    (summary.repertoireMoves === undefined || count(summary.repertoireMoves)) &&
    !!summary.breakdown &&
    REVIEW_MOVE_QUALITIES.every((quality) => count(summary.breakdown[quality]));
  const validSettings = (settings: GameAnalysisResult['annotations'][number]['settings']) =>
    !!settings &&
    ['engineBuild', 'networkHash', 'analysisVersion', 'normalizationVersion'].every(
      (key) => typeof settings[key as keyof typeof settings] === 'string'
    ) &&
    positive(settings.multiPv) &&
    positive(settings.threads) &&
    positive(settings.hashMb) &&
    !!settings.limit &&
    [settings.limit.depth, settings.limit.movetimeMs, settings.limit.nodes].some(
      (limit) => limit !== undefined && positive(limit)
    ) &&
    [settings.limit.depth, settings.limit.movetimeMs, settings.limit.nodes].every(
      (limit) => limit === undefined || positive(limit)
    );
  const validAccuracy = (accuracy: GameAnalysisResult['annotations'][number]['accuracy']) =>
    !!accuracy &&
    (accuracy.status === 'indeterminate'
      ? ['bound-score', 'non-finite-score', 'non-finite-probability'].includes(accuracy.reason)
      : accuracy.status === 'classified' &&
        REVIEW_MOVE_QUALITIES.includes(accuracy.quality) &&
        percent(accuracy.accuracyEstimate) &&
        Number.isFinite(accuracy.probabilityLoss) &&
        accuracy.probabilityLoss >= 0 &&
        accuracy.probabilityLoss <= 1 &&
        accuracy.heuristicVersion === 'analyzer-accuracy-v3' &&
        (accuracy.tags === undefined ||
          (Array.isArray(accuracy.tags) && accuracy.tags.every((tag) => tag === 'repertoire'))));
  return (
    !!value &&
    ['complete', 'partial', 'cancelled', 'failed'].includes(value.status) &&
    Array.isArray(value.annotations) &&
    !!value.summary &&
    validSummary(value.summary.white) &&
    validSummary(value.summary.black) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(
      (warning) =>
        !!warning && typeof warning.code === 'string' && typeof warning.message === 'string'
    ) &&
    (value.error === undefined || typeof value.error === 'string') &&
    Number.isInteger(value.analyzedPlies) &&
    value.analyzedPlies === value.annotations.length &&
    Number.isInteger(value.totalPlies) &&
    value.totalPlies >= value.analyzedPlies &&
    value.annotations.every(
      (annotation, index) =>
        !!annotation &&
        Number.isInteger(annotation.ply) &&
        annotation.ply > 0 &&
        annotation.ply <= value.totalPlies &&
        (index === 0 || annotation.ply > value.annotations[index - 1]!.ply) &&
        typeof annotation.san === 'string' &&
        typeof annotation.uci === 'string' &&
        (annotation.mover === 'white' || annotation.mover === 'black') &&
        validPosition(annotation.before) &&
        validPosition(annotation.after) &&
        validAccuracy(annotation.accuracy) &&
        validSettings(annotation.settings)
    )
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
