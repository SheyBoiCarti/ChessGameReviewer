import { describe, expect, it, vi } from 'vitest';

import type { GameQuery } from '@/lib/api/contracts';
import type { GameRecord } from '@/lib/db/schema';
import type { IngestionResult } from '@/features/ingestion/types';
import {
  createWorkspaceController,
  type WorkspaceServices,
} from '@/features/workspace/createWorkspaceController';

const firstQuery: GameQuery = {
  username: 'first-player',
  maxGames: 500,
  timeClasses: ['rapid'],
  colors: ['white', 'black'],
};

const secondQuery: GameQuery = { ...firstQuery, username: 'second-player' };

const game: GameRecord = {
  id: 'game-1',
  username: 'second-player',
  url: 'https://www.chess.com/game/live/1',
  userColor: 'white',
  result: 'win',
  endedAt: 1_700_000_000,
  timeClass: 'rapid',
  rated: true,
  userRating: 1800,
  opponentRating: 1775,
  pgn: '[Result "1-0"]\n\n1. e4 e5 1-0',
  rules: 'chess',
};

describe('workspace controller', () => {
  it('ignores a stale first query after a rapid second submission', async () => {
    const first = deferred<IngestionResult>();
    const second = deferred<IngestionResult>();
    const services = createServices((query) =>
      query.username === firstQuery.username ? first.promise : second.promise
    );
    const controller = createWorkspaceController(services);

    const firstSubmission = controller.submitQuery(firstQuery);
    const secondSubmission = controller.submitQuery(secondQuery);
    first.resolve(result(firstQuery, []));
    second.resolve(result(secondQuery, [game]));
    await Promise.all([firstSubmission, secondSubmission]);

    expect(controller.getState().query.active?.username).toBe('second-player');
    expect(controller.getState().ingestion.result?.games).toEqual([game]);
    expect(controller.getState().graph.status).toBe('complete');
  });

  it('publishes progress only for the current query token', async () => {
    const pending = deferred<IngestionResult>();
    let reportProgress: WorkspaceServices['ingestion']['start'] extends (
      query: GameQuery,
      options: infer T
    ) => Promise<IngestionResult>
      ? T
      : never;
    const services = createServices((_query, options) => {
      reportProgress = options;
      return pending.promise;
    });
    const controller = createWorkspaceController(services);
    const submission = controller.submitQuery(firstQuery);

    reportProgress!.onProgress?.({
      jobId: 'job-1',
      phase: 'fetching',
      monthsPlanned: 2,
      monthsCompleted: 1,
      recordsFetched: 20,
      recordsAccepted: 18,
      recordsExcluded: 2,
      recordsFailed: 0,
      diagnostics: [],
    });

    expect(controller.getState().ingestion.progress?.monthsCompleted).toBe(1);
    pending.resolve(result(firstQuery, []));
    await submission;
  });

  it('cancels active work and disposes owned graph and engine resources once', () => {
    const counters = { ingestionCancel: 0, graphCancel: 0, graphDispose: 0, engineDispose: 0 };
    const services = createServices(async () => result(firstQuery, []), counters);
    const controller = createWorkspaceController(services);

    controller.cancelIngestion();
    controller.dispose();
    controller.dispose();

    expect(counters).toEqual({
      ingestionCancel: 2,
      graphCancel: 1,
      graphDispose: 1,
      engineDispose: 1,
    });
  });

  it('invalidates the active in-memory snapshot after deleting that username', async () => {
    const services = createServices(async () => result(secondQuery, [game]));
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);

    await controller.deleteUserData('SECOND-PLAYER');

    expect(controller.getState().query.active).toBeNull();
    expect(controller.getState().graph.snapshot).toBeNull();
    expect(controller.getState().selection.gameId).toBeNull();
  });

  it('cancels and ignores selected-game analysis after the game selection changes', async () => {
    const pending = deferred<Awaited<ReturnType<WorkspaceServices['analysis']['analyze']>>>();
    const services = createServices(async () => result(secondQuery, [game]));
    services.analysis.analyze = (_game, _strength, _capability, _context, signal) => {
      expect(signal.aborted).toBe(false);
      return pending.promise;
    };
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    controller.selectGame(game.id);
    await controller.probeEngine();

    const analysis = controller.startAnalysis('quick');
    controller.selectGame(null);
    const emptyBreakdown = {
      brilliant: 0,
      great: 0,
      best: 0,
      excellent: 0,
      good: 0,
      book: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
      miss: 0,
      forced: 0,
    };
    pending.resolve({
      status: 'complete',
      annotations: [],
      analyzedPlies: 0,
      totalPlies: 0,
      summary: {
        white: {
          accuracyEstimate: null,
          eligibleMoves: 0,
          excludedMoves: 0,
          breakdown: emptyBreakdown,
        },
        black: {
          accuracyEstimate: null,
          eligibleMoves: 0,
          excludedMoves: 0,
          breakdown: emptyBreakdown,
        },
      },
    });
    await analysis;

    expect(controller.getState().selection.gameId).toBeNull();
    expect(controller.getState().analysis.result).toBeNull();
  });

  it('runs analysis progress, cancellation, navigation, clearing, and engine fallback paths', async () => {
    const emptyBreakdown = {
      brilliant: 0,
      great: 0,
      best: 0,
      excellent: 0,
      good: 0,
      book: 0,
      inaccuracy: 0,
      mistake: 0,
      blunder: 0,
      miss: 0,
      forced: 0,
    };
    const services = createServices(async () => result(secondQuery, [game]));
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery, { manualRefresh: true });
    controller.selectGame(game.id);
    controller.navigateGraph('position', 2);
    controller.selectPly(1);
    await controller.probeEngine();
    services.analysis.analyze = async (
      _game,
      _strength,
      _capability,
      _context,
      _signal,
      progress
    ) => {
      progress({ analyzedPlies: 1, totalPlies: 2 });
      return {
        status: 'partial',
        annotations: [],
        analyzedPlies: 1,
        totalPlies: 2,
        summary: {
          white: {
            accuracyEstimate: null,
            eligibleMoves: 0,
            excludedMoves: 0,
            breakdown: emptyBreakdown,
          },
          black: {
            accuracyEstimate: null,
            eligibleMoves: 0,
            excludedMoves: 0,
            breakdown: emptyBreakdown,
          },
        },
      };
    };

    await controller.startAnalysis('deep');
    expect(controller.getState().analysis).toMatchObject({
      status: 'partial',
      progress: { analyzedPlies: 1, totalPlies: 2 },
    });
    controller.cancelAnalysis();
    expect(controller.getState().analysis.status).toBe('cancelled');
    await controller.clearAllData();
    expect(controller.getState().query.active).toBeNull();

    services.engine.initialize = vi.fn(async () => {
      throw new Error('Engine blocked');
    });
    await controller.probeEngine();
    expect(controller.getState().analysis).toMatchObject({
      status: 'unavailable',
      error: 'Engine blocked',
    });
  });

  it('exposes typed ingestion, graph, and analysis failures', async () => {
    const ingestionServices = createServices(async () => {
      throw new Error('Network failed');
    });
    const ingestionController = createWorkspaceController(ingestionServices);
    await ingestionController.submitQuery(firstQuery);
    expect(ingestionController.getState().ingestion).toMatchObject({
      status: 'failed',
      error: 'Network failed',
    });

    const graphServices = createServices(async () => result(secondQuery, [game]));
    graphServices.graph.build = vi.fn(async () => {
      throw new Error('Graph failed');
    });
    const graphController = createWorkspaceController(graphServices);
    await graphController.submitQuery(secondQuery);
    expect(graphController.getState().graph).toMatchObject({
      status: 'failed',
      error: 'Graph failed',
    });

    const analysisServices = createServices(async () => result(secondQuery, [game]));
    analysisServices.analysis.analyze = vi.fn(async () => {
      throw new Error('Analysis failed');
    });
    const analysisController = createWorkspaceController(analysisServices);
    await analysisController.submitQuery(secondQuery);
    analysisController.selectGame(game.id);
    await analysisController.probeEngine();
    await analysisController.startAnalysis();
    expect(analysisController.getState().analysis).toMatchObject({
      status: 'failed',
      error: 'Analysis failed',
    });
  });
});

function createServices(
  start: WorkspaceServices['ingestion']['start'],
  counters = { ingestionCancel: 0, graphCancel: 0, graphDispose: 0, engineDispose: 0 }
): WorkspaceServices {
  return {
    ingestion: {
      start,
      cancel: () => {
        counters.ingestionCancel += 1;
      },
    },
    graph: {
      build: async (_games, options, fingerprint) => ({
        status: 'complete',
        snapshot: {
          formatVersion: 1,
          queryFingerprint: fingerprint,
          sourceGameCount: 1,
          excludedGameCount: 0,
          openingHorizon: options.maxOpeningPlies,
          buildTimestamp: 1,
          status: 'complete',
          rootKey: 'root-position',
          includedGameCount: 1,
          remainingGameCount: 0,
          positions: [],
          paths: [],
        },
      }),
      cancel: () => {
        counters.graphCancel += 1;
      },
      dispose: () => {
        counters.graphDispose += 1;
      },
    },
    engine: {
      initialize: async () => ({
        mode: 'single-thread',
        crossOriginIsolated: false,
        sharedArrayBuffer: false,
        simd: false,
        engineInitialized: true,
        threads: 1,
        hashMb: 16,
      }),
      dispose: () => {
        counters.engineDispose += 1;
      },
    },
    data: {
      deleteUsername: async (username) => ({
        username: username.toLowerCase(),
        gamesDeleted: 1,
        archiveSyncDeleted: 1,
        graphSnapshotsDeleted: 1,
      }),
      clearAll: async () => ({ clearedStores: ['games'] }),
      dispose: () => undefined,
    },
    analysis: {
      analyze: async () => ({
        status: 'complete',
        annotations: [],
        analyzedPlies: 0,
        totalPlies: 0,
        summary: {
          white: {
            accuracyEstimate: null,
            eligibleMoves: 0,
            excludedMoves: 0,
            breakdown: {
              brilliant: 0,
              great: 0,
              best: 0,
              excellent: 0,
              good: 0,
              book: 0,
              inaccuracy: 0,
              mistake: 0,
              blunder: 0,
              miss: 0,
              forced: 0,
            },
          },
          black: {
            accuracyEstimate: null,
            eligibleMoves: 0,
            excludedMoves: 0,
            breakdown: {
              brilliant: 0,
              great: 0,
              best: 0,
              excellent: 0,
              good: 0,
              book: 0,
              inaccuracy: 0,
              mistake: 0,
              blunder: 0,
              miss: 0,
              forced: 0,
            },
          },
        },
      }),
    },
  };
}

function result(query: GameQuery, games: GameRecord[]): IngestionResult {
  return {
    jobId: `job-${query.username}`,
    fingerprint: `fingerprint-${query.username}`,
    status: 'complete',
    games,
    failedMonths: [],
    diagnostics: [],
    offlineCacheOnly: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
