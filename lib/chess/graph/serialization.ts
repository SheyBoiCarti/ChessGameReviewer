import { PathStore } from './pathStore';
import type { OpeningGraphSnapshot } from './openingGraph';
import type { MoveEdge, OutcomeAggregate, PathNode, PositionNode } from './types';

export const GRAPH_FORMAT_VERSION = 1;
export const MAX_SERIALIZED_GRAPH_BYTES = 64 * 1024 * 1024;
export interface SerializedOpeningGraph {
  formatVersion: number;
  queryFingerprint: string;
  sourceGameCount: number;
  buildTimestamp: number;
  status: OpeningGraphSnapshot['status'];
  rootKey: string;
  includedGameCount: number;
  remainingGameCount: number;
  reachedLimit?: string;
  positions: Array<{
    key: string;
    aggregate: OutcomeAggregate;
    edges: MoveEdge[];
    arrivalsByPath: Array<[number, OutcomeAggregate]>;
  }>;
  paths: PathNode[];
}

export function serializedGraphByteSize(snapshot: SerializedOpeningGraph): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
}

export function snapshotPersistenceNotice(
  snapshot: SerializedOpeningGraph,
  maxBytes = MAX_SERIALIZED_GRAPH_BYTES
): 'SNAPSHOT_TOO_LARGE_TO_PERSIST' | undefined {
  return serializedGraphByteSize(snapshot) > maxBytes ? 'SNAPSHOT_TOO_LARGE_TO_PERSIST' : undefined;
}

export function serializeOpeningGraph(
  graph: OpeningGraphSnapshot,
  metadata: Pick<SerializedOpeningGraph, 'queryFingerprint' | 'sourceGameCount' | 'buildTimestamp'>
): SerializedOpeningGraph {
  return {
    formatVersion: GRAPH_FORMAT_VERSION,
    ...metadata,
    status: graph.status,
    rootKey: graph.root.key,
    includedGameCount: graph.includedGameCount,
    remainingGameCount: graph.remainingGameCount,
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
  return {
    status: dto.status,
    root,
    positions,
    paths,
    includedGameCount: dto.includedGameCount,
    remainingGameCount: dto.remainingGameCount,
    ...(reachedLimit ? { reachedLimit } : {}),
  };
}
