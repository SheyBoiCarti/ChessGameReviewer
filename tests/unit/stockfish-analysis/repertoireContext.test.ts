import { describe, expect, it } from 'vitest';

import {
  summarizeAnnotations,
  type GameAnalysisResult,
} from '@/features/stockfish-analysis/analyzeGame';
import { repertoireMoveKey } from '@/features/stockfish-analysis/bookMoves';
import { applyRepertoireContext } from '@/features/stockfish-analysis/repertoireContext';
import { parseGamePgn } from '@/lib/chess/pgnParser';
import { createLongGameAnalysisResult } from '../../fixtures/longAnalysisFixture';
import { makeGameRecord } from '../../helpers/phase1Fixtures';

function fixture() {
  const parsed = parseGamePgn({ game: { ...makeGameRecord(), usernameKey: 'janedoe' } });
  if (!parsed.ok) throw new Error('Fixture must be legal');
  const base = createLongGameAnalysisResult(2);
  const annotations = base.annotations.map((annotation, index) => ({
    ...annotation,
    san: parsed.game.plies[index]!.san,
    uci: parsed.game.plies[index]!.uci,
  }));
  const result: GameAnalysisResult = {
    ...base,
    annotations,
    summary: summarizeAnnotations(annotations),
  };
  const keys = new Set(
    parsed.game.plies.map((ply) => repertoireMoveKey(ply.positionBefore, ply.uci))
  );
  return { game: parsed.game, result, keys };
}

describe('current unscoped repertoire context', () => {
  it('adds tags and counts to saved results without changing scores or base grades', () => {
    const { game, result, keys } = fixture();
    const presented = applyRepertoireContext(result, game, keys);

    expect(presented.summary.white.repertoireMoves).toBe(1);
    expect(presented.summary.black.repertoireMoves).toBe(1);
    for (const [index, annotation] of presented.annotations.entries()) {
      expect(annotation.before).toBe(result.annotations[index]!.before);
      expect(annotation.after).toBe(result.annotations[index]!.after);
      expect(annotation.settings).toBe(result.annotations[index]!.settings);
      expect(annotation.accuracy).toEqual({
        ...result.annotations[index]!.accuracy,
        tags: ['repertoire'],
      });
    }
    expect(result.annotations[0]!.accuracy).not.toHaveProperty('tags');
    expect(applyRepertoireContext(presented, game, keys)).toBe(presented);
  });

  it('removes legacy tags when context disappears and distinguishes unknown from zero', () => {
    const { game, result, keys } = fixture();
    const tagged = applyRepertoireContext(result, game, keys);
    const unavailable = applyRepertoireContext(tagged, game, null);
    expect(unavailable.annotations.map((annotation) => annotation.accuracy)).toEqual(
      result.annotations.map((annotation) => annotation.accuracy)
    );
    expect(unavailable.summary.white).not.toHaveProperty('repertoireMoves');
    expect(unavailable.summary.black).not.toHaveProperty('repertoireMoves');
    expect(applyRepertoireContext(unavailable, game, null)).toBe(unavailable);

    const knownEmpty = applyRepertoireContext(tagged, game, new Set());
    expect(knownEmpty.summary.white.repertoireMoves).toBe(0);
    expect(knownEmpty.summary.black.repertoireMoves).toBe(0);
    expect(tagged.annotations[0]!.accuracy).toHaveProperty('tags', ['repertoire']);
  });

  it('matches position and actual UCI, rather than treating all moves at a ply as repertoire', () => {
    const { game, result } = fixture();
    const first = game.plies[0]!;
    const keys = new Set([
      repertoireMoveKey(first.positionBefore, 'd2d4'),
      repertoireMoveKey(game.plies[1]!.positionBefore, first.uci),
    ]);
    const presented = applyRepertoireContext(result, game, keys);
    expect(presented.summary.white.repertoireMoves).toBe(0);
    expect(presented.summary.black.repertoireMoves).toBe(0);
    expect(presented.annotations).toEqual(result.annotations);
  });

  it('does not tag indeterminate annotations or annotations from a different move', () => {
    const { game, result, keys } = fixture();
    const annotations = [
      {
        ...result.annotations[0]!,
        accuracy: { status: 'indeterminate' as const, reason: 'bound-score' as const },
      },
      { ...result.annotations[1]!, uci: 'c7c5' },
    ];
    const changed = { ...result, annotations, summary: summarizeAnnotations(annotations) };
    const presented = applyRepertoireContext(changed, game, keys);
    expect(presented).toBe(changed);
    expect(presented.summary.white.repertoireMoves).toBe(0);
    expect(presented.summary.black.repertoireMoves).toBe(0);
  });
});
