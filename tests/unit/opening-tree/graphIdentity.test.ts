import { describe, expect, it } from 'vitest';
import { makeGameRecord } from '../../helpers/phase1Fixtures';
import {
  computeDatasetRevision,
  createGraphCacheIdentity,
  graphCacheKey,
  type GraphCacheIdentity,
} from '@/features/opening-tree/graphIdentity';
import { GRAPH_FORMAT_VERSION, MAX_SERIALIZED_GRAPH_BYTES } from '@/lib/chess/graph/serialization';
import {
  OPENING_PROJECTION_VERSION,
  PGN_PARSER_VERSION,
  POSITION_KEY_VERSION,
} from '@/lib/chess/graph/types';
import { NORMALIZER_VERSION } from '@/lib/db/schema';

describe('graphIdentity', () => {
  describe('computeDatasetRevision', () => {
    it('is order-independent for identical records', async () => {
      const a = makeGameRecord({ id: 'a' });
      const b = makeGameRecord({ id: 'b' });
      expect(await computeDatasetRevision([a, b])).toBe(await computeDatasetRevision([b, a]));
    });

    it('changes when aggregate-affecting metadata or PGN changes', async () => {
      const a = makeGameRecord({ id: 'a' });
      const b = makeGameRecord({ id: 'b', result: 'draw' });
      const baseRevision = await computeDatasetRevision([a, b]);

      expect(baseRevision).not.toBe(await computeDatasetRevision([a, { ...b, result: 'win' }]));
      expect(baseRevision).not.toBe(await computeDatasetRevision([a, { ...b, userRating: 1800 }]));
      expect(baseRevision).not.toBe(
        await computeDatasetRevision([a, { ...b, opponentRating: 1800 }])
      );
      expect(baseRevision).not.toBe(
        await computeDatasetRevision([a, { ...b, userColor: 'black' }])
      );
      expect(baseRevision).not.toBe(
        await computeDatasetRevision([a, { ...b, pgn: '1. d4 d5 2. c4 1/2-1/2' }])
      );
      expect(baseRevision).not.toBe(
        await computeDatasetRevision([a, { ...b, timeClass: 'rapid' }])
      );
      expect(baseRevision).not.toBe(await computeDatasetRevision([a, { ...b, rated: false }]));
    });
  });

  describe('graphCacheKey and GraphCacheIdentity', () => {
    const makeIdentity = (overrides: Partial<GraphCacheIdentity> = {}): GraphCacheIdentity => ({
      username: 'janedoe',
      canonicalQuery: {
        username: 'janedoe',
        dateFrom: '2024-01-01',
        dateTo: '2024-01-31',
        timeClasses: ['blitz', 'rapid'],
        colors: ['white'],
        rated: true,
        maxGames: 50,
      },
      scope: 'white',
      horizon: 10,
      repetitionPolicy: 'omit-repeats',
      datasetRevision: 'rev-test-123',
      versions: {
        graphFormat: GRAPH_FORMAT_VERSION,
        pgnParser: PGN_PARSER_VERSION,
        positionKey: POSITION_KEY_VERSION,
        projection: OPENING_PROJECTION_VERSION,
        normalizer: NORMALIZER_VERSION,
      },
      limits: {
        maxBytes: MAX_SERIALIZED_GRAPH_BYTES,
        maxPositions: 10000,
        maxEdges: 20000,
        maxPathNodes: 10000,
      },
      ...overrides,
    });

    it('produces identical key for identical identity and query field ordering', () => {
      const id1 = makeIdentity();
      const id2 = makeIdentity({
        canonicalQuery: {
          ...id1.canonicalQuery,
          timeClasses: ['rapid', 'blitz'], // reversed order
        },
      });
      expect(graphCacheKey(id1)).toBe(graphCacheKey(id2));
    });

    it('changes key when scope, horizon, or username changes', () => {
      const base = makeIdentity();
      expect(graphCacheKey(base)).not.toBe(graphCacheKey({ ...base, scope: 'black' }));
      expect(graphCacheKey(base)).not.toBe(graphCacheKey({ ...base, horizon: 15 }));
      expect(graphCacheKey(base)).not.toBe(graphCacheKey({ ...base, username: 'otheruser' }));
    });

    it('changes key when dataset revision changes', () => {
      const base = makeIdentity();
      expect(graphCacheKey(base)).not.toBe(
        graphCacheKey({ ...base, datasetRevision: 'rev-test-456' })
      );
    });

    it('changes key when query filters or limits change', () => {
      const base = makeIdentity();
      expect(graphCacheKey(base)).not.toBe(
        graphCacheKey({
          ...base,
          canonicalQuery: { ...base.canonicalQuery, maxGames: 100 },
        })
      );
      expect(graphCacheKey(base)).not.toBe(
        graphCacheKey({
          ...base,
          canonicalQuery: { ...base.canonicalQuery, rated: false },
        })
      );
      expect(graphCacheKey(base)).not.toBe(
        graphCacheKey({
          ...base,
          limits: { ...base.limits, maxBytes: 32 * 1024 * 1024 },
        })
      );
    });

    it('changes key when underlying formats or versions change', () => {
      const base = makeIdentity();
      expect(graphCacheKey(base)).not.toBe(
        graphCacheKey({
          ...base,
          versions: { ...base.versions, graphFormat: 99 },
        })
      );
      expect(graphCacheKey(base)).not.toBe(
        graphCacheKey({
          ...base,
          versions: { ...base.versions, pgnParser: 'chessjs-v9' },
        })
      );
      expect(graphCacheKey(base)).not.toBe(
        graphCacheKey({
          ...base,
          versions: { ...base.versions, positionKey: 'fen-v9' },
        })
      );
    });

    it('helper createGraphCacheIdentity creates complete identity correctly', () => {
      const identity = createGraphCacheIdentity({
        username: 'janedoe',
        query: {
          username: 'janedoe',
          timeClasses: ['blitz'],
          colors: ['white'],
          maxGames: 20,
        },
        scope: 'white',
        horizon: 10,
        datasetRevision: 'rev-abc',
      });
      expect(identity.username).toBe('janedoe');
      expect(identity.versions.graphFormat).toBe(GRAPH_FORMAT_VERSION);
      expect(identity.versions.pgnParser).toBe(PGN_PARSER_VERSION);
      expect(identity.versions.positionKey).toBe(POSITION_KEY_VERSION);
      expect(identity.versions.projection).toBe(OPENING_PROJECTION_VERSION);
      expect(identity.versions.normalizer).toBe(NORMALIZER_VERSION);
      expect(identity.limits.maxBytes).toBe(MAX_SERIALIZED_GRAPH_BYTES);
    });
  });
});
