import { describe, expect, it, vi } from 'vitest';

import { createLongGameAnalysisResult } from '../../fixtures/longAnalysisFixture';
import type { AnalysisUpdate } from '@/features/stockfish-analysis/analyzeGame';
import type { GameQuery } from '@/lib/api/contracts';
import type { GameRecord } from '@/lib/db/schema';
import type { IngestionBatch, IngestionResult } from '@/features/ingestion/types';
import {
  createWorkspaceController,
  type WorkspaceServices,
} from '@/features/workspace/createWorkspaceController';
import { GraphService } from '@/features/opening-tree/graphService';

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
  whitePlayer: { username: 'second-player', rating: 1800 },
  blackPlayer: { username: 'opponent', rating: 1775 },
  pgn: '[Result "1-0"]\n\n1. e4 e5 1-0',
  rules: 'chess',
};

describe('workspace controller', () => {
  it('publishes unique completed moves and rejects updates after changing games', async () => {
    const second = { ...game, id: 'second' };
    const services = createServices(async () => result(secondQuery, [game, second]));
    const pending = deferred<ReturnType<typeof createLongGameAnalysisResult>>();
    let publish: ((update: AnalysisUpdate) => void) | undefined;
    services.analysis.analyze = (
      _game,
      _strength,
      _capability,
      _context,
      _signal,
      _progress,
      onUpdate
    ) => {
      publish = onUpdate;
      return pending.promise;
    };
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    controller.selectGame(game.id);
    await controller.probeEngine();
    const run = controller.startAnalysis();
    await vi.waitFor(() => expect(publish).toBeDefined());
    const completed = createLongGameAnalysisResult(2);
    publish!({ annotation: completed.annotations[0]!, analyzedPlies: 1, totalPlies: 8 });
    publish!({ annotation: completed.annotations[0]!, analyzedPlies: 1, totalPlies: 8 });
    publish!({ annotation: completed.annotations[1]!, analyzedPlies: 2, totalPlies: 8 });
    expect(controller.getState().analysis.progress).toEqual({ analyzedPlies: 2, totalPlies: 8 });
    controller.selectGame(second.id);
    const state = controller.getState();
    publish!({ annotation: completed.annotations[0]!, analyzedPlies: 3, totalPlies: 8 });
    expect(controller.getState()).toBe(state);
    pending.resolve({ ...completed, status: 'cancelled' });
    await run;
    expect(controller.getState().selection.gameId).toBe(second.id);
    expect(controller.getState().analysis.result).toBeNull();
    controller.dispose();
  });

  it('restores the selected review before reading remaining reviews and without waiting for the graph', async () => {
    const other = { ...game, id: 'other', endedAt: game.endedAt - 1 };
    const services = createServices(async () => result(secondQuery, [game, other]));
    const saved = createLongGameAnalysisResult(1);
    const selected = deferred<typeof saved | null>();
    const graph = deferred<Awaited<ReturnType<WorkspaceServices['graph']['build']>>>();
    services.analysis.restoreSelected = vi.fn(() => selected.promise);
    services.analysis.restore = vi.fn(async () => ({}));
    services.graph.build = vi.fn(() => graph.promise);
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    await vi.waitFor(() =>
      expect(services.analysis.restoreSelected).toHaveBeenCalledWith(game, 'balanced')
    );
    expect(services.analysis.restore).not.toHaveBeenCalled();
    expect(controller.getState().graph.status).toBe('building');
    selected.resolve(saved);
    await vi.waitFor(() => expect(controller.getState().analysis.result).toEqual(saved));
    await vi.waitFor(() =>
      expect(services.analysis.restore).toHaveBeenCalledWith([other], 'balanced')
    );
    controller.dispose();
  });

  it('makes imported games available while graph construction is pending', async () => {
    const services = createServices(async () => result(secondQuery, [game]));
    const graph = deferred<Awaited<ReturnType<WorkspaceServices['graph']['build']>>>();
    services.graph.build = vi.fn(() => graph.promise);
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    expect(controller.getState().ingestion.result?.games[0]?.id).toBe(game.id);
    expect(controller.getState().graph.status).toBe('building');
    controller.dispose();
  });

  it('builds an independent scoped opening graph and ignores stale graph requests (T40)', async () => {
    const black = { ...game, id: 'game-2', userColor: 'black' as const, endedAt: 2_000_000 };
    const services = createServices(async () => result(secondQuery, [game, black]));
    const baseline = services.graph.build;
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    expect(controller.getState().graph.scope).toBe('both');
    expect(controller.getState().graph.datasetRevision).toBeTruthy();

    const calls: unknown[][] = [];
    services.graph.build = async (games, options, fingerprint) => {
      calls.push([games, options, fingerprint]);
      return baseline(games, options, fingerprint);
    };

    await controller.requestOpeningGraph('white');
    expect(controller.getState().graph.scope).toBe('white');
    expect(controller.getState().graph.snapshot?.queryFingerprint).toBe(
      'fingerprint-second-player'
    );

    await controller.requestOpeningGraph('black');
    expect(controller.getState().graph.scope).toBe('black');

    // Each scoped build receives only its color's metadata-filtered records.
    expect(calls).toHaveLength(2);
    expect(calls[0]![0]).toHaveLength(1);
    expect((calls[0]![0] as { userColor: string }[])[0]?.userColor).toBe('white');
    expect(calls[1]![0]).toHaveLength(1);
    expect((calls[1]![0] as { userColor: string }[])[0]?.userColor).toBe('black');

    // A late superseded result does not install over a newer request.
    const slowWhite = deferred<Awaited<ReturnType<WorkspaceServices['graph']['build']>>>();
    services.graph.build = async () => slowWhite.promise;
    const stale = controller.requestOpeningGraph('white');
    services.graph.build = baseline;
    await controller.requestOpeningGraph('black');
    expect(controller.getState().graph.scope).toBe('black');
    slowWhite.resolve({
      status: 'complete',
      snapshot: {
        formatVersion: 2,
        rootFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        includedGameIds: [],
        positionGameIds: [],
        prefixGameIds: [],
        queryFingerprint: 'fp-1',
        sourceGameCount: 1,
        excludedGameCount: 0,
        openingHorizon: 30,
        buildTimestamp: 1,
        status: 'complete',
        rootKey: 'root-position',
        includedGameCount: 1,
        remainingGameCount: 0,
        positions: [],
        paths: [],
      },
    });
    await stale;
    expect(controller.getState().graph.scope).toBe('black');
    controller.dispose();
  });

  it('keeps displayed graph identity until success and rejects stale failures', async () => {
    const services = createServices(async () =>
      result(secondQuery, [game, { ...game, id: 'black', userColor: 'black' }])
    );
    const baseline = services.graph.build;
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    const displayed = controller.getState().graph;
    let rejectOld!: (error: Error) => void;
    services.graph.build = () =>
      new Promise((_resolve, reject) => {
        rejectOld = reject;
      });
    const old = controller.requestOpeningGraph('white');
    expect(controller.getState().graph).toMatchObject({
      snapshot: displayed.snapshot,
      scope: 'both',
      datasetRevision: displayed.datasetRevision,
    });
    services.graph.build = baseline;
    await controller.requestOpeningGraph('black');
    const latest = controller.getState().graph;
    rejectOld(new Error('late worker failure'));
    await old;
    expect(controller.getState().graph).toBe(latest);
    controller.dispose();
  });

  it('T49: White -> Black -> White reuses memory snapshot with zero worker build calls', async () => {
    const services = createServices(async () =>
      result(secondQuery, [game, { ...game, id: 'black', userColor: 'black' }])
    );
    const originalBuild = services.graph.build;
    const workerBuildSpy = vi.fn(originalBuild);
    const graphService = new GraphService({ build: workerBuildSpy });
    services.graph = graphService;

    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    expect(workerBuildSpy).toHaveBeenCalledTimes(1);

    await controller.requestOpeningGraph('white');
    expect(workerBuildSpy).toHaveBeenCalledTimes(2);

    await controller.requestOpeningGraph('black');
    expect(workerBuildSpy).toHaveBeenCalledTimes(3);

    await controller.requestOpeningGraph('white');
    expect(workerBuildSpy).toHaveBeenCalledTimes(3);

    controller.dispose();
  });

  it('T51: publishes validated batches without resetting active selection or review', async () => {
    let reportBatch!: (batch: IngestionBatch) => void;
    let finishIngestion!: (res: IngestionResult) => void;
    const selectedGame: GameRecord = { ...game, id: 'selected-1', pgn: '1. e4 e5 1-0' };
    const olderGame: GameRecord = {
      ...game,
      id: 'older-2',
      pgn: '1. d4 d5 1-0',
      endedAt: game.endedAt - 1000,
    };

    const services = createServices(async (_query, options) => {
      reportBatch = options.onBatch!;
      return new Promise<IngestionResult>((resolve) => {
        finishIngestion = resolve;
      });
    });

    const controller = createWorkspaceController(services);
    const queryPromise = controller.submitQuery(secondQuery);

    // Initial batch arrival
    reportBatch({
      jobId: 'job-1',
      fingerprint: 'fp-1',
      sequence: 1,
      datasetRevision: 'one',
      games: [selectedGame],
    });

    // User opens review on the batch game
    await controller.openReview(selectedGame.id);
    controller.selectPly(2);
    const before = controller.getState();
    expect(before.selection.gameId).toBe(selectedGame.id);
    expect(before.selection.ply).toBe(2);

    // Second batch arrival with additional older game
    reportBatch({
      jobId: 'job-1',
      fingerprint: 'fp-1',
      sequence: 2,
      datasetRevision: 'two',
      games: [selectedGame, olderGame],
    });

    // Verification: selection, analysis, and loading status preserved
    expect(controller.getState().selection).toEqual(before.selection);
    expect(controller.getState().analysis).toEqual(before.analysis);
    expect(controller.getState().ingestion.status).toBe('loading');

    // Terminal result arrives
    finishIngestion(result(secondQuery, [selectedGame, olderGame]));
    await queryPromise;

    // Review remains stable after terminal result
    expect(controller.getState().selection.gameId).toBe(selectedGame.id);
    expect(controller.getState().selection.ply).toBe(2);
    expect(controller.getState().ingestion.status).toBe('complete');

    controller.dispose();
  });

  it('keeps unscoped repertoire context and Review selection across scope builds', async () => {
    const services = createServices(async () =>
      result(secondQuery, [game, { ...game, id: 'black', userColor: 'black' }])
    );
    services.engine.initialize = vi.fn(services.engine.initialize);
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    controller.selectPly(1);
    const selection = controller.getState().selection;
    const context = controller.getState().repertoire;
    expect(context).toBeTruthy();
    await controller.requestOpeningGraph('white');
    await controller.requestOpeningGraph('black');
    expect(controller.getState().repertoire).toBe(context);
    expect(controller.getState().selection.gameId).toBe(selection.gameId);
    expect(controller.getState().selection.ply).toBe(1);
    expect(services.engine.initialize).not.toHaveBeenCalled();
    controller.dispatch({ type: 'preferences/changed', preferences: { openingHorizon: 10 } });
    await controller.requestOpeningGraph('black');
    expect(controller.getState().repertoire?.horizon).toBe(10);
    controller.dispose();
  });

  it('keeps existing content when the requested color was excluded from import', async () => {
    const whiteOnly = { ...secondQuery, colors: ['white'] as const };
    const services = createServices(async () =>
      result({ ...whiteOnly, colors: ['white'] }, [game])
    );
    services.graph.build = vi.fn(services.graph.build);
    const controller = createWorkspaceController(services);
    await controller.submitQuery({ ...whiteOnly, colors: ['white'] });
    await controller.requestOpeningGraph('white');
    const displayed = controller.getState().graph;
    const calls = vi.mocked(services.graph.build).mock.calls.length;
    await controller.requestOpeningGraph('black');
    expect(controller.getState().graph).toBe(displayed);
    expect(services.graph.build).toHaveBeenCalledTimes(calls);
    expect(controller.getState().query.active?.colors).toEqual(['white']);
    controller.dispose();
  });

  it('opens a review once on double activation and preserves the same game ply', async () => {
    const services = createServices(async () => result(secondQuery, [game]));
    services.analysis.analyze = vi.fn(services.analysis.analyze);
    services.engine.initialize = vi.fn(services.engine.initialize);
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    controller.selectGame(game.id);
    controller.selectPly(1);
    await Promise.all([controller.openReview(game.id), controller.openReview(game.id)]);
    expect(services.analysis.analyze).toHaveBeenCalledTimes(1);
    expect(services.engine.initialize).toHaveBeenCalledTimes(1);
    expect(controller.getState().selection.ply).toBe(1);
    await controller.openReview(game.id);
    expect(services.analysis.analyze).toHaveBeenCalledTimes(1);
    await controller.startAnalysis();
    expect(services.analysis.analyze).toHaveBeenCalledTimes(2);
    expect(controller.getState().selection.ply).toBe(1);
    controller.dispose();
  });

  it('deduplicates direct starts while the same analysis is running', async () => {
    const services = createServices(async () => result(secondQuery, [game]));
    const pending = deferred<Awaited<ReturnType<WorkspaceServices['analysis']['analyze']>>>();
    const saved = await services.analysis.analyze(
      game,
      'balanced',
      {} as never,
      { bookMoveKeys: [] },
      new AbortController().signal,
      vi.fn()
    );
    services.analysis.analyze = vi.fn(() => pending.promise);
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    controller.selectGame(game.id);
    await controller.probeEngine();
    const first = controller.startAnalysis();
    const second = controller.startAnalysis();
    await vi.waitFor(() => expect(services.analysis.analyze).toHaveBeenCalledTimes(1));
    pending.resolve(saved);
    await Promise.all([first, second]);
    controller.dispose();
  });

  it('waits for cancellation to settle before resuming', async () => {
    const services = createServices(async () => result(secondQuery, [game]));
    const saved = await services.analysis.analyze(
      game,
      'balanced',
      {} as never,
      { bookMoveKeys: [] },
      new AbortController().signal,
      vi.fn()
    );
    const first = deferred<typeof saved>();
    const resumed = deferred<typeof saved>();
    services.analysis.analyze = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => resumed.promise);
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    await controller.probeEngine();
    const old = controller.startAnalysis();
    await vi.waitFor(() => expect(services.analysis.analyze).toHaveBeenCalledTimes(1));
    controller.cancelAnalysis();
    expect(controller.getState().analysis.status).toBe('stopping');
    await controller.startAnalysis();
    expect(services.analysis.analyze).toHaveBeenCalledTimes(1);
    first.resolve({ ...saved, status: 'cancelled' });
    await old;
    expect(controller.getState().analysis.status).toBe('cancelled');
    const next = controller.startAnalysis();
    await vi.waitFor(() => expect(services.analysis.analyze).toHaveBeenCalledTimes(2));
    resumed.resolve(saved);
    await next;
    expect(controller.getState().analysis.status).toBe('complete');
    controller.dispose();
  });

  it.each(['selection', 'view', 'query', 'deletion', 'disposal'] as const)(
    'invalidates a review waiting for READY after %s',
    async (change) => {
      const other = { ...game, id: 'game-2' };
      const services = createServices(async () => result(secondQuery, [game, other]));
      const ready = await services.engine.initialize();
      const delayed = deferred<typeof ready>();
      services.engine.initialize = vi.fn(() => delayed.promise);
      services.analysis.analyze = vi.fn(services.analysis.analyze);
      const controller = createWorkspaceController(services);
      await controller.submitQuery(secondQuery);
      const opening = controller.openReview(game.id);
      await vi.waitFor(() => expect(services.engine.initialize).toHaveBeenCalledTimes(1));
      if (change === 'selection') controller.selectGame(other.id);
      if (change === 'view') controller.invalidateReviewIntent();
      if (change === 'query') await controller.submitQuery(firstQuery);
      if (change === 'deletion') await controller.clearAllData();
      if (change === 'disposal') controller.dispose();
      delayed.resolve(ready);
      await opening;
      expect(services.analysis.analyze).not.toHaveBeenCalled();
      if (change === 'selection') expect(controller.getState().selection.gameId).toBe(other.id);
      controller.dispose();
    }
  );

  it.each(['complete', 'partial', 'cancelled'] as const)(
    'opens a compatible %s saved review without probing or starting',
    async (status) => {
      const services = createServices(async () => result(secondQuery, [game]));
      const saved = {
        ...(await services.analysis.analyze(
          game,
          'balanced',
          {} as never,
          { bookMoveKeys: [] },
          new AbortController().signal,
          vi.fn()
        )),
        status,
      };
      services.analysis.restoreSelected = vi.fn(async () => saved);
      services.analysis.analyze = vi.fn(services.analysis.analyze);
      services.engine.initialize = vi.fn(services.engine.initialize);
      const controller = createWorkspaceController(services);
      await controller.submitQuery(secondQuery);
      await controller.openReview(game.id);
      expect(controller.getState().analysis.result).toEqual(saved);
      expect(services.engine.initialize).not.toHaveBeenCalled();
      expect(services.analysis.analyze).not.toHaveBeenCalled();
      controller.dispose();
    }
  );

  it('does not start when unavailable, and shares open with a direct pending start', async () => {
    const services = createServices(async () => result(secondQuery, [game]));
    const ready = await services.engine.initialize();
    services.engine.initialize = vi.fn(async () => ({ ...ready, mode: 'unavailable' as const }));
    services.analysis.analyze = vi.fn(services.analysis.analyze);
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    await Promise.all([controller.openReview(game.id), controller.startAnalysis()]);
    expect(services.engine.initialize).toHaveBeenCalledTimes(1);
    expect(services.analysis.analyze).not.toHaveBeenCalled();
    expect(controller.getState().analysis.status).toBe('unavailable');
    controller.dispose();
  });

  it('keeps a delayed selected restore from replacing a newly started review', async () => {
    const services = createServices(async () => result(secondQuery, [game]));
    const saved = {
      ...(await services.analysis.analyze(
        game,
        'balanced',
        {} as never,
        { bookMoveKeys: [] },
        new AbortController().signal,
        vi.fn()
      )),
      status: 'partial' as const,
    };
    const restore = deferred<typeof saved | null>();
    services.analysis.restoreSelected = vi
      .fn()
      .mockImplementationOnce(() => restore.promise)
      .mockResolvedValue(null);
    const controller = createWorkspaceController(services);
    const importing = controller.submitQuery(secondQuery);
    await vi.waitFor(() => expect(services.analysis.restoreSelected).toHaveBeenCalled());
    await controller.openReview(game.id);
    restore.resolve(saved);
    await importing;
    expect(controller.getState().analysis.status).toBe('complete');
    controller.dispose();
  });

  it('does not let bulk restore claim a game already owned by a run at ingestion delivery', async () => {
    const services = createServices(async () => result(secondQuery, [game]));
    const saved = await services.analysis.analyze(
      game,
      'balanced',
      {} as never,
      { bookMoveKeys: [] },
      new AbortController().signal,
      vi.fn()
    );
    const pending = deferred<typeof saved>();
    services.analysis.analyze = vi.fn(() => pending.promise);
    services.analysis.restore = vi.fn(async () => ({
      [game.id]: { ...saved, status: 'partial' as const },
    }));
    const controller = createWorkspaceController(services);
    const capability = await services.engine.initialize();
    let started: Promise<void> | undefined;
    const unsubscribe = controller.subscribe(() => {
      if (!started && controller.getState().ingestion.result) {
        // Mark ownership before the nested started event reaches this subscriber.
        started = Promise.resolve();
        controller.dispatch({ type: 'analysis/capability', capability });
        started = controller.startAnalysis();
      }
    });
    await controller.submitQuery(secondQuery);
    await vi.waitFor(() => expect(controller.getState().analysis.status).toBe('running'));
    pending.resolve(saved);
    await started;
    expect(controller.getState().analysis.status).toBe('complete');
    unsubscribe();
    controller.dispose();
  });

  it('shares a delayed selected restore with direct start and ignores it after a view change', async () => {
    const services = createServices(async () => result(secondQuery, [game]));
    const saved = await services.analysis.analyze(
      game,
      'balanced',
      {} as never,
      { bookMoveKeys: [] },
      new AbortController().signal,
      vi.fn()
    );
    const selected = deferred<typeof saved | null>();
    services.analysis.restoreSelected = vi.fn(() => selected.promise);
    services.analysis.analyze = vi.fn(services.analysis.analyze);
    services.engine.initialize = vi.fn(services.engine.initialize);
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    const opening = controller.openReview(game.id);
    const direct = controller.startAnalysis();
    expect(services.analysis.restoreSelected).toHaveBeenCalledTimes(1);
    controller.invalidateReviewIntent();
    expect(controller.getState().analysis.status).toBe('idle');
    selected.resolve(saved);
    await Promise.all([opening, direct]);
    expect(controller.getState().analysis.result).toBeNull();
    expect(services.engine.initialize).not.toHaveBeenCalled();
    expect(services.analysis.analyze).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('checks captured content after readiness and never starts a replaced PGN', async () => {
    const record = { ...game };
    const services = createServices(async () => result(secondQuery, [record]));
    const ready = await services.engine.initialize();
    const delayed = deferred<typeof ready>();
    services.engine.initialize = vi.fn(() => delayed.promise);
    services.analysis.analyze = vi.fn(services.analysis.analyze);
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    const opening = controller.openReview(game.id);
    await vi.waitFor(() => expect(services.engine.initialize).toHaveBeenCalled());
    record.pgn = '[Result "1-0"]\n\n1. d4 d5 1-0';
    delayed.resolve(ready);
    await opening;
    expect(services.analysis.analyze).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('does not restore or build a graph for a superseded ingestion result', async () => {
    const stale = deferred<IngestionResult>();
    const services = createServices((query) =>
      query.username === firstQuery.username
        ? stale.promise
        : Promise.resolve(result(secondQuery, [game]))
    );
    services.analysis.restore = vi.fn(async () => ({}));
    services.graph.build = vi.fn(services.graph.build);
    const controller = createWorkspaceController(services);
    const first = controller.submitQuery(firstQuery);
    await controller.submitQuery(secondQuery);
    stale.resolve(result(firstQuery, [{ ...game, username: firstQuery.username }]));
    await first;
    await vi.waitFor(() => expect(services.analysis.restore).toHaveBeenCalledTimes(1));
    expect(services.graph.build).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('retries the engine without changing the selected game or ply', async () => {
    const services = createServices(async () => result(secondQuery, [game]));
    const ready = await services.engine.initialize();
    services.engine.initialize = vi.fn(async () => ({
      ...ready,
      mode: 'unavailable' as const,
      reason: 'Startup failed',
    }));
    const retry = deferred<typeof ready>();
    services.engine.retryInitialize = vi.fn(() => retry.promise);
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    controller.selectGame(game.id);
    controller.selectPly(1);
    await controller.probeEngine();
    const pending = controller.retryEngine();
    expect(controller.getState().analysis.status).toBe('probing');
    expect(controller.getState().selection).toMatchObject({ gameId: game.id, ply: 1 });
    retry.resolve(ready);
    await pending;
    expect(controller.getState().analysis.status).toBe('idle');
    expect(controller.getState().selection).toMatchObject({ gameId: game.id, ply: 1 });
    controller.dispose();
  });

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
    // T03 transition table: old service callbacks retain their captured query token.
    controller.dispatch({ type: 'operations/invalidated', token: 2 });
    const invalidated = controller.getState();
    reportProgress!.onProgress?.({
      ...invalidated.ingestion.progress!,
      jobId: 'stale',
      monthsCompleted: 2,
    });
    expect(controller.getState()).toBe(invalidated);
    pending.resolve(result(firstQuery, []));
    await submission;
  });

  it('cancels active work and disposes owned graph and engine resources once', () => {
    const counters = {
      ingestionCancel: 0,
      ingestionDispose: 0,
      graphCancel: 0,
      graphDispose: 0,
      engineDispose: 0,
    };
    const services = createServices(async () => result(firstQuery, []), counters);
    const controller = createWorkspaceController(services);

    controller.cancelIngestion();
    controller.dispose();
    controller.dispose();

    expect(counters).toEqual({
      ingestionCancel: 2,
      ingestionDispose: 1,
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

  it('waits for an active query writer to settle before deleting and rejects overlap', async () => {
    const pending = deferred<IngestionResult>();
    const order: string[] = [];
    const start = vi.fn(() => pending.promise);
    const services = createServices(start);
    services.ingestion.cancel = () => order.push('ingestion-cancel');
    services.data.deleteUsername = async (username) => {
      order.push('delete-user');
      return {
        username,
        gamesDeleted: 1,
        archiveSyncDeleted: 1,
        graphSnapshotsDeleted: 1,
      };
    };
    const controller = createWorkspaceController(services);
    const submission = controller.submitQuery(secondQuery);
    order.length = 0;

    const deletion = controller.deleteUserData('second-player');

    expect(order).toEqual(['ingestion-cancel']);
    expect(start).toHaveBeenCalledTimes(1);
    const duringMaintenance = controller.submitQuery(firstQuery);
    expect(start).toHaveBeenCalledTimes(1);
    await expect(controller.clearAllData()).rejects.toMatchObject({
      name: 'DataMaintenanceActiveError',
      message: 'Local data maintenance is already running.',
    });

    order.push('ingestion-settled');
    pending.resolve(result(secondQuery, [game]));
    await Promise.all([submission, duringMaintenance, deletion]);

    expect(order).toEqual(['ingestion-cancel', 'ingestion-settled', 'delete-user']);
    expect(controller.getState().ingestion.result).toBeNull();
  });

  it('waits for an aborted analysis writer before clearing evaluations', async () => {
    const pending = deferred<Awaited<ReturnType<WorkspaceServices['analysis']['analyze']>>>();
    const services = createServices(async () => result(secondQuery, [game]));
    let analysisSignal: AbortSignal | undefined;
    const clearAll = vi.fn(async () => ({ clearedStores: ['evaluations'] }));
    services.data.clearAll = clearAll;
    services.analysis.analyze = (_game, _strength, _capability, _context, signal) => {
      analysisSignal = signal;
      return pending.promise;
    };
    const controller = createWorkspaceController(services);
    await controller.submitQuery(secondQuery);
    controller.selectGame(game.id);
    await controller.probeEngine();
    const analysis = controller.startAnalysis();
    await vi.waitFor(() => expect(analysisSignal).toBeDefined());

    const clearing = controller.clearAllData();

    expect(analysisSignal?.aborted).toBe(true);
    expect(clearAll).not.toHaveBeenCalled();
    pending.resolve({} as never);
    await Promise.all([analysis, clearing]);
    expect(clearAll).toHaveBeenCalledTimes(1);
  });

  it('retains a completed result for its game without replacing another selection', async () => {
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
    await vi.waitFor(() => expect(controller.getState().analysis.status).toBe('running'));
    controller.selectGame(null);
    const emptyBreakdown = {
      brilliant: 0,
      great: 0,
      best: 0,
      excellent: 0,
      good: 0,
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
      warnings: [],
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
    expect(controller.getState().analysis.resultsByGameId[game.id]?.status).toBe('complete');
    controller.selectGame(game.id);
    expect(controller.getState().analysis.status).toBe('complete');
  });

  it('runs analysis progress, cancellation, navigation, clearing, and engine fallback paths', async () => {
    const emptyBreakdown = {
      brilliant: 0,
      great: 0,
      best: 0,
      excellent: 0,
      good: 0,
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
        warnings: [],
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
    expect(controller.getState().analysis.status).toBe('partial');
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
    await vi.waitFor(() =>
      expect(graphController.getState().graph).toMatchObject({
        status: 'failed',
        error: 'Graph failed',
      })
    );

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
  counters = {
    ingestionCancel: 0,
    ingestionDispose: 0,
    graphCancel: 0,
    graphDispose: 0,
    engineDispose: 0,
  }
): WorkspaceServices {
  return {
    ingestion: {
      start,
      cancel: () => {
        counters.ingestionCancel += 1;
      },
      dispose: () => {
        counters.ingestionDispose += 1;
      },
    },
    graph: {
      build: async (_games, options, fingerprint) => ({
        status: 'complete',
        snapshot: {
          formatVersion: 2,
          rootFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          includedGameIds: [],
          positionGameIds: [],
          prefixGameIds: [],
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
      retryInitialize: vi.fn(),
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
        warnings: [],
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
