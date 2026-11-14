import { describe, expect, it } from 'vitest';
import { DEFAULT_POSITION } from 'chess.js';

import {
  deserializeOpeningGraph,
  serializeOpeningGraph,
  serializedGraphByteSize,
  serializedGraphFits,
} from '@/lib/chess/graph/serialization';
import { OpeningGraphBuilder } from '@/lib/chess/graph/openingGraph';
import { parseGamePgn } from '@/lib/chess/pgnParser';
import { normalizePositionKey } from '@/lib/chess/fen';

describe('opening graph serialization', () => {
  it('uses an inclusive exact UTF-8 byte boundary', () => {
    const snapshot = {
      formatVersion: 2,
      queryFingerprint: 'query',
      sourceGameCount: 0,
      excludedGameCount: 0,
      openingHorizon: 30,
      buildTimestamp: 0,
      status: 'complete' as const,
      rootKey: 'root',
      rootFen: DEFAULT_POSITION,
      includedGameIds: [],
      positionGameIds: [],
      prefixGameIds: [],
      includedGameCount: 0,
      remainingGameCount: 0,
      positions: [],
      paths: [{ id: 0, parentId: null, uci: null, san: null, ply: 0 }],
    };
    const bytes = serializedGraphByteSize(snapshot);
    expect(serializedGraphFits(snapshot, bytes)).toBe(true);
    expect(serializedGraphFits(snapshot, bytes - 1)).toBe(false);
  });

  it('round-trips an empty graph with a valid root reference', () => {
    const graph = new OpeningGraphBuilder({ maxOpeningPlies: 2 }).build([]);
    const snapshot = serializeOpeningGraph(graph, {
      queryFingerprint: 'empty',
      sourceGameCount: 0,
      buildTimestamp: 0,
    });

    const restored = deserializeOpeningGraph(snapshot);
    expect(restored.rootFen).toBe(DEFAULT_POSITION);
    expect(restored.root.key).toBe(normalizePositionKey(DEFAULT_POSITION));
    expect(restored.includedGameCount).toBe(0);
  });

  it('rejects missing, invalid, partial and mismatched root FENs', () => {
    const snapshot = serializeOpeningGraph(new OpeningGraphBuilder().build([]), {
      queryFingerprint: 'empty',
      sourceGameCount: 0,
      buildTimestamp: 0,
    });
    const missing = { ...snapshot };
    Reflect.deleteProperty(missing, 'rootFen');
    expect(() => deserializeOpeningGraph(missing)).toThrow('INVALID_GRAPH_ROOT_FEN');
    for (const rootFen of ['invalid', snapshot.rootKey, '8/7k/8/8/8/8/P6K/8 b - - 17 42']) {
      expect(() => deserializeOpeningGraph({ ...snapshot, rootFen })).toThrow(
        'INVALID_GRAPH_ROOT_FEN'
      );
    }
  });
  it('round-trips a graph with deterministic position, edge, and path ordering', () => {
    const parsed = parseGamePgn({
      game: {
        id: 'game',
        url: 'https://example.test/game',
        usernameKey: 'alice',
        userColor: 'white',
        result: 'win',
        endedAt: 1,
        timeClass: 'blitz',
        rated: true,
        userRating: 1500,
        opponentRating: 1600,
        whitePlayer: { username: 'alice', rating: 1500 },
        blackPlayer: { username: 'bob', rating: 1600 },
        rules: 'chess',
        pgn: '1. e4 e5 2. Nf3 Nc6 1-0',
      },
    });
    if (!parsed.ok) throw new Error('Fixture should parse');
    const graph = new OpeningGraphBuilder({ maxOpeningPlies: 4 }).build([parsed.game]);
    const dto = serializeOpeningGraph(graph, {
      queryFingerprint: 'fingerprint',
      sourceGameCount: 1,
      buildTimestamp: 42,
    });
    const restored = deserializeOpeningGraph(dto);

    expect(dto.positions.map((position) => position.key)).toEqual(
      [...dto.positions.map((position) => position.key)].sort()
    );
    expect(dto.includedGameIds).toEqual(['game']);
    expect(restored.positionGameIds).toEqual(graph.positionGameIds);
    expect(restored.prefixGameIds).toEqual(graph.prefixGameIds);
    expect(() => deserializeOpeningGraph({ ...dto, formatVersion: 1 })).toThrow(
      'UNSUPPORTED_GRAPH_FORMAT'
    );
    expect(() => deserializeOpeningGraph({ ...dto, includedGameIds: ['game', 'game'] })).toThrow(
      'INVALID_GRAPH_MEMBERSHIP'
    );
    expect(() => deserializeOpeningGraph({ ...dto, prefixGameIds: [[0, ['invented']]] })).toThrow(
      'INVALID_GRAPH_MEMBERSHIP'
    );
    expect(restored.root.aggregate).toEqual(graph.root.aggregate);
    expect(dto.excludedGameCount).toBe(0);
    expect(dto.openingHorizon).toBe(4);
    expect(restored.openingHorizon).toBe(4);
    expect(restored.paths.sequence(4)).toEqual(graph.paths.sequence(4));
  });

  it('rejects unknown future versions and dangling target references', () => {
    expect(() => deserializeOpeningGraph({ formatVersion: 999 } as never)).toThrow(
      'UNSUPPORTED_GRAPH_FORMAT'
    );
    expect(() =>
      deserializeOpeningGraph({
        formatVersion: 2,
        openingHorizon: 1,
        paths: [],
        positions: [],
        rootKey: 'missing',
      } as never)
    ).toThrow('INVALID_OPENING_HORIZON');
    expect(() =>
      deserializeOpeningGraph({
        formatVersion: 2,
        openingHorizon: 30,
        paths: [{ id: 0, parentId: null, uci: null, san: null, ply: 0 }],
        positions: [
          {
            key: 'root',
            aggregate: {
              games: 0,
              userWins: 0,
              draws: 0,
              userLosses: 0,
              whiteWins: 0,
              blackWins: 0,
              opponentRatingSum: 0,
              opponentRatingCount: 0,
            },
            edges: [
              {
                uci: 'e2e4',
                san: 'e4',
                targetKey: 'missing',
                aggregate: {
                  games: 0,
                  userWins: 0,
                  draws: 0,
                  userLosses: 0,
                  whiteWins: 0,
                  blackWins: 0,
                  opponentRatingSum: 0,
                  opponentRatingCount: 0,
                },
              },
            ],
            arrivalsByPath: [],
          },
        ],
        rootKey: 'root',
        status: 'complete',
        includedGameCount: 0,
        remainingGameCount: 0,
      } as never)
    ).toThrow('INVALID_GRAPH_REFERENCE');
  });
});
