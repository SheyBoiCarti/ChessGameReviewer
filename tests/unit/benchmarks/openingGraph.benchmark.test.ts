import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import { OpeningGraphBuilder } from '@/lib/chess/graph/openingGraph';
import { serializeOpeningGraph, serializedGraphByteSize } from '@/lib/chess/graph/serialization';
import { parseGamePgn } from '@/lib/chess/pgnParser';
import type { NormalizedGameSummary } from '@/lib/api/contracts';
import { handleRequest } from '@/workers/analysis-data.worker';

const SOURCE_GAME = parseGamePgn({
  game: {
    id: 'benchmark-source',
    url: 'https://example.test/benchmark-source',
    usernameKey: 'benchmark',
    userColor: 'white',
    result: 'win',
    endedAt: 0,
    timeClass: 'blitz',
    rated: true,
    userRating: 1500,
    opponentRating: 1600,
    whitePlayer: { username: 'benchmark', rating: 1500 },
    blackPlayer: { username: 'opponent', rating: 1600 },
    rules: 'chess',
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0',
  },
});

if (!SOURCE_GAME.ok) throw new Error('Benchmark fixture must parse.');
const SOURCE_PARSED_GAME = SOURCE_GAME.game;

function games(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...SOURCE_PARSED_GAME,
    id: `benchmark-${index}`,
  }));
}

function measure(count: number) {
  const heapBefore = process.memoryUsage().heapUsed;
  const startedAt = performance.now();
  const graph = new OpeningGraphBuilder({ maxOpeningPlies: 10 }).build(games(count));
  const durationMs = performance.now() - startedAt;
  const snapshot = serializeOpeningGraph(graph, {
    queryFingerprint: `benchmark-${count}`,
    sourceGameCount: count,
    buildTimestamp: 0,
  });
  return {
    durationMs,
    graph,
    positions: graph.positions.size,
    paths: graph.paths.size,
    edges: [...graph.positions.values()].reduce((sum, node) => sum + node.outgoing.size, 0),
    serializedBytes: serializedGraphByteSize(snapshot),
    heapDeltaBytes: process.memoryUsage().heapUsed - heapBefore,
  };
}

describe('opening graph recorded benchmark', () => {
  it('parses and builds 1,000 normalized games in the analysis-data worker', async () => {
    const rawGames: NormalizedGameSummary[] = Array.from({ length: 1_000 }, (_, index) => ({
      id: `worker-benchmark-${index}`,
      url: `https://example.test/worker-benchmark-${index}`,
      usernameKey: 'benchmark',
      userColor: 'white',
      result: 'win',
      endedAt: 0,
      timeClass: 'blitz',
      rated: true,
      userRating: 1500,
      opponentRating: 1600,
      whitePlayer: { username: 'benchmark', rating: 1500 },
      blackPlayer: { username: 'opponent', rating: 1600 },
      rules: 'chess',
      pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0',
    }));
    const responses: Array<Record<string, unknown>> = [];
    const startedAt = performance.now();
    await handleRequest(
      {
        protocolVersion: 1,
        jobId: 'worker-benchmark',
        type: 'BUILD_GRAPH',
        games: rawGames,
        options: { maxOpeningPlies: 10, includeRepeatedPositions: true },
        queryFingerprint: 'worker-benchmark',
      },
      (response) => responses.push(response)
    );
    const terminal = responses.at(-1);
    console.info(
      'PHASE_2_WORKER_BENCHMARK',
      JSON.stringify({ games: 1_000, durationMs: performance.now() - startedAt })
    );
    expect(terminal).toMatchObject({
      type: 'COMPLETE',
      snapshot: { includedGameCount: 1_000 },
    });
  }, 20_000);

  it('builds the supported 1,000-game workload', () => {
    const result = measure(1_000);
    console.info(
      'PHASE_2_BENCHMARK',
      JSON.stringify({
        games: 1_000,
        durationMs: result.durationMs,
        positions: result.positions,
        paths: result.paths,
        edges: result.edges,
        serializedBytes: result.serializedBytes,
        heapDeltaBytes: result.heapDeltaBytes,
      })
    );
    expect(result.graph.includedGameCount).toBe(1_000);
  });

  it('builds the 10,000-game stress workload', () => {
    const result = measure(10_000);
    console.info(
      'PHASE_2_BENCHMARK',
      JSON.stringify({
        games: 10_000,
        durationMs: result.durationMs,
        positions: result.positions,
        paths: result.paths,
        edges: result.edges,
        serializedBytes: result.serializedBytes,
        heapDeltaBytes: result.heapDeltaBytes,
      })
    );
    expect(result.graph.includedGameCount).toBe(10_000);
  });
});
