import type { GameQuery } from '../../lib/api/contracts';
import type { RawChesscomGame } from '../../lib/api/chesscomSchemas';
import { NORMALIZER_VERSION, type ArchiveSyncRecord, type GameRecord } from '../../lib/db/schema';

export { makeOversizedMonthlyGamesFixture } from '../fixtures/upstream/oversizedMonthlyGames';

export const NOW = Date.UTC(2026, 7, 12, 12);

export function makeQuery(overrides: Partial<GameQuery> = {}): GameQuery {
  return {
    username: 'janedoe',
    maxGames: 500,
    timeClasses: ['bullet', 'blitz', 'rapid', 'daily'],
    colors: ['white', 'black'],
    ...overrides,
  };
}

export function makeRawGame(overrides: Partial<RawChesscomGame> = {}): RawChesscomGame {
  return {
    url: 'https://www.chess.com/game/live/100',
    uuid: 'game-100',
    pgn: '1. e4 e5 1/2-1/2',
    end_time: Math.floor(NOW / 1000),
    time_class: 'blitz',
    rules: 'chess',
    rated: true,
    white: { username: 'janedoe', rating: 1500, result: 'agreed' },
    black: { username: 'opponent', rating: 1500, result: 'agreed' },
    ...overrides,
  };
}

export function makeGameRecord(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: 'game-100',
    username: 'janedoe',
    url: 'https://www.chess.com/game/live/100',
    userColor: 'white',
    result: 'draw',
    endedAt: Math.floor(NOW / 1000),
    timeClass: 'blitz',
    rated: true,
    userRating: 1500,
    opponentRating: 1500,
    whitePlayer: { username: 'janedoe', rating: 1500 },
    blackPlayer: { username: 'opponent', rating: 1500 },
    pgn: '1. e4 e5 1/2-1/2',
    rules: 'chess',
    ...overrides,
  };
}

export function makeArchiveSync(overrides: Partial<ArchiveSyncRecord> = {}): ArchiveSyncRecord {
  return {
    key: 'janedoe:2026-08',
    username: 'janedoe',
    month: '2026-08',
    lastSuccessfulFetchAt: NOW - 60_000,
    status: 'success',
    observedGameIds: ['game-100'],
    observedGameCount: 1,
    normalizerVersion: NORMALIZER_VERSION,
    ...overrides,
  };
}

export function jsonResponse(value: unknown, url: string, init: ResponseInit = {}): Response {
  const response = new Response(JSON.stringify(value), {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}
