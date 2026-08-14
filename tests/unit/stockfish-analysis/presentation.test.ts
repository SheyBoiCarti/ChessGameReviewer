import { describe, expect, it } from 'vitest';

import {
  analysisPreset,
  convertPvToSan,
  qualityLabel,
  toGraphPoints,
} from '@/features/stockfish-analysis/presentation';

describe('Stockfish analysis presentation', () => {
  it('maps named strength presets to bounded documented limits', () => {
    expect(analysisPreset('quick')).toEqual({ limit: { depth: 10 }, multiPv: 1 });
    expect(analysisPreset('balanced')).toEqual({ limit: { depth: 14 }, multiPv: 2 });
    expect(analysisPreset('deep')).toEqual({ limit: { movetimeMs: 3000 }, multiPv: 3 });
  });

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
        quality: 'mate-conceded',
        probabilityLoss: 1,
        accuracyEstimate: 0,
        heuristicVersion: 'analyzer-accuracy-v1',
      })
    ).toBe('Mate Conceded');
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
