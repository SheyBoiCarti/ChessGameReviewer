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
});
