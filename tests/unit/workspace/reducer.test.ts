import { describe, expect, it } from 'vitest';

import type { GameQuery } from '@/lib/api/contracts';
import { initialWorkspaceState, reduceWorkspace } from '@/features/workspace/reducer';

const query: GameQuery = {
  username: 'player-one',
  maxGames: 500,
  timeClasses: ['rapid'],
  colors: ['white', 'black'],
};

describe('workspace reducer', () => {
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
        snapshot: { formatVersion: 1 } as never,
        error: null,
      },
      analysis: {
        status: 'complete' as const,
        capability: null,
        result: { status: 'complete', annotations: [] } as never,
        progress: null,
        error: null,
      },
    };

    const next = reduceWorkspace(loaded, { type: 'query/started', query, token: 2 });

    expect(next.query.active).toEqual(query);
    expect(next.graph).toMatchObject({ status: 'idle', snapshot: null });
    expect(next.selection).toEqual({ gameId: null, positionKey: null, pathId: null, ply: 0 });
    expect(next.analysis).toMatchObject({ status: 'idle', result: null });
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
    const snapshot = { rootKey: 'root', formatVersion: 1 } as never;
    let state = reduceWorkspace(initialWorkspaceState, { type: 'query/draftChanged', query });
    state = reduceWorkspace(state, { type: 'query/started', query, token: 4 });
    state = reduceWorkspace(state, {
      type: 'ingestion/progress',
      token: 4,
      progress: { jobId: 'job', phase: 'fetching' } as never,
    });
    state = reduceWorkspace(state, { type: 'graph/started', token: 4 });
    state = reduceWorkspace(state, {
      type: 'graph/terminal',
      token: 4,
      status: 'limited',
      snapshot,
    });
    state = reduceWorkspace(state, { type: 'selection/position', positionKey: 'next', pathId: 9 });
    state = reduceWorkspace(state, { type: 'selection/ply', ply: -3 });
    state = reduceWorkspace(state, {
      type: 'preferences/changed',
      preferences: { theme: 'dark' },
    });

    expect(state.graph.status).toBe('limited');
    expect(state.selection).toMatchObject({ positionKey: 'next', pathId: 9, ply: 0 });
    expect(state.preferences.theme).toBe('dark');
    expect(reduceWorkspace(state, { type: 'data/userDeleted', username: 'someone-else' })).toBe(
      state
    );
    expect(reduceWorkspace(state, { type: 'data/allCleared' }).query.active).toBeNull();
    expect(
      reduceWorkspace(state, { type: 'graph/failed', token: 4, error: 'graph failed' }).graph.status
    ).toBe('failed');
    expect(
      reduceWorkspace(state, { type: 'ingestion/failed', token: 4, error: 'load failed' }).ingestion
        .status
    ).toBe('failed');
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
