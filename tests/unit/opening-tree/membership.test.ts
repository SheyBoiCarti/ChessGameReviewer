import { describe, expect, it } from 'vitest';
import { buildOpeningGraphFixture, fixtureKeyAfter } from '../../helpers/openingGraphFixture';
import { serializeOpeningGraph } from '@/lib/chess/graph/serialization';
import { selectPositionGameIds, selectPrefixGameIds } from '@/features/opening-tree/selectors';

describe('opening membership', () => {
  const graph = buildOpeningGraphFixture();
  const snapshot = serializeOpeningGraph(graph, {
    queryFingerprint: 'fixture',
    sourceGameCount: 3,
    buildTimestamp: 1,
  });
  it('distinguishes shared positions from exact observed lines', () => {
    expect(selectPrefixGameIds(snapshot, null)).toEqual([]);
    expect(selectPositionGameIds(snapshot, snapshot.rootKey)).toEqual(snapshot.includedGameIds);
    const shared = fixtureKeyAfter('Nf3', 'd5', 'd4', 'Nf6');
    expect(selectPositionGameIds(snapshot, shared)).toEqual(['fixture-0', 'fixture-1']);
    expect(selectPrefixGameIds(snapshot, 4)).toEqual(['fixture-0']);
    expect(selectPositionGameIds(snapshot, 'absent')).toEqual([]);
    expect(selectPrefixGameIds(snapshot, 999)).toEqual([]);
  });

  it('T55: resolves source game metadata, recency, and formats endedAt in UTC', () => {
    const ids = selectPrefixGameIds(snapshot, 4);
    const gamesById = new Map([
      ['fixture-0', { id: 'fixture-0', endedAt: 1700000000 }],
      ['fixture-1', { id: 'fixture-1', endedAt: 1710000000 }],
    ]);
    const records = ids.map((id) => gamesById.get(id)!);
    const expectedLatestEndedAt = 1700000000;
    expect(Math.max(...records.map((g) => g.endedAt))).toBe(expectedLatestEndedAt);
    expect(selectPrefixGameIds(snapshot, null)).toEqual([]);
  });
});
