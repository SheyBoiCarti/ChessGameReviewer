import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceServices } from '@/features/workspace/createWorkspaceController';
import { useWorkspace } from '@/features/workspace/useWorkspace';
import type { GameQuery } from '@/lib/api/contracts';
import type { GameRecord } from '@/lib/db/schema';
import type { IngestionResult } from '@/features/ingestion/types';

const query: GameQuery = {
  username: 'cursor-player',
  maxGames: 500,
  timeClasses: ['rapid'],
  colors: ['white', 'black'],
};

function gameRecord(
  id: string,
  overrides: Partial<GameRecord> = {}
): GameRecord {
  return {
    id,
    username: 'cursor-player',
    url: `https://www.chess.com/game/live/${id}`,
    userColor: 'white',
    result: 'win',
    endedAt: 1_700_000_000,
    timeClass: 'rapid',
    rated: true,
    userRating: 1800,
    opponentRating: 1775,
    whitePlayer: { username: 'cursor-player', rating: 1800 },
    blackPlayer: { username: 'opponent', rating: 1775 },
    pgn: '[Result "1-0"]\n\n1. e4 e5 1-0',
    rules: 'chess',
    ...overrides,
  };
}

function result(games: GameRecord[]): IngestionResult {
  return {
    jobId: 'cursor-job',
    fingerprint: 'cursor-fingerprint',
    status: 'complete',
    games,
    failedMonths: [],
    diagnostics: [],
    offlineCacheOnly: false,
  };
}

function createTestServices(
  start: WorkspaceServices['ingestion']['start']
): WorkspaceServices {
  return {
    ingestion: { start, cancel: vi.fn(), dispose: vi.fn() },
    graph: { build: vi.fn(), cancel: vi.fn(), dispose: vi.fn() },
    engine: { retryInitialize: vi.fn(), initialize: vi.fn(), dispose: vi.fn() },
    data: { deleteUsername: vi.fn(), clearAll: vi.fn(), dispose: vi.fn() },
    analysis: { analyze: vi.fn() },
  };
}

describe('useWorkspace retained last-reviewed position (T27)', () => {
  it('returns to each game’s last reviewed ply on reopen and starts over only explicitly', async () => {
    const game = gameRecord('game-a', { endedAt: 1_700_000_100 });
    const other = gameRecord('game-b', { endedAt: 1_700_000_000 });
    const services = createTestServices(async () => result([game, other]));
    const { result: hook, unmount } = renderHook(() => useWorkspace(() => services));
    const controller = hook.current.controller;
    await controller.submitQuery(query);

    controller.selectGame(game.id);
    controller.selectPly(1);
    controller.selectGame(null);
    controller.selectGame(game.id);
    expect(controller.getState().selection.ply).toBe(1);
    controller.startOver(game.id);
    expect(controller.getState().selection.ply).toBe(0);

    // An explicit Start over forgets the retained position for that game.
    controller.selectGame(null);
    controller.selectGame(game.id);
    expect(controller.getState().selection.ply).toBe(0);

    controller.dispose();
    unmount();
  });

  it('clamps a retained ply only after parsing the current game', async () => {
    // The fixture PGN has two legal plies.
    const game = gameRecord('game-short', { endedAt: 1_700_000_100 });
    const services = createTestServices(async () => result([game]));
    const { result: hook, unmount } = renderHook(() => useWorkspace(() => services));
    const controller = hook.current.controller;
    await controller.submitQuery(query);

    controller.selectGame(game.id);
    controller.selectPly(99);
    controller.selectGame(null);
    controller.selectGame(game.id);
    expect(controller.getState().selection.ply).toBe(2);

    controller.dispose();
    unmount();
  });

  it('resets to zero when the retained game content changed', async () => {
    const oldest = gameRecord('game-old', { endedAt: 1_700_000_000 });
    const newest = gameRecord('game-new', { endedAt: 1_700_000_100 });
    let dataset: GameRecord[] = [oldest, newest];
    const services = createTestServices(async () => result(dataset));
    const { result: hook, unmount } = renderHook(() => useWorkspace(() => services));
    const controller = hook.current.controller;
    await controller.submitQuery(query);

    // Selection starts at the newest game; move into the oldest and leave.
    controller.selectGame(oldest.id);
    controller.selectPly(2);
    controller.selectGame(newest.id);
    expect(controller.getState().selection.ply).toBe(0);

    // Replacement import with a shortened/changed PGN for the same game id.
    dataset = [
      gameRecord('game-old', { pgn: '[Result "1-0"]\n\n1. e4 1-0', endedAt: 1_700_000_000 }),
      newest,
    ];
    await controller.submitQuery(query);
    // Selection reset to the newest game; explicitly open the changed game.
    controller.selectGame(null);
    controller.selectGame('game-old');
    expect(controller.getState().selection.ply).toBe(0);

    controller.dispose();
    unmount();
  });

  it('removes retained cursors and the saved session when local data is deleted', async () => {
    localStorage.setItem(
      'chess-game-reviewer:session',
      JSON.stringify({
        username: 'cursor-player',
        gameId: 'game-1',
        ply: 4,
        tab: 'analysis',
        reviewMode: 'review',
      })
    );
    const game = gameRecord('game-1', { endedAt: 1_700_000_100 });
    const services = createTestServices(async () => result([game]));
    services.data.deleteUsername = vi.fn(async () => ({
      username: 'cursor-player',
      gamesDeleted: 1,
      archiveSyncDeleted: 1,
      graphSnapshotsDeleted: 0,
    }));
    const { result: hook, unmount } = renderHook(() => useWorkspace(() => services));
    const controller = hook.current.controller;
    await controller.submitQuery(query);
    controller.selectGame(game.id);
    controller.selectPly(3);
    controller.selectGame(null);
    await controller.deleteUserData('cursor-player');
    expect(localStorage.getItem('chess-game-reviewer:session')).toBeNull();

    controller.selectGame(game.id);
    expect(controller.getState().selection.ply).toBe(0);

    controller.dispose();
    unmount();
  });

  it('bounds retained cursors to 500 entries per user with least-recently-used eviction', async () => {
    const games = Array.from({ length: 501 }, (_, index) =>
      gameRecord(`bulk-${index + 1}`, {
        endedAt: 1_700_000_500 - index,
        pgn: `[Result "1-0"]\n\n1. ${['e4', 'd4', 'c4', 'Nf3'][index % 4]} e5 1-0`,
      })
    );
    const services = createTestServices(async () => result(games));
    const { result: hook, unmount } = renderHook(() => useWorkspace(() => services));
    const controller = hook.current.controller;
    await controller.submitQuery(query);

    // Selection starts at the newest bulk game; step through every game once.
    controller.selectGame('bulk-1');
    controller.selectPly(1);
    for (let index = 2; index <= 501; index += 1) {
      controller.selectGame(`bulk-${index}`);
      controller.selectPly(1);
    }
    // Leaving bulk-501 records a 501st cursor; the LRU entry (bulk-1) is evicted.
    controller.selectGame(null);
    controller.selectGame('bulk-1');
    expect(controller.getState().selection.ply).toBe(0);

    controller.selectGame(null);
    controller.selectGame('bulk-501');
    expect(controller.getState().selection.ply).toBe(1);

    controller.dispose();
    unmount();
  });
});
