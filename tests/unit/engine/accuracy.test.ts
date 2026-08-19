import { describe, expect, it } from 'vitest';

import {
  ACCURACY_ESTIMATE_NAME,
  ACCURACY_HEURISTIC_VERSION,
  REVIEW_MOVE_QUALITIES,
  classifyMoveAccuracy,
} from '@/lib/engine/accuracy';

describe('Analyzer accuracy estimate v3', () => {
  const white = (value: number) => ({ kind: 'cp' as const, value });

  it('is explicitly versioned and named as a project estimate', () => {
    expect(ACCURACY_HEURISTIC_VERSION).toBe('analyzer-accuracy-v3');
    expect(ACCURACY_ESTIMATE_NAME).toBe('Analyzer accuracy estimate');
  });

  it('exports the complete list of 10 review move qualities', () => {
    expect(REVIEW_MOVE_QUALITIES).toEqual([
      'brilliant',
      'great',
      'best',
      'excellent',
      'good',
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

  it('detects the sound bishop sacrifice in Bxh7+ when proven by PV reply', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 200 },
        afterScore: { kind: 'cp', value: 380 },
        mover: 'white',
        fenBefore: 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 1',
        uci: 'd3h7',
        bestMoveUci: 'd3h7',
        pv: ['d3h7', 'g8h7', 'f3g5'],
        isBook: false,
      })
    ).toMatchObject({ quality: 'brilliant' });
  });

  it('does not classify brilliant when PV is absent or too short', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 200 },
        afterScore: { kind: 'cp', value: 380 },
        mover: 'white',
        fenBefore: 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 1',
        uci: 'd3h7',
        bestMoveUci: 'd3h7',
        pv: ['d3h7'],
        isBook: false,
      })
    ).not.toMatchObject({ quality: 'brilliant' });
  });

  it('does not classify 8.Nbxd2 from the investigated game as brilliant', () => {
    // 7...Bxd2+ 8.Nbxd2 in game 173037119764
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 45 },
        afterScore: { kind: 'cp', value: 45 },
        mover: 'white',
        fenBefore: 'r1bqk2r/pppp1ppp/2n2n2/8/2BPP3/5N2/PP1b1PPP/RN1QK2R w KQkq - 0 8',
        uci: 'b1d2',
        bestMoveUci: 'b1d2',
        pv: ['b1d2', 'd7d5', 'e4d5'],
        isBook: false,
      })
    ).not.toMatchObject({ quality: 'brilliant' });
  });

  it('does not call an offered piece brilliant when the position was already trivially won', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 900 }, // beforeProb > 0.99
        afterScore: { kind: 'cp', value: 950 },
        mover: 'white',
        fenBefore: 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 1',
        uci: 'd3h7',
        bestMoveUci: 'd3h7',
        pv: ['d3h7', 'g8h7'],
        isBook: false,
      })
    ).not.toMatchObject({ quality: 'brilliant' });
  });

  it('does not call an offered piece brilliant when it was not the engine best move', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 200 },
        afterScore: { kind: 'cp', value: 380 },
        mover: 'white',
        fenBefore: 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 1',
        uci: 'd3h7',
        bestMoveUci: 'c4d5',
        pv: ['c4d5', 'e6d5'],
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
        pv: ['d3h7', 'g8h7'],
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
        pv: ['d1e8', 'g8f8'],
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

  it('attaches repertoire tag when isRepertoire or isBook is true while preserving engine quality', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 20 },
        afterScore: { kind: 'cp', value: 20 },
        mover: 'white',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        uci: 'e2e4',
        bestMoveUci: 'd2d4',
        isRepertoire: true,
      })
    ).toMatchObject({ quality: 'excellent', tags: ['repertoire'] });

    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 20 },
        afterScore: { kind: 'cp', value: -100 },
        mover: 'white',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        uci: 'g2g4',
        bestMoveUci: 'e2e4',
        isBook: true,
      })
    ).toMatchObject({ quality: 'mistake', tags: ['repertoire'] });
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

  it('stabilizes exact best move classification even with search noise loss', () => {
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 50 },
        afterScore: { kind: 'cp', value: 40 }, // small loss ~0.014
        mover: 'white',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        uci: 'e2e4',
        bestMoveUci: 'e2e4',
        isBook: false,
      })
    ).toMatchObject({ quality: 'best' });

    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'cp', value: 50 },
        afterScore: { kind: 'cp', value: 40 }, // small loss ~0.014
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

    const alreadyLost = classifyMoveAccuracy({
      beforeScore: { kind: 'mate', value: -3 },
      afterScore: { kind: 'mate', value: -2 },
      mover: 'white',
      fenBefore: '8/8/8/8/8/k7/8/K1Q5 w - - 0 1',
      uci: 'c1b1',
      bestMoveUci: 'c1b1',
      isBook: false,
    });
    expect(alreadyLost).toMatchObject({ quality: 'best' });
    expect(
      alreadyLost.status === 'classified' ? alreadyLost.mateTransition : undefined
    ).toBeUndefined();

    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'mate', value: 2 },
        afterScore: { kind: 'mate', value: -2 },
        mover: 'white',
        fenBefore: '8/8/8/8/8/k7/8/K1Q5 w - - 0 1',
        uci: 'c1a3',
        bestMoveUci: 'c1b2',
        isBook: false,
      })
    ).toMatchObject({ quality: 'blunder', mateTransition: 'conceded' });

    // Black perspective mate-to-mate reversal (Black had mate in 2, conceded White mate in 1)
    expect(
      classifyMoveAccuracy({
        beforeScore: { kind: 'mate', value: -2 },
        afterScore: { kind: 'mate', value: 1 },
        mover: 'black',
        fenBefore: '8/8/8/8/8/K7/8/k1q5 b - - 0 1',
        uci: 'c1a3',
        bestMoveUci: 'c1b2',
        isBook: false,
      })
    ).toMatchObject({ quality: 'blunder', mateTransition: 'conceded' });
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
