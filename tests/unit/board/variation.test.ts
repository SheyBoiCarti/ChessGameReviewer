import { describe, expect, it } from 'vitest';

import {
  appendVariationMove,
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
