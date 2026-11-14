import type { NormalizedGameSummary } from '@/lib/api/contracts';

export type OpeningScope = 'white' | 'black' | 'both';

export interface OpeningGraphRequestIdentity {
  queryToken: number;
  datasetRevision: string;
  scope: OpeningScope;
  horizon: number;
  graphRequestId: number;
}

/**
 * T40: a stable, order-independent dataset revision computed once per accepted
 * dataset from normalized record identity. Volatile fields such as fetchedAt
 * and build timestamps are excluded; mere record reorder does not change it.
 * T48 replaces this pre-schema string with a canonical serialization.
 */
export function computeDatasetRevision(
  games: readonly Pick<
    NormalizedGameSummary,
    | 'id'
    | 'userColor'
    | 'result'
    | 'endedAt'
    | 'timeClass'
    | 'rated'
    | 'userRating'
    | 'opponentRating'
    | 'pgn'
  >[]
): string {
  const canonical = games
    .map((game) =>
      JSON.stringify([
        game.id,
        game.userColor,
        game.result,
        game.endedAt,
        game.timeClass,
        game.rated,
        game.userRating,
        game.opponentRating,
        game.pgn,
      ])
    )
    .sort()
    .join('\u0000');
  return `rev-${fnv1a(canonical)}`;
}

function fnv1a(text: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16);
}

/** T40: first use selects the import's sole color, otherwise White. */
export function initialOpeningScope(
  games: readonly { userColor: 'white' | 'black' }[]
): OpeningScope {
  if (games.length === 0) return 'white';
  const colors = new Set(games.map((game) => game.userColor));
  return colors.size === 1 ? (colors.values().next().value as OpeningScope) : 'white';
}
