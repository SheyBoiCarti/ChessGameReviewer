import { describe, expect, it } from 'vitest';

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
        mode: 'unavailable',
        crossOriginIsolated: false,
        sharedArrayBuffer: false,
        simd: false,
        engineInitialized: false,
        reason: 'Test engine unavailable.',
        threads: 0,
        hashMb: 16,
      }),
      dispose: () => {
        counters.engineDispose += 1;
      },
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
