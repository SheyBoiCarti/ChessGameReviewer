import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import scopeGames from '../../fixtures/openingScopeGames.json';

// Stable fixture identities are a contract for later scope and newest-first tasks.
describe('mixed-color opening scope fixture', () => {
  it('has explicit identities, selected-game ordering, and missing upstream accuracy', () => {
    expect(scopeGames).toHaveLength(20);
    expect(scopeGames.map((g) => g.uuid)).toEqual(
      Array.from({ length: 20 }, (_, i) => `audit-${i}`)
    );
    const white = scopeGames.filter((g) => g.white.username === 'audit-player');
    const black = scopeGames.filter((g) => g.black.username === 'audit-player');
    expect(white.map((g) => g.uuid)).toEqual(Array.from({ length: 12 }, (_, i) => `audit-${i}`));
    expect(black.map((g) => g.uuid)).toEqual(
      Array.from({ length: 8 }, (_, i) => `audit-${i + 12}`)
    );
    expect([...scopeGames].sort((a, b) => b.end_time - a.end_time)[0]?.uuid).toBe('audit-19');
    expect([...white].sort((a, b) => b.end_time - a.end_time)[0]?.uuid).toBe('audit-11');
    expect(scopeGames.every((g) => !('accuracies' in g))).toBe(true);
  });

  it('legally replays every game and gives the documented color/first-move counts', () => {
    const counts: Record<string, Record<string, number>> = { white: {}, black: {} };
    for (const game of scopeGames) {
      const chess = new Chess();
      chess.loadPgn(game.pgn, { strict: true });
      expect(chess.history()).toHaveLength(6);
      const color = game.white.username === 'audit-player' ? 'white' : 'black';
      const move = chess.history()[0]!;
      counts[color]![move] = (counts[color]![move] ?? 0) + 1;
    }
    expect(counts).toEqual({ white: { e4: 7, d4: 3, c4: 2 }, black: { d4: 4, e4: 2, Nf3: 2 } });
  });
});
