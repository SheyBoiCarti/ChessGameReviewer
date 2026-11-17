import { describe, expect, it } from 'vitest';

import { createLongGameAnalysisResult } from '../../fixtures/longAnalysisFixture';
import type { GameQuery } from '@/lib/api/contracts';
import type { WorkspaceState } from '@/features/workspace/types';

import { initialWorkspaceState, reduceWorkspace } from '@/features/workspace/reducer';

const query: GameQuery = {
  username: 'player-one',
  maxGames: 500,
  timeClasses: ['rapid'],
  colors: ['white', 'black'],
};

describe('workspace reducer', () => {
  it('keeps the committed query identity during replacement and failure, then commits an empty success', () => {
    const committed = { ...query, dateFrom: '2024-01-01', rated: true };
    const requested = { ...query, username: 'other-player', colors: ['black'] as const };
    const replacement = { ...requested, colors: ['black'] as GameQuery['colors'] };
    const oldResult = {
      jobId: 'old',
      fingerprint: 'old',
      status: 'complete' as const,
      games: [{ id: 'old' } as never],
      diagnostics: [],
      failedMonths: [],
      offlineCacheOnly: false,
    };
    let state = reduceWorkspace(
      {
        ...initialWorkspaceState,
        query: { draft: committed, active: committed, token: 0 },
        ingestion: { ...initialWorkspaceState.ingestion, result: oldResult },
      },
      { type: 'query/started', query: replacement, token: 1 }
    );
    expect(state.query.active).toEqual(committed);
    state = reduceWorkspace(state, {
      type: 'ingestion/terminal',
      token: 1,
      result: {
        ...oldResult,
        status: 'failed',
        games: [],
        diagnostics: [{ code: 'PLAYER_NOT_FOUND', message: 'No such player', severity: 'error' }],
      },
    });
    expect(state.query.active).toEqual(committed);
    expect(state.ingestion.result).toBe(oldResult);
    state = reduceWorkspace(state, { type: 'query/started', query: replacement, token: 2 });
    state = reduceWorkspace(state, {
      type: 'ingestion/terminal',
      token: 2,
      result: { ...oldResult, games: [] },
    });
    expect(state.query.active).toEqual(replacement);
    expect(state.ingestion.status).toBe('empty');
  });

  it('accumulates unique completed moves and rejects stale or stopped updates', () => {
    const identity = {
      queryToken: 0,
      username: 'player',
      gameId: 'one',
      pgnDigest: 'digest',
      strength: 'balanced' as const,
      jobId: 1,
    };
    let state: WorkspaceState = {
      ...initialWorkspaceState,
      selection: { ...initialWorkspaceState.selection, gameId: 'one' },
    };
    state = reduceWorkspace(state, { type: 'analysis/started', token: 0, identity });
    const annotations = createLongGameAnalysisResult(2).annotations;
    const update = { annotation: annotations[0]!, analyzedPlies: 1, totalPlies: 8 };
    const stale = reduceWorkspace(state, {
      type: 'analysis/update',
      identity: { ...identity, jobId: 2 },
      update,
    });
    expect(stale).toBe(state);
    state = reduceWorkspace(state, { type: 'analysis/update', identity, update });
    expect(state.analysis.result?.analyzedPlies).toBe(1);
    expect(reduceWorkspace(state, { type: 'analysis/update', identity, update })).toBe(state);
    state = reduceWorkspace(state, {
      type: 'analysis/update',
      identity,
      update: { ...update, annotation: annotations[1]!, analyzedPlies: 2 },
    });
    expect(state.analysis.result?.annotations.map((a) => a.ply)).toEqual([1, 2]);
    expect(state.analysis.progress).toEqual({ analyzedPlies: 2, totalPlies: 8 });
    state = reduceWorkspace(state, { type: 'analysis/stopping', identity });
    expect(reduceWorkspace(state, { type: 'analysis/update', identity, update })).toBe(state);
  });
  it('keeps a labeled previous review until new preset annotations arrive', () => {
    const previous = createLongGameAnalysisResult(2);
    const identity = {
      queryToken: 0,
      username: 'player',
      gameId: 'one',
      pgnDigest: 'digest',
      strength: 'deep' as const,
      jobId: 1,
    };
    let state: WorkspaceState = {
      ...initialWorkspaceState,
      selection: { ...initialWorkspaceState.selection, gameId: 'one' },
      analysis: {
        ...initialWorkspaceState.analysis,
        result: previous,
        resultStrength: 'balanced',
        status: 'complete',
      },
    };
    state = reduceWorkspace(state, { type: 'analysis/started', token: 0, identity });
    expect(state.analysis).toMatchObject({
      result: previous,
      previousStrength: 'balanced',
      showingPrevious: true,
    });
    state = reduceWorkspace(state, {
      type: 'analysis/update',
      identity,
      update: {
        annotation: previous.annotations[0]!,
        analyzedPlies: 1,
        totalPlies: 8,
      },
    });
    expect(state.analysis).toMatchObject({
      showingPrevious: false,
      resultStrength: 'deep',
      progress: { analyzedPlies: 1, totalPlies: 8 },
    });
    expect(state.analysis.result?.annotations).toHaveLength(1);
  });

  // T27: explicit game selection can install a retained last-reviewed ply.
  it('selects a game at the retained clamped ply and without it at zero', () => {
    const withCursor = reduceWorkspace(initialWorkspaceState, {
      type: 'selection/game',
      gameId: 'game-1',
      ply: 28,
    });
    expect(withCursor.selection).toMatchObject({ gameId: 'game-1', ply: 28 });
    const withoutCursor = reduceWorkspace(initialWorkspaceState, {
      type: 'selection/game',
      gameId: 'game-1',
    });
    expect(withoutCursor.selection).toMatchObject({ gameId: 'game-1', ply: 0 });
  });

  // T03 baseline: query ownership precedes every ingestion progress projection.
  it('ignores stale ingestion progress without changing state identity', () => {
    expect(
      reduceWorkspace(initialWorkspaceState, {
        type: 'ingestion/progress',
        token: 99,
        progress: {
          jobId: 'stale',
          phase: 'fetching',
          monthsPlanned: 1,
          monthsCompleted: 0,
          recordsFetched: 0,
          recordsAccepted: 0,
          recordsExcluded: 0,
          recordsFailed: 0,
          diagnostics: [],
        },
      })
    ).toBe(initialWorkspaceState);
  });

  it('clears the previous graph, selection and active review after a successful empty import', () => {
    const snapshot = { rootKey: 'old-root' } as never;
    let state: WorkspaceState = {
      ...initialWorkspaceState,
      graph: { ...initialWorkspaceState.graph, snapshot },
    };
    state = reduceWorkspace(state, {
      type: 'ingestion/terminal',
      token: 0,
      result: {
        jobId: 'empty',
        fingerprint: 'empty',
        status: 'complete',
        games: [],
        failedMonths: [],
        diagnostics: [],
        offlineCacheOnly: false,
      },
    });
    expect(state.ingestion.status).toBe('empty');
    expect(state.graph.snapshot).toBeNull();
    expect(state.selection.gameId).toBeNull();
    expect(state.analysis.result).toBeNull();
  });

  it('keeps the full previous query and games after intentional cancellation', () => {
    const previousQuery = { ...query, dateFrom: '2026-11-01', dateTo: '2026-11-09' };
    const previousResult = {
      jobId: 'loaded',
      fingerprint: 'loaded',
      status: 'complete' as const,
      games: [{ id: 'old', endedAt: 1, username: query.username } as never],
      failedMonths: [],
      diagnostics: [],
      offlineCacheOnly: false,
    };
    let state = reduceWorkspace(
      {
        ...initialWorkspaceState,
        query: { draft: previousQuery, active: previousQuery, token: 0 },
        ingestion: { ...initialWorkspaceState.ingestion, result: previousResult },
      },
      { type: 'query/started', token: 1, query: { ...query, dateFrom: '2025-01-01' } }
    );
    state = reduceWorkspace(state, {
      type: 'ingestion/terminal',
      token: 1,
      result: {
        ...previousResult,
        status: 'cancelled',
        games: [],
      },
    });
    expect(state.ingestion.status).toBe('cancelled');
    expect(state.ingestion.error).toBeNull();
    expect(state.ingestion.result).toBe(previousResult);
    expect(state.query.active).toEqual(previousQuery);
  });

  it('models deletion maintenance start, failure, and success explicitly', () => {
    const deleting = reduceWorkspace(initialWorkspaceState, {
      type: 'data/deletionStarted',
      kind: 'user',
    });
    expect(deleting.dataMaintenance).toEqual({ status: 'deleting-user', error: null });

    const failed = reduceWorkspace(deleting, {
      type: 'data/deletionFailed',
      error: 'Local data could not be deleted.',
    });
    expect(failed.dataMaintenance).toEqual({
      status: 'idle',
      error: 'Local data could not be deleted.',
    });

    const clearing = reduceWorkspace(failed, { type: 'data/deletionStarted', kind: 'all' });
    expect(clearing.dataMaintenance.status).toBe('clearing-all');
    expect(reduceWorkspace(clearing, { type: 'data/allCleared' }).dataMaintenance).toEqual({
      status: 'idle',
      error: null,
    });
  });

  it('clears unscoped repertoire context when deleting the active user or all data', () => {
    const state = {
      ...initialWorkspaceState,
      query: { ...initialWorkspaceState.query, active: query },
      repertoire: { datasetRevision: 'revision', horizon: 30, moveKeys: ['position\u0000e2e4'] },
    };
    expect(
      reduceWorkspace(state, { type: 'data/userDeleted', username: query.username }).repertoire
    ).toBeNull();
    expect(reduceWorkspace(state, { type: 'data/allCleared' }).repertoire).toBeNull();
  });

  it('invalidates active operations and ignores terminals carrying the old token', () => {
    const active = {
      ...initialWorkspaceState,
      query: { draft: query, active: query, token: 4 },
      ingestion: {
        status: 'loading' as const,
        progress: null,
        result: null,
        error: null,
      },
      graph: {
        status: 'building' as const,
        snapshot: null,
        diagnosticCodes: [],
        error: null,
        scope: 'both' as const,
        datasetRevision: null,
        requestId: 1,
      },
      analysis: {
        ...initialWorkspaceState.analysis,
        status: 'running' as const,
      },
    };
    const invalidated = reduceWorkspace(active, { type: 'operations/invalidated', token: 5 });

    expect(invalidated.query.token).toBe(5);
    expect(invalidated.ingestion.status).toBe('cancelled');
    expect(invalidated.graph.status).toBe('idle');
    expect(invalidated.analysis.status).toBe('cancelled');
    expect(
      reduceWorkspace(invalidated, {
        type: 'graph/failed',
        requestId: 1,
        token: 4,
        error: 'late failure',
      })
    ).toBe(invalidated);
  });

  it.each(['partial', 'cancelled', 'failed', 'complete'] as const)(
    'keeps %s distinct as an ingestion terminal state',
    (status) => {
      const next = reduceWorkspace(initialWorkspaceState, {
        type: 'ingestion/terminal',
        token: 0,
        result: {
          jobId: 'job-1',
          fingerprint: 'query-1',
          status,
          games: status === 'complete' ? ([{ id: 'game-1' }] as never) : [],
          failedMonths: [],
          diagnostics: [],
          offlineCacheOnly: false,
        },
      });

      expect(next.ingestion.status).toBe(status);
    }
  );

  it('represents a successful result with no games as empty', () => {
    const next = reduceWorkspace(initialWorkspaceState, {
      type: 'ingestion/terminal',
      token: 0,
      result: {
        jobId: 'job-1',
        fingerprint: 'query-1',
        status: 'complete',
        games: [],
        failedMonths: [],
        diagnostics: [],
        offlineCacheOnly: false,
      },
    });

    expect(next.ingestion.status).toBe('empty');
  });

  it('resets graph and analysis selection when a new validated query starts', () => {
    const loaded = {
      ...initialWorkspaceState,
      query: { draft: query, active: query, token: 1 },
      selection: { gameId: 'game-1', positionKey: 'position-1', pathId: 3, ply: 7 },
      graph: {
        status: 'complete' as const,
        snapshot: { formatVersion: 2 } as never,
        diagnosticCodes: [],
        error: null,
        scope: 'both' as const,
        datasetRevision: null,
        requestId: 1,
      },
      analysis: {
        status: 'complete' as const,
        capability: null,
        result: { status: 'complete', annotations: [] } as never,
        progress: null,
        error: null,
        resultsByGameId: {},
      },
    };

    const next = reduceWorkspace(loaded, { type: 'query/started', query, token: 2 });

    expect(next.query.active).toBeNull();
    expect(next.query.requested).toEqual(query);
    expect(next.graph).toMatchObject({ status: 'idle', snapshot: null });
    expect(next.selection).toEqual({ gameId: null, positionKey: null, pathId: null, ply: 0 });
    expect(next.analysis).toMatchObject({ status: 'idle', result: null });
  });

  it('preserves existing loaded games when a subsequent query fails and recovers on dismissal', () => {
    const loadedGame = {
      id: 'g-1',
      username: 'shehey',
      url: 'url',
      userColor: 'white' as const,
      result: 'win' as const,
      endedAt: 1000,
      timeClass: 'rapid' as const,
      rated: true,
      userRating: 1500,
      opponentRating: 1400,
      whitePlayer: { username: 'shehey', rating: 1500 },
      blackPlayer: { username: 'opponent', rating: 1400 },
      pgn: '1. e4 e5 1-0',
      rules: 'chess' as const,
    };
    const loaded = {
      ...initialWorkspaceState,
      query: { draft: query, active: query, token: 1 },
      ingestion: {
        status: 'complete' as const,
        progress: null,
        result: {
          jobId: 'j-1',
          fingerprint: 'fp-1',
          status: 'complete' as const,
          games: [loadedGame],
          failedMonths: [],
          diagnostics: [],
          offlineCacheOnly: false,
        },
        error: null,
      },
      selection: { gameId: 'g-1', positionKey: 'pos-1', pathId: 0, ply: 2 },
    };

    const nextQuery: GameQuery = { ...query, username: 'nonexistent-user' };
    const starting = reduceWorkspace(loaded, { type: 'query/started', query: nextQuery, token: 2 });
    expect(starting.ingestion.status).toBe('loading');
    expect(starting.ingestion.result?.games).toEqual([loadedGame]);
    expect(starting.selection.gameId).toBe('g-1');

    const failed = reduceWorkspace(starting, {
      type: 'ingestion/failed',
      token: 2,
      error: 'User not found',
    });
    expect(failed.ingestion.status).toBe('failed');
    expect(failed.ingestion.error).toBe('User not found');
    expect(failed.ingestion.result?.games).toEqual([loadedGame]);
    expect(failed.selection.gameId).toBe('g-1');
    expect(failed.query.active).toEqual(query);

    const dismissed = reduceWorkspace(failed, { type: 'ingestion/errorDismissed' });
    expect(dismissed.ingestion.status).toBe('complete');
    expect(dismissed.ingestion.error).toBeNull();
    expect(dismissed.ingestion.result?.games).toEqual([loadedGame]);
  });

  it('ignores results from superseded relevance tokens', () => {
    const current = reduceWorkspace(initialWorkspaceState, {
      type: 'query/started',
      query,
      token: 2,
    });

    const stale = reduceWorkspace(current, {
      type: 'ingestion/terminal',
      token: 1,
      result: {
        jobId: 'old-job',
        fingerprint: 'old-query',
        status: 'complete',
        games: [],
        failedMonths: [],
        diagnostics: [],
        offlineCacheOnly: false,
      },
    });

    expect(stale).toBe(current);
    expect(stale.ingestion.status).toBe('loading');
  });

  it('covers graph, selection, preference, and data lifecycle transitions', () => {
    const snapshot = { rootKey: 'root', formatVersion: 2 } as never;
    let state = reduceWorkspace(initialWorkspaceState, { type: 'query/draftChanged', query });
    state = reduceWorkspace(state, { type: 'query/started', query, token: 4 });
    state = reduceWorkspace(state, {
      type: 'ingestion/progress',
      token: 4,
      progress: { jobId: 'job', phase: 'fetching' } as never,
    });
    state = reduceWorkspace(state, { type: 'graph/started', token: 4, requestId: 1 });
    state = reduceWorkspace(state, {
      type: 'graph/terminal',
      token: 4,
      status: 'limited',
      snapshot,
      diagnosticCodes: ['ILLEGAL_PGN'],
      requestId: 1,
      scope: 'both',
      datasetRevision: 'rev-1',
    });
    state = reduceWorkspace(state, { type: 'selection/position', positionKey: 'next', pathId: 9 });
    state = reduceWorkspace(state, { type: 'selection/ply', ply: -3 });
    state = reduceWorkspace(state, {
      type: 'preferences/changed',
      preferences: { theme: 'dark' },
    });

    expect(state.graph.status).toBe('limited');
    expect(state.graph.diagnosticCodes).toEqual(['ILLEGAL_PGN']);
    expect(state.selection).toMatchObject({ positionKey: 'next', pathId: 9, ply: 0 });
    expect(state.preferences.theme).toBe('dark');
    expect(reduceWorkspace(state, { type: 'data/userDeleted', username: 'someone-else' })).toBe(
      state
    );
    expect(reduceWorkspace(state, { type: 'data/allCleared' }).query.active).toBeNull();
    expect(
      reduceWorkspace(state, {
        type: 'graph/failed',
        requestId: 1,
        token: 4,
        error: 'graph failed',
      }).graph.status
    ).toBe('failed');
    expect(
      reduceWorkspace(state, { type: 'ingestion/failed', token: 4, error: 'load failed' }).ingestion
        .status
    ).toBe('failed');
  });

  it('retains defensive graph exclusions as a distinct partial state', () => {
    const snapshot = { rootKey: 'root', excludedGameCount: 1 } as never;
    const state = reduceWorkspace(initialWorkspaceState, {
      type: 'graph/terminal',
      token: 0,
      status: 'partial',
      snapshot,
      diagnosticCodes: ['ILLEGAL_PGN'],
      requestId: 0,
      scope: 'both',
      datasetRevision: 'rev-1',
    });

    expect(state.graph).toMatchObject({
      status: 'partial',
      snapshot,
      diagnosticCodes: ['ILLEGAL_PGN'],
    });
  });

  it('covers available and unavailable analysis transitions', () => {
    const available = {
      mode: 'single-thread' as const,
      crossOriginIsolated: false,
      sharedArrayBuffer: false,
      simd: true,
      engineInitialized: true,
      threads: 1,
      hashMb: 16,
    };
    const unavailable = {
      ...available,
      mode: 'unavailable' as const,
      engineInitialized: false,
      threads: 0,
      reason: 'blocked',
    };
    let state = reduceWorkspace(initialWorkspaceState, { type: 'analysis/probing' });
    state = reduceWorkspace(state, { type: 'analysis/capability', capability: available });
    state = reduceWorkspace(state, { type: 'selection/game', gameId: 'game-1' });
    state = reduceWorkspace(state, { type: 'analysis/started', token: 0 });
    state = reduceWorkspace(state, {
      type: 'analysis/progress',
      token: 0,
      progress: { analyzedPlies: 1, totalPlies: 2 },
    });
    state = reduceWorkspace(state, {
      type: 'analysis/terminal',
      token: 0,
      result: {
        status: 'complete',
        annotations: [],
        analyzedPlies: 0,
        totalPlies: 0,
        summary: { white: {}, black: {} },
      } as never,
    });
    expect(state.analysis.status).toBe('complete');
    expect(reduceWorkspace(state, { type: 'analysis/cancelled', token: 0 }).analysis.status).toBe(
      'cancelled'
    );
    expect(
      reduceWorkspace(state, { type: 'analysis/failed', token: 0, error: 'failed' }).analysis.status
    ).toBe('failed');

    state = reduceWorkspace(state, { type: 'analysis/capability', capability: unavailable });
    state = reduceWorkspace(state, { type: 'selection/game', gameId: null });
    expect(state.analysis).toMatchObject({ status: 'unavailable', error: 'blocked' });
  });
});

it.each(['running', 'stopping', 'complete'] as const)(
  'R05: a changed batch clears %s review and ply before replacing the content',
  async (status) => {
    const { makeGameRecord } = await import('../../helpers/phase1Fixtures');
    const old = makeGameRecord();
    const active = { ...query, username: old.username };
    const result = {
      jobId: 'old',
      fingerprint: 'old',
      status: 'complete' as const,
      games: [old],
      diagnostics: [],
      failedMonths: [],
      offlineCacheOnly: false,
    };
    const state: WorkspaceState = {
      ...initialWorkspaceState,
      query: { draft: active, active, requested: active, token: 1 },
      ingestion: { ...initialWorkspaceState.ingestion, result },
      selection: { ...initialWorkspaceState.selection, gameId: old.id, ply: 2 },
      analysis: {
        ...initialWorkspaceState.analysis,
        status,
        result: createLongGameAnalysisResult(2),
        resultsByGameId: { [old.id]: createLongGameAnalysisResult(2) },
      },
    };
    const next = reduceWorkspace(state, {
      type: 'ingestion/batch',
      token: 1,
      batch: {
        jobId: 'new',
        fingerprint: 'new',
        sequence: 1,
        datasetRevision: 'new',
        games: [{ ...old, pgn: '1. d4 d5 1/2-1/2' }],
      },
    });
    expect(next.selection.ply).toBe(0);
    expect(next.analysis.result).toBeNull();
    expect(next.analysis.resultsByGameId[old.id]).toBeUndefined();
    expect(next.analysis.status).toBe('idle');
  }
);

it('R06: a first batch commits ownership and cancellation/failure retain that displayed owner', async () => {
  const { makeGameRecord } = await import('../../helpers/phase1Fixtures');
  const game = makeGameRecord({ username: query.username });
  let state = reduceWorkspace(initialWorkspaceState, { type: 'query/started', query, token: 1 });
  state = reduceWorkspace(state, {
    type: 'ingestion/batch',
    token: 1,
    batch: {
      jobId: 'batch',
      fingerprint: 'batch',
      sequence: 1,
      datasetRevision: 'rev',
      games: [game],
    },
  });
  expect(state.query.active).toEqual(query);
  state = reduceWorkspace(state, {
    type: 'ingestion/terminal',
    token: 1,
    result: {
      jobId: 'batch',
      fingerprint: 'batch',
      status: 'cancelled',
      games: [],
      diagnostics: [],
      failedMonths: [],
      offlineCacheOnly: false,
    },
  });
  expect(state.query.active).toEqual(query);
  expect(state.ingestion.result?.games).toEqual([game]);
});

it('R04: deleting a previous user removes their retained review entries while keeping the displayed user', () => {
  const key = JSON.stringify(['previous-user', 'game', 'digest', 'balanced']);
  const other = JSON.stringify([query.username, 'other', 'digest', 'balanced']);
  const review = {
    lastComplete: createLongGameAnalysisResult(1),
    latestAttempt: createLongGameAnalysisResult(1),
  };
  const state: WorkspaceState = {
    ...initialWorkspaceState,
    query: { draft: query, active: query, token: 1 },
    analysis: {
      ...initialWorkspaceState.analysis,
      reviewEntries: { [key]: review, [other]: review },
    },
    dataMaintenance: { status: 'deleting-user', error: null },
  };
  const next = reduceWorkspace(state, { type: 'data/userDeleted', username: 'previous-user' });
  expect(next.analysis.reviewEntries).toEqual({ [other]: review });
  expect(next.query.active).toEqual(query);
});
