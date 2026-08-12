import { describe, expect, it } from 'vitest';

import {
  deserializeOpeningGraph,
  serializeOpeningGraph,
  serializedGraphByteSize,
  snapshotPersistenceNotice,
} from '@/lib/chess/graph/serialization';
import { OpeningGraphBuilder } from '@/lib/chess/graph/openingGraph';
import { parseGamePgn } from '@/lib/chess/pgnParser';

describe('opening graph serialization', () => {
  it('reports snapshots that are too large to persist without discarding them', () => {
    const snapshot = {
      formatVersion: 1,
      queryFingerprint: 'query',
      sourceGameCount: 0,
      excludedGameCount: 0,
      buildTimestamp: 0,
      status: 'complete' as const,
      rootKey: 'root',
      includedGameCount: 0,
      remainingGameCount: 0,
      positions: [],
      paths: [{ id: 0, parentId: null, uci: null, san: null, ply: 0 }],
    };
    expect(serializedGraphByteSize(snapshot)).toBeGreaterThan(1);
    expect(snapshotPersistenceNotice(snapshot, 1)).toBe('SNAPSHOT_TOO_LARGE_TO_PERSIST');
  });

  it('round-trips an empty graph with a valid root reference', () => {
    const graph = new OpeningGraphBuilder({ maxOpeningPlies: 2 }).build([]);
    const snapshot = serializeOpeningGraph(graph, {
      queryFingerprint: 'empty',
      sourceGameCount: 0,
      buildTimestamp: 0,
    });

    expect(() => deserializeOpeningGraph(snapshot)).not.toThrow();
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
    expect(restored.root.aggregate).toEqual(graph.root.aggregate);
    expect(dto.excludedGameCount).toBe(0);
    expect(restored.paths.sequence(4)).toEqual(graph.paths.sequence(4));
  });

  it('rejects unknown future versions and dangling target references', () => {
    expect(() => deserializeOpeningGraph({ formatVersion: 999 } as never)).toThrow(
      'UNSUPPORTED_GRAPH_FORMAT'
    );
    expect(() =>
      deserializeOpeningGraph({
        formatVersion: 1,
        paths: [],
        positions: [],
        rootKey: 'missing',
      } as never)
    ).toThrow('INVALID_PATH_STORE');
    expect(() =>
      deserializeOpeningGraph({
        formatVersion: 1,
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
