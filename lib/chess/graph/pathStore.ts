import type { PathNode } from './types';

export class PathStore {
  private readonly paths = new Map<number, PathNode>([
    [0, { id: 0, parentId: null, uci: null, san: null, ply: 0 }],
  ]);
  private readonly idsByPrefix = new Map<string, number>();

  get size(): number {
    return this.paths.size;
  }

  nodes(): readonly PathNode[] {
    return [...this.paths.values()].sort((left, right) => left.id - right.id);
  }

  static fromNodes(nodes: readonly PathNode[]): PathStore {
    const store = new PathStore();
    if (nodes.length === 0 || nodes[0]?.id !== 0 || nodes[0].parentId !== null)
      throw new Error('INVALID_PATH_STORE');
    for (const node of [...nodes].sort((left, right) => left.id - right.id).slice(1)) {
      if (
        node.parentId === null ||
        !store.paths.has(node.parentId) ||
        node.id !== store.paths.size ||
        node.uci === null ||
        node.san === null
      )
        throw new Error('INVALID_PATH_STORE');
      store.paths.set(node.id, { ...node });
      store.idsByPrefix.set(`${node.parentId}\u0000${node.uci}`, node.id);
    }
    return store;
  }

  lookup(parentId: number, uci: string): number | undefined {
    return this.idsByPrefix.get(`${parentId}\u0000${uci}`);
  }

  intern(parentId: number, uci: string, san: string): number {
    const parent = this.paths.get(parentId);
    if (!parent) throw new Error('UNKNOWN_PATH_PARENT');
    const prefix = `${parentId}\u0000${uci}`;
    const existing = this.idsByPrefix.get(prefix);
    if (existing !== undefined) return existing;
    const id = this.paths.size;
    this.paths.set(id, { id, parentId, uci, san, ply: parent.ply + 1 });
    this.idsByPrefix.set(prefix, id);
    return id;
  }

  sequence(id: number): Array<{ uci: string; san: string }> {
    const steps: Array<{ uci: string; san: string }> = [];
    const seen = new Set<number>();
    let current = this.paths.get(id);
    while (current && current.parentId !== null) {
      if (seen.has(current.id)) throw new Error('PATH_CYCLE');
      seen.add(current.id);
      if (current.uci === null || current.san === null) throw new Error('INVALID_PATH_NODE');
      steps.push({ uci: current.uci, san: current.san });
      current = this.paths.get(current.parentId);
      if (!current) throw new Error('UNKNOWN_PATH_PARENT');
    }
    if (!current) throw new Error('UNKNOWN_PATH');
    return steps.reverse();
  }
}
