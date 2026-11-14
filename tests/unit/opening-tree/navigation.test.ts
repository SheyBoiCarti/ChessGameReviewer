import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';

import {
  createGraphNavigation,
  appendVisitedEntry,
  navigateBack,
  navigateCandidate,
  navigateToHistoryIndex,
  navigationBreadcrumbs,
  perspectiveLabels,
  resolveBoardMoveInGraph,
  replayGraphNavigation,
} from '@/features/opening-tree/navigation';
import { OpeningGraphBuilder } from '@/lib/chess/graph/openingGraph';
import { parseGamePgn } from '@/lib/chess/pgnParser';
import { normalizePositionKey } from '@/lib/chess/fen';
import { deserializeOpeningGraph, serializeOpeningGraph } from '@/lib/chess/graph/serialization';
import type { OpeningGraphSnapshot } from '@/lib/chess/graph/openingGraph';
import type { AppliedBoardMove } from '@/features/board/moves';
import type { MoveEdge } from '@/lib/chess/graph/types';

/**
 * T36–T38: the visited history is the actual replayed line. These tests use a
 * legal graph built from parsed PGN games; fake position labels such as
 * `root` cannot establish full-FEN behavior.
 */
describe('opening graph navigation', () => {
  it('preserves the visited sequence with actual SAN and full FEN across a transposition', () => {
    const graph = legalGraph();
    let state = createGraphNavigation(graph);
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'g1f3'));
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'd7d5'));
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'd2d4'));
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'g8f6'));

    expect(state.san).toBe('Nf6');
    expect(state.uci).toBe('g8f6');
    expect(normalizePositionKey(state.fen)).toBe(state.positionKey);
    expect(state.history.map((entry) => entry.san)).toEqual([null, 'Nf3', 'd5', 'd4', 'Nf6']);
    for (const entry of state.history) {
      expect(entry.fen.split(' ')).toHaveLength(6);
    }

    // The alternate route reaches the same normalized position with an equal FEN.
    const root = navigateToHistoryIndex(state, 0);
    let second = navigateCandidate(graph, root, edgeAt(graph, root, 'd2d4'));
    second = navigateCandidate(graph, second, edgeAt(graph, second, 'd7d5'));
    second = navigateCandidate(graph, second, edgeAt(graph, second, 'g1f3'));
    second = navigateCandidate(graph, second, edgeAt(graph, second, 'g8f6'));
    expect(second.positionKey).toBe(state.positionKey);
    expect(normalizePositionKey(second.fen)).toBe(normalizePositionKey(state.fen));
    // Full FENs keep their own clocks: a four-field key is not the full position.
    expect(second.fen).not.toBe(state.fen);
    // Each actual route keeps its own stored arrival ID; routes are not merged.
    expect(second.pathId).not.toBe(state.pathId);
    expect(navigationBreadcrumbs(graph, state)).toEqual(['Nf3', 'd5', 'd4', 'Nf6']);
  });

  it('moves the cursor without truncating history so Back preserves redo', () => {
    const graph = legalGraph();
    let state = createGraphNavigation(graph);
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'e2e4'));
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'e7e5'));

    const back = navigateToHistoryIndex(state, 0);
    expect(back.history).toHaveLength(state.history.length);
    expect(back.cursor).toBe(0);
    expect(back.history[back.cursor]).toEqual(back.history[0]);
    expect(back.fen).toBe(createGraphNavigation(graph).fen);

    const forward = navigateToHistoryIndex(back, state.cursor);
    expect(forward.fen).toBe(state.fen);
    expect(forward.positionKey).toBe(state.positionKey);
  });

  it('choosing a new branch after Back truncates only the future', () => {
    const graph = legalGraph();
    let state = createGraphNavigation(graph);
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'e2e4'));
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'e7e5'));
    const back = navigateToHistoryIndex(state, 0);

    const branched = navigateCandidate(graph, back, edgeAt(graph, back, 'd2d4'));
    expect(branched.history).toHaveLength(2);
    expect(branched.san).toBe('d4');
    expect(branched.history.map((entry) => entry.san)).toEqual([null, 'd4']);
  });

  it('rejects unknown positions, inconsistent moves, and invalid history indexes', () => {
    const graph = legalGraph();
    const state = createGraphNavigation(graph);
    expect(() =>
      navigateCandidate(graph, state, { targetKey: 'missing', uci: 'e2e4', san: 'e4' })
    ).toThrow('UNKNOWN_GRAPH_POSITION');
    expect(() =>
      navigateCandidate(graph, state, {
        targetKey: normalizePositionKey(new Chess().fen()),
        uci: 'e2e4',
      })
    ).toThrow('INCONSISTENT_GRAPH_MOVE');
    expect(() => navigateToHistoryIndex(state, -1)).toThrow('INVALID_GRAPH_HISTORY_INDEX');
    expect(() => navigateToHistoryIndex(state, 0.5)).toThrow('INVALID_GRAPH_HISTORY_INDEX');
    expect(() => navigateToHistoryIndex(state, 1)).toThrow('INVALID_GRAPH_HISTORY_INDEX');
    expect(navigateBack(state)).toEqual(state);
  });

  it('labels user and board outcome perspectives independently', () => {
    expect(perspectiveLabels('user')).toEqual(['User win', 'Draw', 'User loss']);
    expect(perspectiveLabels('board')).toEqual(['White win', 'Draw', 'Black win']);
  });

  it('resolves an observed board move in the graph', () => {
    const graph = legalGraph();
    const appliedMove = appliedFrom(graph.rootFen!, 'e2e4');

    const result = resolveBoardMoveInGraph(graph, graph.root.key, 0, appliedMove);
    expect(result.observed).toBe(true);
    expect(result.nextPositionKey).toBe(appliedTargetKey(graph.rootFen!, 'e2e4'));
    expect(result.nextPathId).toBeGreaterThan(0);
  });

  it('keeps an observed transposed move playable with a null exact path', () => {
    const graph = legalGraph();
    // Route through the short game: Nf3 d5 d4 Nf6 reaches the shared position.
    let state = createGraphNavigation(graph);
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'g1f3'));
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'd7d5'));
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'd2d4'));
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'g8f6'));
    expect(state.pathId).not.toBeNull();

    // e3 exists position-wide at this node only through the alternate arrival.
    const applied = appliedFrom(state.fen, 'e2e3');
    const result = resolveBoardMoveInGraph(graph, state.positionKey, state.pathId, applied);
    expect(result.observed).toBe(true);
    expect(normalizePositionKey(result.nextFen)).toBe(result.nextPositionKey);
    expect(result.nextPathId).toBeNull();
  });

  it('returns an unobserved result with the actual position key for a legal novelty', () => {
    const graph = legalGraph();
    const unobservedMove = appliedFrom(graph.rootFen!, 'c2c4');

    const result = resolveBoardMoveInGraph(graph, graph.root.key, 0, unobservedMove);
    expect(result.observed).toBe(false);
    expect(result.warning).toMatch(/not appear in your imported games/i);
    expect(result.nextPathId).toBeNull();
    expect(normalizePositionKey(result.nextFen)).toBe(result.nextPositionKey);
  });

  it('keeps actual repetitions and their full-FEN clocks in the visited sequence', () => {
    const graph = legalGraph(['1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 1-0']);
    let state = createGraphNavigation(graph);
    for (const uci of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6']) {
      state = navigateCandidate(graph, state, edgeAt(graph, state, uci));
    }
    expect(state.history[4]!.positionKey).toBe(state.history[0]!.positionKey);
    expect(state.history[4]!.fen).not.toBe(state.history[0]!.fen);
    expect(state.history[4]!.fen.split(' ').slice(4)).toEqual(['4', '3']);
    expect(replayGraphNavigation(state, graph)).toEqual(state);
  });

  it('traverses a graph promotion with the actual suffix, SAN and resulting piece', () => {
    const promotionFen = '8/P6k/8/8/8/8/7K/8 w - - 0 1';
    const graph = legalGraph([`[SetUp "1"]\n[FEN "${promotionFen}"]\n\n1. a8=Q 1-0`]);
    const root = createGraphNavigation(graph);
    const promoted = navigateCandidate(graph, root, edgeAt(graph, root, 'a7a8q'));
    expect(promoted.san).toBe('a8=Q');
    expect(promoted.uci).toBe('a7a8q');
    expect(new Chess(promoted.fen).get('a8')).toEqual({ type: 'q', color: 'w' });
    expect(replayGraphNavigation(promoted, graph)).toEqual(promoted);
  });

  it('preserves a nonstandard root side, clocks and move numbers from the included game', () => {
    const rootFen = '8/7k/8/8/8/8/P6K/8 b - - 17 42';
    const graph = legalGraph([
      '1-0', // Canonically first but zero-ply: not a graph-included source.
      `[SetUp "1"]\n[FEN "${rootFen}"]\n\n42... Kh6 43. a3 1-0`,
    ]);
    const restored = deserializeOpeningGraph(
      serializeOpeningGraph(graph, {
        queryFingerprint: 'custom-root',
        sourceGameCount: 2,
        buildTimestamp: 0,
      })
    );
    expect(restored.rootFen).toBe(rootFen);
    let state = createGraphNavigation(graph);
    expect(state.fen).toBe(rootFen);
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'h7h6'));
    expect(state.fen.split(' ').slice(4)).toEqual(['18', '43']);
    state = navigateCandidate(graph, state, edgeAt(graph, state, 'a2a3'));
    expect(state.fen.split(' ').slice(4)).toEqual(['0', '43']);
  });

  it('requires an actual full root FEN instead of inventing counters', () => {
    const graph = legalGraph();
    const missingRoot = { ...graph };
    delete missingRoot.rootFen;
    expect(() => createGraphNavigation(missingRoot)).toThrow('INVALID_GRAPH_ROOT_FEN');
  });

  it('replays the redo tail and resolves arrival IDs against a changed graph', () => {
    const graph = legalGraph(['1. e4 e5 1-0']);
    let state = createGraphNavigation(graph);
    for (const uci of ['e2e4', 'e7e5']) {
      state = navigateCandidate(graph, state, edgeAt(graph, state, uci));
    }
    const back = navigateToHistoryIndex(state, 1);
    expect(replayGraphNavigation(back, graph)).toEqual(back);

    const changed = legalGraph(['1. d4 d5 1-0', '1. e4 e5 1-0']);
    const restored = replayGraphNavigation(back, changed);
    expect(restored.cursor).toBe(1);
    expect(restored.history).toHaveLength(3);
    expect(restored.history[1]!.pathId).not.toBe(back.history[1]!.pathId);
    expect(restored.history[1]!.pathId).toBe(changed.paths.lookup(0, 'e2e4'));
    expect(navigateToHistoryIndex(restored, 2).fen).toBe(state.fen);
  });

  it('retains the valid prefix and clamps the cursor when a recorded edge disappears', () => {
    const graph = legalGraph(['1. e4 e5 2. Nf3 1-0']);
    let state = createGraphNavigation(graph);
    for (const uci of ['e2e4', 'e7e5', 'g1f3']) {
      state = navigateCandidate(graph, state, edgeAt(graph, state, uci));
    }
    const changed = legalGraph(['1. e4 c5 1-0']);
    const restored = replayGraphNavigation(state, changed);
    expect(restored.history.map((entry) => entry.san)).toEqual([null, 'e4']);
    expect(restored.cursor).toBe(1);
    expect(replayGraphNavigation(navigateToHistoryIndex(state, 0), changed).cursor).toBe(0);
  });

  it('legally replays a terminal novelty and rejects an illegal saved novelty', () => {
    const graph = legalGraph();
    const root = createGraphNavigation(graph);
    const move = appliedFrom(root.fen, 'a2a3');
    const unknown = appendVisitedEntry(root, {
      positionKey: normalizePositionKey(move.fenAfter),
      fen: move.fenAfter,
      pathId: null,
      uci: move.uci,
      san: move.san,
      observed: false,
    });
    expect(replayGraphNavigation(unknown, graph)).toEqual(unknown);
    const redo = replayGraphNavigation(navigateBack(unknown), graph);
    expect(redo.cursor).toBe(0);
    expect(redo.history).toHaveLength(2);
    const invalidEntry = { ...unknown.history[1]!, uci: 'a2a5' };
    expect(replayGraphNavigation(appendVisitedEntry(root, invalidEntry), graph)).toEqual(root);
  });

  it('never assigns arbitrary observed prefixes when replaying a transposition', () => {
    const graph = legalGraph();
    let state = createGraphNavigation(graph);
    for (const uci of ['g1f3', 'd7d5', 'd2d4', 'g8f6', 'e2e3', 'e7e6']) {
      state = navigateCandidate(graph, state, edgeAt(graph, state, uci));
    }
    expect(state.pathId).toBeNull();
    expect(replayGraphNavigation(state, graph)).toEqual(state);
  });
});

function legalGraph(
  pgns = ['1. d4 d5 2. Nf3 Nf6 3. e3 e6 1-0', '1. Nf3 d5 2. d4 Nf6 1-0', '1. e4 e5 1-0']
): OpeningGraphSnapshot {
  const games = pgns.map((moves, index) => {
    const parsed = parseGamePgn({
      game: {
        id: `legal-${index}`,
        url: `https://example.test/legal-${index}`,
        usernameKey: 'alice',
        userColor: 'white',
        result: 'win',
        endedAt: index,
        timeClass: 'blitz',
        rated: true,
        userRating: 1500,
        opponentRating: 1600,
        whitePlayer: { username: 'alice', rating: 1500 },
        blackPlayer: { username: 'bob', rating: 1600 },
        rules: 'chess',
        pgn: moves,
      },
    });
    if (!parsed.ok) throw new Error('Fixture should parse');
    return parsed.game;
  });
  const graph = new OpeningGraphBuilder({ maxOpeningPlies: 6 }).build(games);
  if (!graph.rootFen) throw new Error('Fixture graph should carry a full root FEN');
  return graph;
}

function edgeAt(
  graph: OpeningGraphSnapshot,
  state: ReturnType<typeof createGraphNavigation>,
  uci: string
): MoveEdge {
  const node = graph.positions.get(state.positionKey);
  const edge = node?.outgoing.get(uci);
  if (!edge) throw new Error(`Fixture edge missing: ${uci}`);
  return edge;
}

function appliedFrom(fen: string, uci: string): AppliedBoardMove {
  const chess = new Chess(fen);
  const move = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci.length > 4 ? { promotion: uci.slice(4) } : {}),
  });
  return {
    from: uci.slice(0, 2) as AppliedBoardMove['from'],
    to: uci.slice(2, 4) as AppliedBoardMove['to'],
    uci,
    san: move.san,
    fenBefore: fen,
    fenAfter: chess.fen(),
  };
}

function appliedTargetKey(fen: string, uci: string): string {
  const chess = new Chess(fen);
  chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
  return normalizePositionKey(chess.fen());
}
