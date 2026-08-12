import type { ParsedGame } from '../pgnParser';
import { addVisit, emptyOutcome } from './outcomes';
import { PathStore } from './pathStore';
import type { GraphBuildLimits, GraphBuildOptions, PositionNode } from './types';

const DEFAULT_LIMITS: GraphBuildLimits = {
  maxPositions: 150_000,
  maxEdges: 200_000,
  maxPathNodes: 200_001,
  maxSnapshotBytes: 64 * 1024 * 1024,
};

export interface OpeningGraphSnapshot {
  status: 'complete' | 'limited';
  root: PositionNode;
  positions: ReadonlyMap<string, PositionNode>;
  paths: PathStore;
  includedGameCount: number;
  remainingGameCount: number;
  reachedLimit?: keyof GraphBuildLimits;
}

export class OpeningGraphBuilder {
  private readonly options: GraphBuildOptions;
  private readonly limits: GraphBuildLimits;

  constructor(options: Partial<GraphBuildOptions> = {}, limits: Partial<GraphBuildLimits> = {}) {
    const maxOpeningPlies = options.maxOpeningPlies ?? 30;
    if (!Number.isInteger(maxOpeningPlies) || maxOpeningPlies < 2 || maxOpeningPlies > 40) {
      throw new RangeError('INVALID_OPENING_HORIZON');
    }
    this.options = {
      maxOpeningPlies,
      includeRepeatedPositions: options.includeRepeatedPositions ?? true,
    };
    this.limits = { ...DEFAULT_LIMITS, ...limits };
  }

  build(games: readonly ParsedGame[]): OpeningGraphSnapshot {
    const positions = new Map<string, PositionNode>();
    const paths = new PathStore();
    let root: PositionNode | undefined;
    let edgeCount = 0;
    let includedGameCount = 0;

    for (let gameIndex = 0; gameIndex < games.length; gameIndex += 1) {
      const game = games[gameIndex];
      if (!game || game.plies.length === 0) continue;
      const firstPly = game.plies[0];
      if (!firstPly || !isContinuous(game)) continue;
      if (!root) {
        root = createNode(firstPly.positionBefore);
        positions.set(root.key, root);
      }
      if (firstPly.positionBefore !== root.key) continue;

      const plies = game.plies.slice(0, this.options.maxOpeningPlies);
      const additions = countAdditions(plies, positions, paths, root.key);
      const limit = this.exceedsLimit(positions.size, edgeCount, paths.size, additions);
      if (limit) {
        return {
          status: 'limited',
          root,
          positions,
          paths,
          includedGameCount,
          remainingGameCount: games.length - includedGameCount,
          reachedLimit: limit,
        };
      }

      const visit = {
        result: game.result,
        userColor: game.userColor,
        opponentRating: game.opponentRating,
      };
      addVisit(root.aggregate, visit);
      const visitedPositions = new Set<string>([root.key]);
      let source = root;
      let pathId = 0;
      for (const ply of plies) {
        const target =
          positions.get(ply.positionAfter) ?? createAndStore(positions, ply.positionAfter);
        let edge = source.outgoing.get(ply.uci);
        if (!edge) {
          edge = { uci: ply.uci, san: ply.san, targetKey: target.key, aggregate: emptyOutcome() };
          source.outgoing.set(ply.uci, edge);
          edgeCount += 1;
        }
        if (edge.targetKey !== target.key || edge.san !== ply.san)
          throw new Error('INCONSISTENT_EDGE');
        pathId = paths.intern(pathId, ply.uci, ply.san);
        addVisit(edge.aggregate, visit);
        const firstVisit = !visitedPositions.has(target.key);
        if (this.options.includeRepeatedPositions || firstVisit) {
          addVisit(target.aggregate, visit);
          const arrival = target.arrivalsByPath.get(pathId) ?? emptyOutcome();
          addVisit(arrival, visit);
          target.arrivalsByPath.set(pathId, arrival);
          visitedPositions.add(target.key);
        }
        source = target;
      }
      includedGameCount += 1;
    }

    const fallbackRoot = root ?? createNode('');
    return {
      status: 'complete',
      root: fallbackRoot,
      positions,
      paths,
      includedGameCount,
      remainingGameCount: 0,
    };
  }

  private exceedsLimit(
    positionCount: number,
    edgeCount: number,
    pathCount: number,
    additions: { positions: number; edges: number; paths: number }
  ): keyof GraphBuildLimits | undefined {
    if (positionCount + additions.positions > this.limits.maxPositions) return 'maxPositions';
    if (edgeCount + additions.edges > this.limits.maxEdges) return 'maxEdges';
    if (pathCount + additions.paths > this.limits.maxPathNodes) return 'maxPathNodes';
    return undefined;
  }
}

function createNode(key: string): PositionNode {
  return { key, aggregate: emptyOutcome(), outgoing: new Map(), arrivalsByPath: new Map() };
}

function createAndStore(positions: Map<string, PositionNode>, key: string): PositionNode {
  const node = createNode(key);
  positions.set(key, node);
  return node;
}

function isContinuous(game: ParsedGame): boolean {
  return game.plies.every(
    (ply, index) => index === 0 || ply.fenBefore === game.plies[index - 1]?.fenAfter
  );
}

function countAdditions(
  plies: readonly ParsedGame['plies'][number][],
  positions: ReadonlyMap<string, PositionNode>,
  paths: PathStore,
  rootKey: string
): { positions: number; edges: number; paths: number } {
  const newPositions = new Set<string>();
  const newEdges = new Set<string>();
  const newPaths = new Set<string>();
  const virtualPathIds = new Map<string, number>();
  let sourceKey = rootKey;
  let parentId = 0;
  let nextVirtualPathId = -1;
  for (const ply of plies) {
    if (!positions.has(ply.positionAfter)) newPositions.add(ply.positionAfter);
    const source = positions.get(sourceKey);
    if (!source?.outgoing.has(ply.uci)) newEdges.add(`${sourceKey}\u0000${ply.uci}`);
    const prefix = `${parentId}\u0000${ply.uci}`;
    const knownPath = paths.lookup(parentId, ply.uci) ?? virtualPathIds.get(prefix);
    if (knownPath === undefined) {
      newPaths.add(prefix);
      const virtualPathId = nextVirtualPathId;
      nextVirtualPathId -= 1;
      virtualPathIds.set(prefix, virtualPathId);
      parentId = virtualPathId;
    } else {
      parentId = knownPath;
    }
    sourceKey = ply.positionAfter;
  }
  return { positions: newPositions.size, edges: newEdges.size, paths: newPaths.size };
}
