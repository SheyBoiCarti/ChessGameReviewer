'use client';

import { useEffect, useState } from 'react';

import { IngestionManager } from '@/features/ingestion/ingestionService';
import type { IngestionDependencies, IngestionTerminalStatus } from '@/features/ingestion/types';
import type { GameQuery } from '@/lib/api/contracts';
import type { RawChesscomGame } from '@/lib/api/chesscomSchemas';
import { createAbortError, createOfflineError, createPubApiError } from '@/lib/api/errors';
import { deleteUserData } from '@/lib/db/deleteLocalData';
import { closeDatabase, openDatabase } from '@/lib/db/openDatabase';
import {
  getArchiveListMeta,
  getArchiveSyncsForUser,
  getGamesForMonth,
  getGamesForUser,
  putArchiveListMeta,
  saveSyncBatch,
  upsertGames,
} from '@/lib/db/repositories';
import { NORMALIZER_VERSION, type ArchiveSyncRecord, type GameRecord } from '@/lib/db/schema';

type FixtureMode = 'complete' | 'partial' | 'cancelled' | 'empty' | 'offline-cache-only' | 'failed';

const MODES: readonly FixtureMode[] = [
  'complete',
  'partial',
  'cancelled',
  'empty',
  'offline-cache-only',
  'failed',
];
const USERNAME = 'fixture-user';
const NOW = Date.UTC(2026, 7, 12, 12);
const archiveUrl = (month: string) =>
  `https://api.chess.com/pub/player/${USERNAME}/games/2026/${month}`;

function query(): GameQuery {
  return {
    username: USERNAME,
    maxGames: 500,
    timeClasses: ['bullet', 'blitz', 'rapid', 'daily'],
    colors: ['white', 'black'],
  };
}

function game(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: 'fixture-game',
    username: USERNAME,
    url: 'https://www.chess.com/game/live/fixture-game',
    uuid: 'fixture-game',
    userColor: 'white',
    result: 'draw',
    endedAt: NOW / 1000,
    timeClass: 'blitz',
    rated: true,
    userRating: 1500,
    opponentRating: 1500,
    whitePlayer: { username: USERNAME, rating: 1500 },
    blackPlayer: { username: 'opponent', rating: 1500 },
    pgn: '1. e4 e5 1/2-1/2',
    rules: 'chess',
    ...overrides,
  };
}

function rawGame(id: string): RawChesscomGame {
  return {
    url: `https://www.chess.com/game/live/${id}`,
    uuid: id,
    pgn: '1. e4 e5 1/2-1/2',
    end_time: NOW / 1000,
    time_class: 'blitz',
    rules: 'chess',
    rated: true,
    white: { username: USERNAME, rating: 1500, result: 'agreed' },
    black: { username: 'opponent', rating: 1500, result: 'agreed' },
  };
}

function dependencies(
  db: IDBDatabase,
  mode: FixtureMode,
  cancelAtSecondMonth?: () => void
): IngestionDependencies {
  let monthCall = 0;
  return {
    fetchArchives: async (_username, options) => {
      if (mode === 'offline-cache-only') throw createOfflineError();
      if (mode === 'failed') {
        throw createPubApiError('PLAYER_NOT_FOUND', 'Player not found', false, 404);
      }
      return mode === 'partial' || mode === 'cancelled'
        ? [archiveUrl('08'), archiveUrl('07')]
        : [archiveUrl('08')];
    },
    fetchMonthlyGames: async (_username, _year, _month, options) => {
      monthCall += 1;
      if (mode === 'cancelled' && monthCall > 1) {
        cancelAtSecondMonth?.();
        return new Promise<RawChesscomGame[]>((_, reject) => {
          if (options.signal?.aborted) return reject(createAbortError());
          options.signal?.addEventListener('abort', () => reject(createAbortError()), {
            once: true,
          });
        });
      }
      if (mode === 'partial' && monthCall > 1) {
        throw createPubApiError('UPSTREAM_UNAVAILABLE', 'Upstream unavailable', true, 503);
      }
      return mode === 'empty' ? [] : [rawGame(`fixture-${monthCall}`)];
    },
    readArchiveList: (username) => getArchiveListMeta(db, username),
    writeArchiveList: (record) => putArchiveListMeta(db, record),
    readArchiveSyncs: (username) => getArchiveSyncsForUser(db, username),
    readMonthGames: (username, month) => getGamesForMonth(db, username, month),
    validatePgns: async (games) => ({
      validGameIds: games.map(({ id }) => id),
      diagnostics: [],
      totalInvalid: 0,
      diagnosticCodes: [],
    }),
    persistMonth: (games, marker, signal) => saveSyncBatch(db, games, marker, signal),
  };
}

function staleMarker(): ArchiveSyncRecord {
  return {
    key: `${USERNAME}:2026-08`,
    username: USERNAME,
    month: '2026-08',
    lastSuccessfulFetchAt: NOW - 60 * 60_000,
    status: 'success',
    observedGameIds: ['fixture-game'],
    observedGameCount: 1,
    normalizerVersion: NORMALIZER_VERSION,
  };
}

export function Phase1TestHarness() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [storedCount, setStoredCount] = useState(0);
  const [status, setStatus] = useState<IngestionTerminalStatus | 'idle'>('idle');
  const [offlineCacheOnly, setOfflineCacheOnly] = useState(false);
  const [deletionText, setDeletionText] = useState('');
  const [retainedGames, setRetainedGames] = useState<readonly GameRecord[]>([]);
  const [selectedRetainedGame, setSelectedRetainedGame] = useState('');

  useEffect(() => {
    let opened: IDBDatabase | null = null;
    let active = true;
    void openDatabase().then(async (openedDb) => {
      opened = openedDb;
      const count = (await getGamesForUser(openedDb, USERNAME)).length;
      if (active) {
        setDb(openedDb);
        setStoredCount(count);
      }
    });
    return () => {
      active = false;
      if (opened) closeDatabase(opened);
    };
  }, []);

  async function seed(): Promise<void> {
    if (!db) return;
    await upsertGames(db, [game()]);
    setStoredCount((await getGamesForUser(db, USERNAME)).length);
  }

  async function remove(): Promise<void> {
    if (!db) return;
    const result = await deleteUserData(db, USERNAME);
    setStoredCount(0);
    setDeletionText(`${result.gamesDeleted} game deleted`);
  }

  async function run(mode: FixtureMode): Promise<void> {
    if (!db) return;
    setStatus('idle');
    setOfflineCacheOnly(false);
    setRetainedGames([]);
    setSelectedRetainedGame('');
    if (mode === 'offline-cache-only') {
      await putArchiveListMeta(db, {
        username: USERNAME,
        months: ['2026-08'],
        fetchedAt: NOW - 60 * 60_000,
      });
      await saveSyncBatch(db, [game()], staleMarker());
    }
    let manager: IngestionManager;
    manager = new IngestionManager(dependencies(db, mode, () => manager.cancel()));
    const resultPromise = manager.start(query(), {
      now: () => NOW,
      random: () => 0,
      wait: async () => undefined,
    });
    const result = await resultPromise;
    setStatus(result.status);
    setOfflineCacheOnly(result.offlineCacheOnly);
    setRetainedGames(result.games);
    setStoredCount((await getGamesForUser(db, USERNAME)).length);
  }

  return (
    <main>
      <h1>Phase 1 Test Harness</h1>
      <output data-testid="stored-game-count">{storedCount}</output>
      <output data-testid="ingestion-status">{status}</output>
      <output data-testid="offline-cache-only">{String(offlineCacheOnly)}</output>
      <output data-testid="deletion-result">{deletionText}</output>
      <output data-testid="selected-retained-game">{selectedRetainedGame}</output>
      {retainedGames.map((retainedGame) => (
        <button key={retainedGame.id} onClick={() => setSelectedRetainedGame(retainedGame.id)}>
          {`Select retained ${retainedGame.id}`}
        </button>
      ))}
      <button disabled={!db} onClick={() => void seed()}>
        Seed local game
      </button>
      <button disabled={!db} onClick={() => void remove()}>
        Delete local user data
      </button>
      {MODES.map((mode) => (
        <button key={mode} disabled={!db} onClick={() => void run(mode)}>
          {`Run ${mode}`}
        </button>
      ))}
    </main>
  );
}
