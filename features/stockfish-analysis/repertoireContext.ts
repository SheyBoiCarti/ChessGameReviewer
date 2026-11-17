import type { ParsedGame } from '@/lib/chess/pgnParser';

import { summarizeAnnotations, type GameAnalysisResult } from './analyzeGame';
import { repertoireMoveKey } from './bookMoves';

/**
 * Repertoire is current import context, not a property of a saved engine score.
 * Pass only the unscoped dataset's keys; null means that context is unavailable.
 * Updating it never reclassifies a move or requires another engine evaluation.
 */
export function applyRepertoireContext(
  result: GameAnalysisResult,
  game: ParsedGame,
  moveKeys: ReadonlySet<string> | null
): GameAnalysisResult {
  const annotations = result.annotations.map((annotation) => {
    if (annotation.accuracy.status !== 'classified') return annotation;
    const ply = game.plies[annotation.ply - 1];
    const inRepertoire = Boolean(
      moveKeys &&
        ply?.ply === annotation.ply &&
        ply.uci === annotation.uci &&
        moveKeys.has(repertoireMoveKey(ply.positionBefore, ply.uci))
    );
    const hasTag = annotation.accuracy.tags?.includes('repertoire') ?? false;
    if (inRepertoire === hasTag) return annotation;

    const { tags: _tags, ...accuracy } = annotation.accuracy;
    return {
      ...annotation,
      accuracy: inRepertoire ? { ...accuracy, tags: ['repertoire'] as const } : accuracy,
    };
  });
  const summary = summarizeAnnotations(annotations);
  if (moveKeys === null) {
    // Undefined distinguishes unavailable evidence from a known count of zero.
    delete summary.white.repertoireMoves;
    delete summary.black.repertoireMoves;
  }
  if (
    annotations.every((annotation, index) => annotation === result.annotations[index]) &&
    JSON.stringify(summary) === JSON.stringify(result.summary)
  ) {
    return result;
  }
  return { ...result, annotations, summary };
}
