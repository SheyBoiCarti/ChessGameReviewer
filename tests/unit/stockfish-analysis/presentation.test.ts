import { describe, expect, it } from 'vitest';

import {
  analysisPreset,
  convertPvToSan,
  moveQualityDetails,
  qualityLabel,
  selectMovePresentation,
  toGraphPoints,
} from '@/features/stockfish-analysis/presentation';
import { createLongGameAnalysisResult } from '../../fixtures/longAnalysisFixture';
import { parseGamePgn } from '@/lib/chess/pgnParser';
import { makeGameRecord } from '../../helpers/phase1Fixtures';
import { REVIEW_MOVE_QUALITIES, type MoveQuality } from '@/lib/engine/accuracy';

describe('Stockfish analysis presentation', () => {
  it('keeps pending selection tied to its original position', () => {
    const parsed = parseGamePgn({ game: { ...makeGameRecord(), usernameKey: 'janedoe' } });
    if (!parsed.ok) throw new Error('Fixture must be legal');
    expect(selectMovePresentation(parsed.game, null, 1)).toMatchObject({
      state: 'pending',
      ply: 1,
      san: parsed.game.plies[0]!.san,
      fenBefore: parsed.game.plies[0]!.fenBefore,
      fenAfter: parsed.game.plies[0]!.fenAfter,
    });
  });
  it('uses original positions and White scores for either mover, including mate and indeterminate quality', () => {
    const parsed = parseGamePgn({ game: { ...makeGameRecord(), usernameKey: 'janedoe' } });
    if (!parsed.ok) throw new Error('Fixture must be legal');
    const result = createLongGameAnalysisResult(2);
    const first = {
      ...result.annotations[0]!,
      after: {
        ...result.annotations[0]!.after,
        score: { kind: 'mate' as const, value: -2 },
        pv: ['e7e5'],
      },
    };
    const second = {
      ...result.annotations[1]!,
      accuracy: { status: 'indeterminate' as const, reason: 'bound-score' as const },
      after: { ...result.annotations[1]!.after, pv: ['e7e5'] },
    };
    const review = { ...result, annotations: [first, second] };
    expect(selectMovePresentation(parsed.game, review, 0)).toMatchObject({
      state: 'starting',
      fenAfter: parsed.game.plies[0]!.fenBefore,
    });
    expect(selectMovePresentation(parsed.game, review, 1)).toMatchObject({
      state: 'ready',
      mover: 'white',
      afterScore: { kind: 'mate', value: -2 },
      reply: 'e7e5',
      arrowOrigin: 'after',
    });
    expect(selectMovePresentation(parsed.game, review, 2)).toMatchObject({
      state: 'ready',
      mover: 'black',
      quality: 'indeterminate',
      reply: null,
      fenAfter: parsed.game.plies[1]!.fenAfter,
    });
  });

  it('maps named strength presets to bounded documented limits', () => {
    expect(analysisPreset('quick')).toEqual({ limit: { depth: 10 }, multiPv: 1 });
    expect(analysisPreset('balanced')).toEqual({ limit: { depth: 14 }, multiPv: 2 });
    expect(analysisPreset('deep')).toEqual({ limit: { movetimeMs: 3000 }, multiPv: 3 });
  });

  it.each(REVIEW_MOVE_QUALITIES)(
    'provides non-empty metadata for move quality %s',
    (quality: MoveQuality) => {
      const details = moveQualityDetails(quality);
      expect(details.label).toBeTruthy();
      expect(details.symbol).toBeTruthy();
      expect(details.colorClass).toBeTruthy();
      expect(details.description).toBeTruthy();
    }
  );

  it('preserves unknown evaluations as discontinuities instead of zero', () => {
    expect(
      toGraphPoints([
        { ply: 1, evaluation: null },
        { ply: 2, evaluation: { kind: 'cp', value: 32 } },
        { ply: 3, evaluation: { kind: 'mate', value: -2 } },
      ])
    ).toEqual([
      { ply: 1, value: null, label: 'Evaluation unavailable' },
      { ply: 2, value: 0.32, label: 'White +0.32' },
      { ply: 3, value: -12, label: 'Black mate in 2' },
    ]);
  });

  it('never presents an indeterminate bound score as an exact move quality', () => {
    expect(qualityLabel({ status: 'indeterminate', reason: 'bound-score' })).toBe(
      'Indeterminate (bound score)'
    );
    expect(qualityLabel({ status: 'indeterminate', reason: 'non-finite-score' })).toBe(
      'Indeterminate (invalid score)'
    );
    expect(qualityLabel({ status: 'indeterminate', reason: 'non-finite-probability' })).toBe(
      'Indeterminate (probability unavailable)'
    );
    expect(
      qualityLabel({
        status: 'classified',
        quality: 'blunder',
        probabilityLoss: 1,
        accuracyEstimate: 0,
        heuristicVersion: 'analyzer-accuracy-v3',
      })
    ).toBe('Blunder');
  });

  it('converts a legal PV from its start FEN to SAN', () => {
    expect(
      convertPvToSan('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [
        'e2e4',
        'e7e5',
        'g1f3',
      ])
    ).toEqual({ moves: ['e4', 'e5', 'Nf3'], diagnostic: null });
  });

  it('falls back to safe UCI with a diagnostic when PV conversion fails', () => {
    expect(
      convertPvToSan('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [
        'e2e4',
        'not-a-move',
      ])
    ).toEqual({
      moves: ['e2e4', 'not-a-move'],
      diagnostic: 'The principal variation could not be fully converted to SAN; safe UCI is shown.',
    });
  });
});
