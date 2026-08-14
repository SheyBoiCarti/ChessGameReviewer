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

  it('handles sequence error cases properly', () => {
    const store = new PathStore();
    expect(() => store.sequence(999)).toThrow('UNKNOWN_PATH');

    // Malformed nodes with cycle / missing parent
    const cyclicalStore = PathStore.fromNodes([
      { id: 0, parentId: null, uci: null, san: null, ply: 0 },
      { id: 1, parentId: 0, uci: 'e2e4', san: 'e4', ply: 1 },
    ]);
    // Inject a cycle manually to test defensive checks
    (cyclicalStore as any).paths.set(1, { id: 1, parentId: 1, uci: 'e2e4', san: 'e4', ply: 1 });
    expect(() => cyclicalStore.sequence(1)).toThrow('PATH_CYCLE');

    // Missing parent in store
    const missingParentStore = PathStore.fromNodes([
      { id: 0, parentId: null, uci: null, san: null, ply: 0 },
      { id: 1, parentId: 0, uci: 'e2e4', san: 'e4', ply: 1 },
    ]);
    (missingParentStore as any).paths.set(1, {
      id: 1,
      parentId: 99,
      uci: 'e2e4',
      san: 'e4',
      ply: 1,
    });
    expect(() => missingParentStore.sequence(1)).toThrow('UNKNOWN_PATH_PARENT');

    // Null UCI in non-root node
    const nullUciStore = PathStore.fromNodes([
      { id: 0, parentId: null, uci: null, san: null, ply: 0 },
      { id: 1, parentId: 0, uci: 'e2e4', san: 'e4', ply: 1 },
    ]);
    (nullUciStore as any).paths.set(1, { id: 1, parentId: 0, uci: null, san: 'e4', ply: 1 });
    expect(() => nullUciStore.sequence(1)).toThrow('INVALID_PATH_NODE');
  });
});
