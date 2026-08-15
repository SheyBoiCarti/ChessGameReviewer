import { describe, expect, it } from 'vitest';

import {
  ACCURACY_ESTIMATE_NAME,
  ACCURACY_HEURISTIC_VERSION,
  REVIEW_MOVE_QUALITIES,
  classifyMoveAccuracy,
} from '@/lib/engine/accuracy';

describe('Analyzer accuracy estimate v2', () => {
  const white = (value: number) => ({ kind: 'cp' as const, value });

  it('is explicitly versioned and named as a project estimate', () => {
    expect(ACCURACY_HEURISTIC_VERSION).toBe('analyzer-accuracy-v2');
    expect(ACCURACY_ESTIMATE_NAME).toBe('Analyzer accuracy estimate');
  });

  it('exports the complete list of 11 review move qualities', () => {
    expect(REVIEW_MOVE_QUALITIES).toEqual([
      'brilliant',
      'great',
      'best',
      'excellent',
      'good',
      'book',
      'inaccuracy',
      'mistake',
      'blunder',
      'miss',
      'forced',
    ]);
  });

  it.each([
    [0, 'best'],
    [0.02, 'excellent'],
    [0.020001, 'good'],
    [0.05, 'good'],
    [0.050001, 'inaccuracy'],
    [0.1, 'inaccuracy'],
    [0.100001, 'mistake'],
    [0.2, 'mistake'],
    [0.200001, 'blunder'],
  ] as const)(
    'uses exhaustive non-overlapping probability-loss thresholds at %s in probability comparisons',
    (loss, quality) => {
      expect(
        classifyMoveAccuracy({ beforeProbability: 1, afterProbability: 1 - loss })
      ).toMatchObject({
        status: 'classified',
        quality,
      });
    }
  );

  it('detects the offered bishop in Bxh7+ instead of comparing immediate material totals', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 350 },
        afterScore: { kind: 'cp', value: 380 },
        mover: 'white',
        fenBefore: 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 1',
        uci: 'd3h7',
        bestMoveUci: 'd3h7',
        isBook: false,
      })
    ).toMatchObject({ quality: 'brilliant' });
  });

  it('does not call an offered piece brilliant when it was not the engine best move', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 350 },
        afterScore: { kind: 'cp', value: 380 },
        mover: 'white',
        fenBefore: 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 1',
        uci: 'd3h7',
        bestMoveUci: 'c4d5',
        isBook: false,
      })
    ).not.toMatchObject({ quality: 'brilliant' });
  });

  it('does not call an offered piece brilliant when mover probability after the move is under 0.5', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: -400 },
        afterScore: { kind: 'cp', value: -300 },
        mover: 'white',
        fenBefore: 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 1',
        uci: 'd3h7',
        bestMoveUci: 'd3h7',
        isBook: false,
      })
    ).not.toMatchObject({ quality: 'brilliant' });
  });

  it('does not call winning material captures brilliant', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 300 },
        afterScore: { kind: 'cp', value: 500 },
        mover: 'white',
        fenBefore: '4r1k1/5ppp/8/8/8/8/8/3QK3 w - - 0 1',
        uci: 'd1e8',
        bestMoveUci: 'd1e8',
        isBook: false,
      })
    ).not.toMatchObject({ quality: 'brilliant' });
  });

  it('does not infer great without a second candidate', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 300 },
        afterScore: { kind: 'cp', value: 300 },
        mover: 'white',
        fenBefore: '8/8/4k3/8/8/4K3/4R3/8 w - - 0 1',
        uci: 'e2e1',
        bestMoveUci: 'e2e1',
        isBook: false,
      })
    ).toMatchObject({ quality: 'best' });
  });

  it('classifies great when best move probability is at least 0.15 higher than second best candidate', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 200 },
        afterScore: { kind: 'cp', value: 200 },
        secondBestScore: { kind: 'cp', value: 0 },
        mover: 'white',
        fenBefore: '8/8/4k3/8/8/4K3/4R3/8 w - - 0 1',
        uci: 'e2e1',
        bestMoveUci: 'e2e1',
        isBook: false,
      })
    ).toMatchObject({ quality: 'great' });
  });

  it('does not classify great when second best candidate is within 0.15 probability', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 100 },
        afterScore: { kind: 'cp', value: 100 },
        secondBestScore: { kind: 'cp', value: 90 },
        mover: 'white',
        fenBefore: '8/8/4k3/8/8/4K3/4R3/8 w - - 0 1',
        uci: 'e2e1',
        bestMoveUci: 'e2e1',
        isBook: false,
      })
    ).toMatchObject({ quality: 'best' });
  });

  it('classifies forced when position has exactly one legal move', () => {
    // Only legal move for White is a1b2 (capturing the rook on b2 while in check from h1)
    const fen = 'k7/8/8/8/8/8/1r6/K6r w - - 0 1';
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'mate', value: -1 },
        afterScore: { kind: 'mate', value: -1 },
        mover: 'white',
        fenBefore: fen,
        uci: 'a1b2',
        bestMoveUci: 'a1b2',
        isBook: false,
      })
    ).toMatchObject({ quality: 'forced' });
  });

  it('classifies book when isBook is true and loss is at most 0.02 without harmful mate', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 20 },
        afterScore: { kind: 'cp', value: 20 },
        mover: 'white',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        uci: 'e2e4',
        bestMoveUci: 'd2d4',
        isBook: true,
      })
    ).toMatchObject({ quality: 'book' });
  });

  it('does not classify book if probability loss exceeds 0.02', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 20 },
        afterScore: { kind: 'cp', value: -100 },
        mover: 'white',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        uci: 'g2g4',
        isBook: true,
      })
    ).not.toMatchObject({ quality: 'book' });
  });

  it('classifies a zero-loss non-best move as excellent when bestMoveUci is provided', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 50 },
        afterScore: { kind: 'cp', value: 50 },
        mover: 'white',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        uci: 'g1f3',
        bestMoveUci: 'e2e4',
        isBook: false,
      })
    ).toMatchObject({ quality: 'excellent' });
  });

  it('classifies miss when mover had >= 0.85 win probability and lost > 0.15', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 400 },
        afterScore: { kind: 'cp', value: 100 },
        mover: 'white',
        fenBefore: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
        uci: 'f3g1',
        bestMoveUci: 'd2d4',
        isBook: false,
      })
    ).toMatchObject({ quality: 'miss' });
  });

  it('treats forced mates as explicit transitions', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'mate', value: 3 },
        afterScore: { kind: 'mate', value: 1 },
        mover: 'white',
        fenBefore: '8/8/8/8/8/k7/8/K1Q5 w - - 0 1',
        uci: 'c1b2',
        bestMoveUci: 'c1b2',
        isBook: false,
      })
    ).toMatchObject({ mateTransition: 'retained' });

    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'mate', value: 3 },
        afterScore: white(0),
        mover: 'white',
        fenBefore: '8/8/8/8/8/k7/8/K1Q5 w - - 0 1',
        uci: 'c1b1',
        bestMoveUci: 'c1b2',
        isBook: false,
      })
    ).toMatchObject({ quality: 'miss', mateTransition: 'missed' });

    expect(
      classifyMoveAccuracy({
        beforeScore: white(80),
        afterScore: { kind: 'mate', value: -2 },
        mover: 'white',
        fenBefore: '8/8/8/8/8/k7/8/K1Q5 w - - 0 1',
        uci: 'c1b1',
        bestMoveUci: 'c1b2',
        isBook: false,
      })
    ).toMatchObject({ quality: 'blunder', mateTransition: 'conceded' });

    expect(
      classifyMoveAccuracy({
        beforeScore: white(0),
        afterScore: { kind: 'mate', value: 2 },
        mover: 'white',
        fenBefore: '8/8/8/8/8/k7/8/K1Q5 w - - 0 1',
        uci: 'c1b2',
        bestMoveUci: 'c1b2',
        isBook: false,
      })
    ).toMatchObject({ mateTransition: 'gained' });
  });

  it('correctly handles black perspective', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: white(-300),
        afterScore: white(-300),
        mover: 'black',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        uci: 'c7c5',
        bestMoveUci: 'c7c5',
        isBook: false,
      })
    ).toMatchObject({
      status: 'classified',
      quality: 'best',
    });
  });

  it('returns indeterminate for bound or non-finite scores', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { ...white(40), bound: 'lower' },
        afterScore: white(20),
        mover: 'white',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        uci: 'e2e4',
        isBook: false,
      })
    ).toEqual({ status: 'indeterminate', reason: 'bound-score' });

    expect(
      classifyMoveAccuracy({
        beforeScore: white(Number.NaN),
        afterScore: white(20),
        mover: 'white',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        uci: 'e2e4',
        isBook: false,
      })
    ).toEqual({ status: 'indeterminate', reason: 'non-finite-score' });
  });

  it('handles invalid FEN and illegal UCI without throwing', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: white(20),
        afterScore: white(20),
        mover: 'white',
        fenBefore: 'invalid-fen',
        uci: 'e2e4',
        isBook: false,
      })
    ).toMatchObject({ status: 'classified' });

    expect(
      classifyMoveAccuracy({
        beforeScore: white(20),
        afterScore: white(20),
        mover: 'white',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        uci: 'invalid-uci',
        isBook: false,
      })
    ).toMatchObject({ status: 'classified' });
  });

  it('handles promotion moves gracefully without misclassifying sacrifice', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: white(500),
        afterScore: white(500),
        mover: 'white',
        fenBefore: '7k/P7/8/8/8/8/8/K7 w - - 0 1',
        uci: 'a7a8q',
        bestMoveUci: 'a7a8q',
        isBook: false,
      })
    ).toMatchObject({ quality: 'best' });
  });
});
