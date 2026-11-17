import type { GameQuery, NormalizedGameSummary } from '@/lib/api/contracts';
import { NORMALIZER_VERSION } from '@/lib/db/schema';
import { GRAPH_FORMAT_VERSION, MAX_SERIALIZED_GRAPH_BYTES } from '@/lib/chess/graph/serialization';
import {
  OPENING_PROJECTION_VERSION,
  PGN_PARSER_VERSION,
  POSITION_KEY_VERSION,
} from '@/lib/chess/graph/types';
import { computePgnDigest } from '@/features/stockfish-analysis/reviewIdentity';

export type OpeningScope = 'white' | 'black' | 'both';

export interface OpeningGraphRequestIdentity {
  queryToken: number;
  datasetRevision: string;
  scope: OpeningScope;
  horizon: number;
  graphRequestId: number;
}

export interface CanonicalGameQuery {
  username: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  timeClasses: readonly string[];
  colors: readonly ('white' | 'black')[];
  rated?: boolean | null;
  maxGames: number;
}

export interface GraphCacheIdentity {
  username: string;
  canonicalQuery: CanonicalGameQuery;
  scope: OpeningScope;
  horizon: number;
  repetitionPolicy: 'omit-repeats' | 'include-repeats';
  datasetRevision: string;
  versions: {
    graphFormat: number;
    pgnParser: string;
    positionKey: string;
    projection: number;
    normalizer: number;
  };
  limits: {
    maxBytes: number;
    maxPositions?: number;
    maxEdges?: number;
    maxPathNodes?: number;
  };
}

/**
 * T48: compute a stable, order-independent dataset revision from normalized
 * record identity and aggregate-affecting metadata. Volatile timestamps like
 * fetchedAt or buildTimestamp are excluded.
 */
export async function computeDatasetRevision(
  games: readonly (Pick<
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
  > &
    Partial<Pick<NormalizedGameSummary, 'rules' | 'timeControl' | 'whitePlayer' | 'blackPlayer'>>)[]
): Promise<string> {
  const tuples = await Promise.all(
    games.map(async (game) => {
      const pgnDigest = await computePgnDigest(game.pgn ?? '');
      return [
        game.id,
        pgnDigest,
        game.userColor,
        game.result,
        game.endedAt,
        game.timeClass,
        game.timeControl ?? null,
        game.rated,
        game.userRating ?? null,
        game.opponentRating ?? null,
        game.rules ?? 'chess',
        game.whitePlayer?.username ?? null,
        game.blackPlayer?.username ?? null,
      ];
    })
  );
  tuples.sort((a, b) => {
    const idA = String(a[0]);
    const idB = String(b[0]);
    if (idA !== idB) return idA.localeCompare(idB);
    return JSON.stringify(a).localeCompare(JSON.stringify(b));
  });
  const canonicalBytes = new TextEncoder().encode(JSON.stringify(tuples));
  const digestBuffer = await crypto.subtle.digest('SHA-256', canonicalBytes);
  const hash = Array.from(new Uint8Array(digestBuffer), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
  return `rev-${hash}`;
}

export function graphCacheKey(identity: GraphCacheIdentity): string {
  const queryTuple = [
    identity.canonicalQuery.username.trim().toLowerCase(),
    identity.canonicalQuery.dateFrom ?? '',
    identity.canonicalQuery.dateTo ?? '',
    [...(identity.canonicalQuery.timeClasses ?? [])].sort(),
    [...(identity.canonicalQuery.colors ?? [])].sort(),
    identity.canonicalQuery.rated === undefined ? null : identity.canonicalQuery.rated,
    identity.canonicalQuery.maxGames,
  ];
  const payload = [
    'opening-graph-v1',
    identity.username.trim().toLowerCase(),
    queryTuple,
    identity.scope,
    identity.horizon,
    identity.repetitionPolicy,
    identity.datasetRevision,
    [
      identity.versions.graphFormat,
      identity.versions.pgnParser,
      identity.versions.positionKey,
      identity.versions.projection,
      identity.versions.normalizer,
    ],
    [
      identity.limits.maxBytes,
      identity.limits.maxPositions ?? 0,
      identity.limits.maxEdges ?? 0,
      identity.limits.maxPathNodes ?? 0,
    ],
  ];
  return JSON.stringify(payload);
}

export function createGraphCacheIdentity(params: {
  username: string;
  query: GameQuery | CanonicalGameQuery;
  scope: OpeningScope;
  horizon: number;
  datasetRevision: string;
  includeRepeatedPositions?: boolean;
  limits?: Partial<GraphCacheIdentity['limits']>;
}): GraphCacheIdentity {
  return {
    username: params.username.trim().toLowerCase(),
    canonicalQuery: {
      username: params.query.username.trim().toLowerCase(),
      dateFrom: params.query.dateFrom ?? null,
      dateTo: params.query.dateTo ?? null,
      timeClasses: [...params.query.timeClasses].sort(),
      colors: [...params.query.colors].sort(),
      rated: params.query.rated ?? null,
      maxGames: params.query.maxGames,
    },
    scope: params.scope,
    horizon: params.horizon,
    repetitionPolicy: params.includeRepeatedPositions ? 'include-repeats' : 'omit-repeats',
    datasetRevision: params.datasetRevision,
    versions: {
      graphFormat: GRAPH_FORMAT_VERSION,
      pgnParser: PGN_PARSER_VERSION,
      positionKey: POSITION_KEY_VERSION,
      projection: OPENING_PROJECTION_VERSION,
      normalizer: NORMALIZER_VERSION,
    },
    limits: {
      maxBytes: params.limits?.maxBytes ?? MAX_SERIALIZED_GRAPH_BYTES,
      ...(params.limits?.maxPositions !== undefined
        ? { maxPositions: params.limits.maxPositions }
        : {}),
      ...(params.limits?.maxEdges !== undefined ? { maxEdges: params.limits.maxEdges } : {}),
      ...(params.limits?.maxPathNodes !== undefined
        ? { maxPathNodes: params.limits.maxPathNodes }
        : {}),
    },
  };
}

/** T40: first use selects the import's sole color, otherwise White. */
export function initialOpeningScope(
  games: readonly { userColor: 'white' | 'black' }[]
): OpeningScope {
  if (games.length === 0) return 'white';
  const colors = new Set(games.map((game) => game.userColor));
  return colors.size === 1 ? (colors.values().next().value as OpeningScope) : 'white';
}
