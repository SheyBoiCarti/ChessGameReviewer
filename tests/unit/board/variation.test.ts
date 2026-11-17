import { describe, expect, it } from 'vitest';

import {
  appendVariationMove,
  createVariationFromUciSequence,
  moveVariationCursor,
  startVariation,
  variationFen,
} from '@/features/board/variation';
import type { AppliedBoardMove } from '@/features/board/moves';

describe('analysis variation state machine', () => {
  const baseFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const fenAfterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const fenAfterE5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  const fenAfterNf3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

  const moveE4: AppliedBoardMove = {
    from: 'e2',
    to: 'e4',
    uci: 'e2e4',
    san: 'e4',
    fenBefore: baseFen,
    fenAfter: fenAfterE4,
  };

  const moveE5: AppliedBoardMove = {
    from: 'e7',
    to: 'e5',
    uci: 'e7e5',
    san: 'e5',
    fenBefore: fenAfterE4,
    fenAfter: fenAfterE5,
  };

  const moveNf3: AppliedBoardMove = {
    from: 'g1',
    to: 'f3',
    uci: 'g1f3',
    san: 'Nf3',
    fenBefore: fenAfterE5,
    fenAfter: fenAfterNf3,
  };

  it('starts a variation from base FEN and sets cursor to 1', () => {
    const state = startVariation(0, baseFen, moveE4);
    expect(state.basePly).toBe(0);
    expect(state.baseFen).toBe(baseFen);
    expect(state.moves).toEqual([moveE4]);
    expect(state.cursor).toBe(1);
    expect(variationFen(state)).toBe(fenAfterE4);
  });

  it('throws DISCONTINUOUS_VARIATION_MOVE if start move fenBefore does not match base FEN', () => {
    expect(() => startVariation(0, baseFen, moveE5)).toThrowError(/DISCONTINUOUS_VARIATION_MOVE/);
  });

  it('appends sequential moves and updates cursor', () => {
    let state = startVariation(0, baseFen, moveE4);
    state = appendVariationMove(state, moveE5);
    expect(state.moves).toHaveLength(2);
    expect(state.cursor).toBe(2);
    expect(variationFen(state)).toBe(fenAfterE5);

    state = appendVariationMove(state, moveNf3);
    expect(state.moves).toHaveLength(3);
    expect(state.cursor).toBe(3);
    expect(variationFen(state)).toBe(fenAfterNf3);
  });

  it('truncates branch tail when appending at an earlier cursor', () => {
    let state = startVariation(0, baseFen, moveE4);
    state = appendVariationMove(state, moveE5);
    // Step back to cursor 1 (after e4)
    state = moveVariationCursor(state, 1);
    expect(variationFen(state)).toBe(fenAfterE4);

    // Play c5 instead of e5
    const fenAfterC5 = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const moveC5: AppliedBoardMove = {
      from: 'c7',
      to: 'c5',
      uci: 'c7c5',
      san: 'c5',
      fenBefore: fenAfterE4,
      fenAfter: fenAfterC5,
    };

    state = appendVariationMove(state, moveC5);
    expect(state.moves).toHaveLength(2);
    expect(state.moves[1]?.san).toBe('c5');
    expect(state.cursor).toBe(2);
    expect(variationFen(state)).toBe(fenAfterC5);
  });

  it('navigates cursor and clamps to valid boundaries', () => {
    let state = startVariation(0, baseFen, moveE4);
    state = appendVariationMove(state, moveE5);

    state = moveVariationCursor(state, 0);
    expect(state.cursor).toBe(0);
    expect(variationFen(state)).toBe(baseFen);

    state = moveVariationCursor(state, -5);
    expect(state.cursor).toBe(0);

    state = moveVariationCursor(state, 10);
    expect(state.cursor).toBe(2);
    expect(variationFen(state)).toBe(fenAfterE5);
  });
});

it('previews the first legal PV move and truncates at illegal input', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const v = createVariationFromUciSequence(14, fen, ['e2e4', 'e7e5', 'bad']);
  expect(v!.cursor).toBe(1);
  expect(v!.moves).toHaveLength(2);
  expect(variationFen(v!)).toContain(' b ');
  expect(variationFen(moveVariationCursor(v!, 2))).toContain(' w ');
  expect(createVariationFromUciSequence(14, fen, ['e2e5'])).toBeNull();
  expect(createVariationFromUciSequence(14, fen, ['e2e4extra'])).toBeNull();
});

it('starts 14…e4’s Bf5 alternative before e4 and a reply after e4', () => {
  const before = '2b4k/8/8/4p3/8/8/8/K7 b - - 0 14';
  const played = createVariationFromUciSequence(28, before, ['e5e4'])!;
  const after = variationFen(played);
  const alternative = createVariationFromUciSequence(28, before, ['c8f5', 'a1b1'])!;
  expect(alternative.moves[0]!.san).toBe('Bf5');
  expect(alternative.baseFen).toBe(before);
  expect(createVariationFromUciSequence(28, after, ['c8f5'])).toBeNull();
  const reply = createVariationFromUciSequence(28, after, ['a1b1'])!;
  expect(reply.baseFen).toBe(after);
  expect(reply.moves[0]!.san).toBe('Kb1');
});

it('replays the recorded 49-ply game without changing its PGN or selected original position', async () => {
  const observed = (await import('../../fixtures/recordedPublicGame.json')).default;
  const { parseGamePgn } = await import('@/lib/chess/pgnParser');
  const { makeGameRecord } = await import('../../helpers/phase1Fixtures');
  const parsed = parseGamePgn({
    game: { ...makeGameRecord({ pgn: observed.pgn }), usernameKey: 'hikaru' },
  });
  if (!parsed.ok) throw new Error('Recorded public game must replay');
  expect(parsed.game.plies).toHaveLength(49);
  const originalPgn = observed.pgn;
  const selected = parsed.game.plies[27]!;
  expect(selected.san).toBe('e4');
  const alternative = createVariationFromUciSequence(selected.ply, selected.fenBefore, ['c8f5'])!;
  expect(alternative.moves[0]!.san).toBe('Bf5');
  expect(alternative.cursor).toBe(1);
  expect(createVariationFromUciSequence(selected.ply, selected.fenAfter, ['c8f5'])).toBeNull();
  const reply = createVariationFromUciSequence(selected.ply, selected.fenAfter, ['d5f4'])!;
  expect(reply.moves[0]!.san).toBe('Nxf4');
  expect(reply.moves[0]!.fenBefore).toBe(selected.fenAfter);
  expect(parsed.game.plies[27]).toBe(selected);
  expect(observed.pgn).toBe(originalPgn);
});
