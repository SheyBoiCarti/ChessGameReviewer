import { describe, expect, it } from 'vitest';

import { PathStore } from '@/lib/chess/graph/pathStore';

describe('PathStore', () => {
  it('interns identical prefixes and reconstructs their SAN/UCI sequence', () => {
    const store = new PathStore();
    const e4 = store.intern(0, 'e2e4', 'e4');

    expect(store.intern(0, 'e2e4', 'e4')).toBe(e4);
    expect(store.intern(e4, 'e7e5', 'e5')).not.toBe(e4);
    expect(store.sequence(store.intern(e4, 'e7e5', 'e5'))).toEqual([
      { uci: 'e2e4', san: 'e4' },
      { uci: 'e7e5', san: 'e5' },
    ]);
  });

  it('rejects unknown parents rather than constructing a dangling path', () => {
    const store = new PathStore();

    expect(() => store.intern(99, 'e2e4', 'e4')).toThrow('UNKNOWN_PATH_PARENT');
  });

  it('rejects malformed serialized path stores', () => {
    expect(() => PathStore.fromNodes([])).toThrow('INVALID_PATH_STORE');
    expect(() =>
      PathStore.fromNodes([
        { id: 0, parentId: null, uci: null, san: null, ply: 0 },
        { id: 2, parentId: 0, uci: 'e2e4', san: 'e4', ply: 1 },
      ])
    ).toThrow('INVALID_PATH_STORE');
    expect(() =>
      PathStore.fromNodes([
        { id: 0, parentId: null, uci: null, san: null, ply: 0 },
        { id: 1, parentId: 9, uci: 'e2e4', san: 'e4', ply: 1 },
      ])
    ).toThrow('INVALID_PATH_STORE');
  });
});
