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

export interface AsyncGraphBuildOptions {
  shouldCancel?: () => boolean;
  onProgress?: (progress: { processedGameCount: number; includedGameCount: number }) => void;
  yieldEveryGames?: number;
}

interface BuildState {
  positions: Map<string, PositionNode>;
  paths: PathStore;
  root: PositionNode | undefined;
  edgeCount: number;
  includedGameCount: number;
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
    const state = createBuildState();

    for (let gameIndex = 0; gameIndex < games.length; gameIndex += 1) {
      const limit = this.addGame(state, games[gameIndex]);
      if (limit) return snapshotFor(state, 'limited', games.length - gameIndex, limit);
    }

    return snapshotFor(state, 'complete', 0);
  }

  async buildAsync(
    games: readonly ParsedGame[],
    runtime: AsyncGraphBuildOptions = {}
  ): Promise<OpeningGraphSnapshot | undefined> {
    const state = createBuildState();
    const yieldEveryGames = runtime.yieldEveryGames ?? 25;
    if (!Number.isInteger(yieldEveryGames) || yieldEveryGames < 1) {
      throw new RangeError('INVALID_YIELD_INTERVAL');
    }

    for (let gameIndex = 0; gameIndex < games.length; gameIndex += 1) {
      if (runtime.shouldCancel?.()) return undefined;
      const limit = this.addGame(state, games[gameIndex]);
      runtime.onProgress?.({
        processedGameCount: gameIndex + 1,
        includedGameCount: state.includedGameCount,
      });
      if (limit) return snapshotFor(state, 'limited', games.length - gameIndex, limit);
      if ((gameIndex + 1) % yieldEveryGames === 0) {
        await yieldToWorkerEventLoop();
        if (runtime.shouldCancel?.()) return undefined;
      }
    }

    return runtime.shouldCancel?.() ? undefined : snapshotFor(state, 'complete', 0);
  }

  private addGame(
    state: BuildState,
    game: ParsedGame | undefined
  ): keyof GraphBuildLimits | undefined {
    if (!game || game.plies.length === 0 || !isContinuous(game)) return undefined;
    const firstPly = game.plies[0];
    if (!firstPly) return undefined;
    const rootKey = state.root?.key ?? firstPly.positionBefore;
    if (state.root && firstPly.positionBefore !== state.root.key) return undefined;
    if (!hasConsistentExistingEdges(game, state.positions)) return undefined;

    const plies = game.plies.slice(0, this.options.maxOpeningPlies);
    const additions = countAdditions(plies, state.positions, state.paths, rootKey);
    if (!state.root && !plies.some((ply) => ply.positionAfter === rootKey))
      additions.positions += 1;
    const limit = this.exceedsLimit(
      state.positions.size,
      state.edgeCount,
      state.paths.size,
      additions
    );
    if (limit) return limit;

    if (!state.root) {
      state.root = createNode(rootKey);
      state.positions.set(state.root.key, state.root);
    }

    const visit = {
      result: game.result,
      userColor: game.userColor,
      opponentRating: game.opponentRating,
    };
    addVisit(state.root.aggregate, visit);
    const visitedPositions = new Set<string>([state.root.key]);
    let source = state.root;
    let pathId = 0;
    for (const ply of plies) {
      const target =
        state.positions.get(ply.positionAfter) ??
        createAndStore(state.positions, ply.positionAfter);
      let edge = source.outgoing.get(ply.uci);
      if (!edge) {
        edge = { uci: ply.uci, san: ply.san, targetKey: target.key, aggregate: emptyOutcome() };
        source.outgoing.set(ply.uci, edge);
        state.edgeCount += 1;
      }
      if (edge.targetKey !== target.key || edge.san !== ply.san)
        throw new Error('INCONSISTENT_EDGE');
      pathId = state.paths.intern(pathId, ply.uci, ply.san);
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
    state.includedGameCount += 1;
    return undefined;
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

function createBuildState(): BuildState {
  return {
    positions: new Map(),
    paths: new PathStore(),
    root: undefined,
    edgeCount: 0,
    includedGameCount: 0,
  };
}

function snapshotFor(
  state: BuildState,
  status: OpeningGraphSnapshot['status'],
  remainingGameCount: number,
  reachedLimit?: keyof GraphBuildLimits
): OpeningGraphSnapshot {
  if (!state.root) {
    state.root = createNode('');
    state.positions.set(state.root.key, state.root);
  }
  return {
    status,
    root: state.root,
    positions: state.positions,
    paths: state.paths,
    includedGameCount: state.includedGameCount,
    remainingGameCount,
    ...(reachedLimit ? { reachedLimit } : {}),
  };
}

function yieldToWorkerEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
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
    (ply, index) =>
      index === 0 ||
      (ply.fenBefore === game.plies[index - 1]?.fenAfter &&
        ply.positionBefore === game.plies[index - 1]?.positionAfter)
  );
}

function hasConsistentExistingEdges(
  game: ParsedGame,
  positions: ReadonlyMap<string, PositionNode>
): boolean {
  return game.plies.every((ply) => {
    const edge = positions.get(ply.positionBefore)?.outgoing.get(ply.uci);
    return !edge || (edge.targetKey === ply.positionAfter && edge.san === ply.san);
  });
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
