import { describe, expect, it } from 'vitest';

import { OpeningGraphBuilder } from '@/lib/chess/graph/openingGraph';
import { parseGamePgn } from '@/lib/chess/pgnParser';

function parse(id: string, pgn: string) {
  const result = parseGamePgn({
    game: {
      id,
      url: `https://www.chess.com/game/live/${id}`,
      usernameKey: 'alice',
      userColor: 'white',
      result: 'win',
      endedAt: 1,
      timeClass: 'blitz',
      rated: true,
      userRating: 1500,
      opponentRating: 1600,
      rules: 'chess',
      pgn,
    },
  });
  if (!result.ok) throw new Error(`Fixture ${id} did not parse.`);
  return result.game;
}

describe('OpeningGraphBuilder', () => {
  it('enforces the public opening horizon range', () => {
    expect(() => new OpeningGraphBuilder({ maxOpeningPlies: 1 })).toThrow(
      'INVALID_OPENING_HORIZON'
    );
    expect(() => new OpeningGraphBuilder({ maxOpeningPlies: 41 })).toThrow(
      'INVALID_OPENING_HORIZON'
    );
    expect(() => new OpeningGraphBuilder({ maxOpeningPlies: 2.5 })).toThrow(
      'INVALID_OPENING_HORIZON'
    );
  });

  it('does not aggregate an empty or discontinuous game', () => {
    const valid = parse('valid', '1. e4 e5 1-0');
    const corrupt: typeof valid = {
      ...valid,
      id: 'corrupt',
      plies: valid.plies.map((ply, index) => (index === 1 ? { ...ply, fenBefore: 'broken' } : ply)),
    };
    const graph = new OpeningGraphBuilder({ maxOpeningPlies: 2 }).build([
      { ...valid, plies: [] },
      corrupt,
    ]);
    expect(graph.includedGameCount).toBe(0);
    expect(graph.positions.size).toBe(1);
    expect(graph.root.aggregate.games).toBe(0);
  });

  it('rejects an inconsistent existing edge before mutating any aggregate', () => {
    const valid = parse('valid-edge', '1. e4 e5 1-0');
    const corrupt: typeof valid = {
      ...valid,
      id: 'corrupt-edge',
      plies: valid.plies.map((ply, index) => (index === 0 ? { ...ply, san: 'e4!' } : ply)),
    };
    const graph = new OpeningGraphBuilder({ maxOpeningPlies: 2 }).build([valid, corrupt]);

    expect(graph.includedGameCount).toBe(1);
    expect(graph.root.aggregate.games).toBe(1);
  });

  it('can exclude repeated position visits from a single game', () => {
    const game = parse('repeat', '1. Nf3 Nf6 2. Ng1 Ng8 1/2-1/2');
    const withRepeats = new OpeningGraphBuilder({
      maxOpeningPlies: 4,
      includeRepeatedPositions: true,
    }).build([game]);
    const withoutRepeats = new OpeningGraphBuilder({
      maxOpeningPlies: 4,
      includeRepeatedPositions: false,
    }).build([game]);
    expect(withRepeats.root.aggregate.games).toBe(2);
    expect(withoutRepeats.root.aggregate.games).toBe(1);
  });

  it('counts root and every visited position including the final target', () => {
    const graph = new OpeningGraphBuilder({ maxOpeningPlies: 4 }).build([
      parse('four-plies', '1. e4 e5 2. Nf3 Nc6 1-0'),
    ]);

    expect(graph.status).toBe('complete');
    expect(graph.root.aggregate.games).toBe(1);
    expect(
      [...graph.positions.values()].reduce((total, node) => total + node.aggregate.games, 0)
    ).toBe(5);
    expect(
      [...graph.positions.values()].some(
        (node) => node.aggregate.games === 1 && node.outgoing.size === 0
      )
    ).toBe(true);
  });

  it('merges legal transpositions while retaining distinct arrival paths', () => {
    const graph = new OpeningGraphBuilder({ maxOpeningPlies: 4 }).build([
      parse('order-a', '1. Nf3 d5 2. g3 Nf6 1-0'),
      parse('order-b', '1. g3 d5 2. Nf3 Nf6 1-0'),
    ]);
    const target = [...graph.positions.values()].find(
      (node) => node.aggregate.games === 2 && node.arrivalsByPath.size === 2
    );

    expect(target).toBeDefined();
    expect(target?.aggregate.games).toBe(2);
    expect(
      [...target!.arrivalsByPath.values()].reduce((sum, outcome) => sum + outcome.games, 0)
    ).toBe(2);
  });

  it('stops at a game boundary when a structural limit is crossed', () => {
    const graph = new OpeningGraphBuilder(
      { maxOpeningPlies: 2 },
      { maxPositions: 3, maxEdges: 2, maxPathNodes: 3 }
    ).build([parse('first', '1. e4 e5 1-0'), parse('second', '1. d4 d5 1-0')]);

    expect(graph.status).toBe('limited');
    expect(graph.includedGameCount).toBe(1);
    expect(graph.remainingGameCount).toBe(1);
    expect(graph.root.aggregate.games).toBe(1);
  });

  it('reports all unprocessed games as remaining after a limit', () => {
    const valid = parse('valid-after-invalid', '1. e4 e5 1-0');
    const corrupt: typeof valid = { ...valid, id: 'invalid', plies: [] };
    const graph = new OpeningGraphBuilder(
      { maxOpeningPlies: 2 },
      { maxPositions: 3, maxEdges: 2, maxPathNodes: 3 }
    ).build([corrupt, valid, parse('limited', '1. d4 d5 1-0')]);

    expect(graph.status).toBe('limited');
    expect(graph.includedGameCount).toBe(1);
    expect(graph.remainingGameCount).toBe(1);
  });
});
