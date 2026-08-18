import type { SerializedOpeningGraph } from '@/lib/chess/graph/serialization';

export function bookMoveKey(positionKey: string, uci: string): string {
  return `${positionKey}\u0000${uci}`;
}

export function collectPersonalBookMoveKeys(
  snapshot: SerializedOpeningGraph | null,
  minimumGames = 2
): readonly string[] {
  if (!snapshot || !snapshot.positions) return [];
  const keys: string[] = [];
  for (const pos of snapshot.positions) {
    for (const edge of pos.edges) {
      if (edge.aggregate.games >= minimumGames) {
        keys.push(bookMoveKey(pos.key, edge.uci));
      }
    }
  }
  return keys.sort((a, b) => a.localeCompare(b));
}
