import { Chess } from 'chess.js';

import { normalizePositionKey } from '../fen';
import { PathStore } from './pathStore';
import type { OpeningGraphSnapshot } from './openingGraph';
import type { MoveEdge, OutcomeAggregate, PathNode, PositionNode } from './types';

export const GRAPH_FORMAT_VERSION = 2;
export const MAX_SERIALIZED_GRAPH_BYTES = 64 * 1024 * 1024;
export interface SerializedOpeningGraph {
  formatVersion: number;
  queryFingerprint: string;
  sourceGameCount: number;
  excludedGameCount: number;
  openingHorizon: number;
  buildTimestamp: number;
  status: OpeningGraphSnapshot['status'];
  rootKey: string;
  includedGameCount: number;
  includedGameIds: string[];
  positionGameIds: Array<[string, string[]]>;
  prefixGameIds: Array<[number, string[]]>;
  remainingGameCount: number;
  rootFen: string;
  reachedLimit?: string;
  positions: Array<{
    key: string;
    aggregate: OutcomeAggregate;
    edges: MoveEdge[];
    arrivalsByPath: Array<[number, OutcomeAggregate]>;
  }>;
  paths: PathNode[];
  datasetRevision?: string;
}

export function serializedGraphByteSize(snapshot: SerializedOpeningGraph): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
}

export function serializedGraphFits(
  snapshot: SerializedOpeningGraph,
  maxBytes = MAX_SERIALIZED_GRAPH_BYTES
): boolean {
  return serializedGraphByteSize(snapshot) <= maxBytes;
}

export function serializeOpeningGraph(
  graph: OpeningGraphSnapshot,
  metadata: Pick<
    SerializedOpeningGraph,
    'queryFingerprint' | 'sourceGameCount' | 'buildTimestamp'
  > &
    Partial<Pick<SerializedOpeningGraph, 'excludedGameCount' | 'datasetRevision'>>
): SerializedOpeningGraph {
  return {
    formatVersion: GRAPH_FORMAT_VERSION,
    ...metadata,
    excludedGameCount: (metadata.excludedGameCount ?? 0) + graph.excludedGameCount,
    openingHorizon: graph.openingHorizon,
    status: graph.status,
    rootKey: graph.root.key,
    includedGameCount: graph.includedGameCount,
    includedGameIds: [...graph.includedGameIds],
    positionGameIds: [...graph.positionGameIds].sort(([a], [b]) => a.localeCompare(b)),
    prefixGameIds: [...graph.prefixGameIds].sort(([a], [b]) => a - b),
    remainingGameCount: graph.remainingGameCount,
    rootFen: graph.rootFen,
    ...(graph.reachedLimit ? { reachedLimit: graph.reachedLimit } : {}),
    positions: [...graph.positions.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((node) => ({
        key: node.key,
        aggregate: { ...node.aggregate },
        edges: [...node.outgoing.values()]
          .sort((a, b) => a.uci.localeCompare(b.uci))
          .map((edge) => ({ ...edge, aggregate: { ...edge.aggregate } })),
        arrivalsByPath: [...node.arrivalsByPath.entries()]
          .sort(([a], [b]) => a - b)
          .map(([id, aggregate]) => [id, { ...aggregate }]),
      })),
    paths: graph.paths.nodes().map((node) => ({ ...node })),
  };
}

export function deserializeOpeningGraph(dto: SerializedOpeningGraph): OpeningGraphSnapshot {
  if (dto.formatVersion !== GRAPH_FORMAT_VERSION) throw new Error('UNSUPPORTED_GRAPH_FORMAT');
  if (!Number.isInteger(dto.openingHorizon) || dto.openingHorizon < 2 || dto.openingHorizon > 40) {
    throw new Error('INVALID_OPENING_HORIZON');
  }
  const count = (value: number) => Number.isSafeInteger(value) && value >= 0;
  const validAggregate = (aggregate: OutcomeAggregate) =>
    aggregate &&
    Object.entries(aggregate).length === 8 &&
    Object.entries(aggregate).every(
      ([key, value]) =>
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= 0 &&
        (key === 'opponentRatingSum' || Number.isSafeInteger(value))
    ) &&
    aggregate.userWins + aggregate.draws + aggregate.userLosses === aggregate.games &&
    aggregate.whiteWins + aggregate.draws + aggregate.blackWins === aggregate.games &&
    aggregate.opponentRatingCount <= aggregate.games;
  if (
    ![
      dto.sourceGameCount,
      dto.includedGameCount,
      dto.excludedGameCount,
      dto.remainingGameCount,
    ].every(count) ||
    !Number.isFinite(dto.buildTimestamp) ||
    dto.buildTimestamp < 0 ||
    dto.includedGameCount + dto.excludedGameCount + dto.remainingGameCount !==
      dto.sourceGameCount ||
    !['complete', 'limited'].includes(dto.status) ||
    (dto.status === 'limited' &&
      !['maxPositions', 'maxEdges', 'maxPathNodes', 'maxSnapshotBytes'].includes(
        dto.reachedLimit ?? ''
      )) ||
    (dto.status === 'complete' &&
      (dto.remainingGameCount !== 0 || dto.reachedLimit !== undefined)) ||
    !Array.isArray(dto.positions) ||
    new Set(dto.positions.map((p) => p.key)).size !== dto.positions.length ||
    dto.positions.some(
      (p) =>
        !validAggregate(p.aggregate) ||
        new Set(p.edges.map((e) => e.uci)).size !== p.edges.length ||
        p.edges.some(
          (e) =>
            !validAggregate(e.aggregate) ||
            typeof e.san !== 'string' ||
            !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(e.uci)
        ) ||
        new Map(p.arrivalsByPath).size !== p.arrivalsByPath.length ||
        p.arrivalsByPath.some(([, aggregate]) => !validAggregate(aggregate))
    )
  ) {
    throw new Error('INVALID_GRAPH_DATA');
  }
  const paths = PathStore.fromNodes(dto.paths);
  const positions = new Map<string, PositionNode>();
  for (const serialized of dto.positions)
    positions.set(serialized.key, {
      key: serialized.key,
      aggregate: { ...serialized.aggregate },
      outgoing: new Map(
        serialized.edges.map((edge) => [edge.uci, { ...edge, aggregate: { ...edge.aggregate } }])
      ),
      arrivalsByPath: new Map(
        serialized.arrivalsByPath.map(([id, aggregate]) => [id, { ...aggregate }])
      ),
    });
  const root = positions.get(dto.rootKey);
  if (!root) throw new Error('INVALID_GRAPH_REFERENCE');
  for (const node of positions.values())
    for (const edge of node.outgoing.values())
      if (!positions.has(edge.targetKey)) throw new Error('INVALID_GRAPH_REFERENCE');
  for (const node of positions.values())
    for (const pathId of node.arrivalsByPath.keys()) paths.sequence(pathId);
  const reachedLimit = dto.reachedLimit as
    | Exclude<OpeningGraphSnapshot['reachedLimit'], undefined>
    | undefined;
  // Missing legacy roots require rebuilding; inventing clocks from a four-field
  // key would silently change actual move numbering and repetition history.
  let rootFen: string;
  try {
    if (!dto.rootFen || normalizePositionKey(dto.rootFen) !== root.key) {
      throw new Error('INVALID_GRAPH_ROOT_FEN');
    }
    rootFen = new Chess(dto.rootFen).fen();
  } catch {
    throw new Error('INVALID_GRAPH_ROOT_FEN');
  }
  const included = new Set(dto.includedGameIds);
  const pathIds = new Set(dto.paths.map((path) => path.id));
  const validIds = (ids: unknown): ids is string[] =>
    Array.isArray(ids) &&
    ids.every((id) => typeof id === 'string' && included.has(id)) &&
    new Set(ids).size === ids.length;
  if (
    !Array.isArray(dto.includedGameIds) ||
    included.size !== dto.includedGameCount ||
    dto.includedGameIds.length !== dto.includedGameCount ||
    dto.includedGameIds.some((id) => typeof id !== 'string') ||
    !Array.isArray(dto.positionGameIds) ||
    !Array.isArray(dto.prefixGameIds) ||
    dto.positionGameIds.some(([key, ids]) => !positions.has(key) || !validIds(ids)) ||
    dto.prefixGameIds.some(([id, ids]) => !pathIds.has(id) || !validIds(ids)) ||
    new Map(dto.positionGameIds).size !== dto.positionGameIds.length ||
    new Map(dto.prefixGameIds).size !== dto.prefixGameIds.length ||
    (dto.includedGameCount > 0 &&
      (new Map(dto.positionGameIds).get(dto.rootKey)?.length !== dto.includedGameCount ||
        new Map(dto.prefixGameIds).get(0)?.length !== dto.includedGameCount))
  ) {
    throw new Error('INVALID_GRAPH_MEMBERSHIP');
  }
  return {
    status: dto.status,
    root,
    positions,
    paths,
    openingHorizon: dto.openingHorizon,
    includedGameCount: dto.includedGameCount,
    includedGameIds: [...dto.includedGameIds],
    positionGameIds: new Map(dto.positionGameIds),
    prefixGameIds: new Map(dto.prefixGameIds),
    excludedGameCount: dto.excludedGameCount,
    remainingGameCount: dto.remainingGameCount,
    rootFen,
    ...(reachedLimit ? { reachedLimit } : {}),
  };
}
