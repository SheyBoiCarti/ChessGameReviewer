import type { Diagnostic, UpstreamError } from './contracts';

export interface RawChesscomPlayer {
  username?: string;
  rating?: number;
  result?: string;
  uuid?: string;
  '@id'?: string;
}

export interface RawChesscomGame {
  url: string;
  pgn?: string;
  time_control?: string;
  end_time: number;
  rated?: boolean;
  time_class: string;
  rules: string;
  white: RawChesscomPlayer;
  black: RawChesscomPlayer;
  uuid?: string;
  '@id'?: string;
}

const MAX_MONTHLY_GAMES_LIMIT = 20000;

export function validateArchivesResponse(
  data: unknown
): { success: true; archives: string[] } | { success: false; diagnostic: Diagnostic } {
  if (typeof data !== 'object' || data === null) {
    return {
      success: false,
      diagnostic: {
        code: 'INVALID_UPSTREAM_RESPONSE',
        message: 'Archives payload must be a non-null object',
        severity: 'error',
      },
    };
  }

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj['archives'])) {
    return {
      success: false,
      diagnostic: {
        code: 'INVALID_UPSTREAM_RESPONSE',
        message: 'Archives property must be an array',
        severity: 'error',
      },
    };
  }

  const validArchives: string[] = [];
  for (const item of obj['archives']) {
    if (typeof item === 'string' && item.trim().length > 0) {
      validArchives.push(item);
    }
  }

  return { success: true, archives: validArchives };
}

function parseRawPlayer(data: unknown): RawChesscomPlayer | null {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const p = data as Record<string, unknown>;
  const player: RawChesscomPlayer = {};

  if (typeof p['username'] === 'string') {
    player.username = p['username'];
  }
  if (typeof p['rating'] === 'number' && Number.isFinite(p['rating'])) {
    player.rating = p['rating'];
  }
  if (typeof p['result'] === 'string') {
    player.result = p['result'];
  }
  if (typeof p['uuid'] === 'string') {
    player.uuid = p['uuid'];
  }
  if (typeof p['@id'] === 'string') {
    player['@id'] = p['@id'];
  }

  return player;
}

export function validateRawGame(
  data: unknown,
  fallbackIndex?: number
): { success: true; game: RawChesscomGame } | { success: false; diagnostic: Diagnostic } {
  if (typeof data !== 'object' || data === null) {
    return {
      success: false,
      diagnostic: {
        code: 'MALFORMED_GAME_RECORD',
        message: 'Game record must be an object',
        severity: 'warning',
        gameId: fallbackIndex !== undefined ? `game_index_${fallbackIndex}` : undefined,
      },
    };
  }

  const obj = data as Record<string, unknown>;

  const gameIdCandidate =
    typeof obj['url'] === 'string' && obj['url'].length > 0
      ? obj['url']
      : typeof obj['uuid'] === 'string' && obj['uuid'].length > 0
        ? obj['uuid']
        : fallbackIndex !== undefined
          ? `game_index_${fallbackIndex}`
          : undefined;

  // 1. Check url
  if (obj['url'] === undefined) {
    return {
      success: false,
      diagnostic: {
        code: 'MISSING_REQUIRED_GAME_FIELD',
        message: 'Game record missing required url field',
        severity: 'warning',
        gameId: gameIdCandidate,
      },
    };
  }
  if (typeof obj['url'] !== 'string' || obj['url'].trim().length === 0) {
    return {
      success: false,
      diagnostic: {
        code: 'MALFORMED_GAME_RECORD',
        message: 'Game record url must be a non-empty string',
        severity: 'warning',
        gameId: gameIdCandidate,
      },
    };
  }

  // 2. Check end_time
  if (obj['end_time'] === undefined) {
    return {
      success: false,
      diagnostic: {
        code: 'MISSING_REQUIRED_GAME_FIELD',
        message: 'Game record missing required end_time field',
        severity: 'warning',
        gameId: gameIdCandidate,
      },
    };
  }
  if (typeof obj['end_time'] !== 'number' || !Number.isFinite(obj['end_time'])) {
    return {
      success: false,
      diagnostic: {
        code: 'MALFORMED_GAME_RECORD',
        message: 'Game record end_time must be a valid number',
        severity: 'warning',
        gameId: gameIdCandidate,
      },
    };
  }

  // 3. Check time_class
  if (obj['time_class'] === undefined) {
    return {
      success: false,
      diagnostic: {
        code: 'MISSING_REQUIRED_GAME_FIELD',
        message: 'Game record missing required time_class field',
        severity: 'warning',
        gameId: gameIdCandidate,
      },
    };
  }
  if (typeof obj['time_class'] !== 'string' || obj['time_class'].trim().length === 0) {
    return {
      success: false,
      diagnostic: {
        code: 'MALFORMED_GAME_RECORD',
        message: 'Game record time_class must be a non-empty string',
        severity: 'warning',
        gameId: gameIdCandidate,
      },
    };
  }

  // 4. Check rules
  if (obj['rules'] === undefined) {
    return {
      success: false,
      diagnostic: {
        code: 'MISSING_REQUIRED_GAME_FIELD',
        message: 'Game record missing required rules field',
        severity: 'warning',
        gameId: gameIdCandidate,
      },
    };
  }
  if (typeof obj['rules'] !== 'string' || obj['rules'].trim().length === 0) {
    return {
      success: false,
      diagnostic: {
        code: 'MALFORMED_GAME_RECORD',
        message: 'Game record rules must be a non-empty string',
        severity: 'warning',
        gameId: gameIdCandidate,
      },
    };
  }

  // 5. Check white & black players
  if (obj['white'] === undefined || obj['black'] === undefined) {
    return {
      success: false,
      diagnostic: {
        code: 'MISSING_REQUIRED_GAME_FIELD',
        message: 'Game record missing required white or black player field',
        severity: 'warning',
        gameId: gameIdCandidate,
      },
    };
  }

  const whitePlayer = parseRawPlayer(obj['white']);
  const blackPlayer = parseRawPlayer(obj['black']);

  if (whitePlayer === null || blackPlayer === null) {
    return {
      success: false,
      diagnostic: {
        code: 'MALFORMED_GAME_RECORD',
        message: 'Game record white and black player fields must be objects',
        severity: 'warning',
        gameId: gameIdCandidate,
      },
    };
  }

  // Construct strictly typed game containing only required/known fields (ignoring unknown fields)
  const cleanGame: RawChesscomGame = {
    url: obj['url'],
    end_time: obj['end_time'],
    time_class: obj['time_class'],
    rules: obj['rules'],
    white: whitePlayer,
    black: blackPlayer,
  };

  if (typeof obj['pgn'] === 'string') {
    cleanGame.pgn = obj['pgn'];
  }
  if (typeof obj['time_control'] === 'string') {
    cleanGame.time_control = obj['time_control'];
  }
  if (typeof obj['rated'] === 'boolean') {
    cleanGame.rated = obj['rated'];
  }
  if (typeof obj['uuid'] === 'string') {
    cleanGame.uuid = obj['uuid'];
  }
  if (typeof obj['@id'] === 'string') {
    cleanGame['@id'] = obj['@id'];
  }

  return { success: true, game: cleanGame };
}

export function validateMonthlyGamesResponse(
  data: unknown
):
  | { success: true; games: RawChesscomGame[]; diagnostics: Diagnostic[] }
  | { success: false; diagnostic: Diagnostic } {
  if (typeof data !== 'object' || data === null) {
    return {
      success: false,
      diagnostic: {
        code: 'INVALID_UPSTREAM_RESPONSE',
        message: 'Monthly games response must be a non-null object',
        severity: 'error',
      },
    };
  }

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj['games'])) {
    return {
      success: false,
      diagnostic: {
        code: 'INVALID_UPSTREAM_RESPONSE',
        message: 'Monthly games property must be an array',
        severity: 'error',
      },
    };
  }

  const rawGamesArray = obj['games'];
  if (rawGamesArray.length > MAX_MONTHLY_GAMES_LIMIT) {
    return {
      success: false,
      diagnostic: {
        code: 'RESPONSE_TOO_LARGE',
        message: `Monthly games response exceeds maximum limit of ${MAX_MONTHLY_GAMES_LIMIT} items`,
        severity: 'error',
      },
    };
  }

  const games: RawChesscomGame[] = [];
  const diagnostics: Diagnostic[] = [];

  for (let i = 0; i < rawGamesArray.length; i++) {
    const item = rawGamesArray[i];
    const validation = validateRawGame(item, i);
    if (validation.success) {
      games.push(validation.game);
    } else {
      diagnostics.push(validation.diagnostic);
    }
  }

  return { success: true, games, diagnostics };
}

export function parseUpstreamHttpError(status: number, _rawBodyHint?: unknown): UpstreamError {
  if (status === 404) {
    return {
      code: 'PLAYER_NOT_FOUND',
      message: 'Upstream player or resource not found (HTTP 404)',
      retryable: false,
      status: 404,
    };
  }

  if (status === 410) {
    return {
      code: 'PLAYER_NOT_FOUND',
      message: 'Upstream player account is closed or resource gone (HTTP 410)',
      retryable: false,
      status: 410,
    };
  }

  if (status === 429) {
    return {
      code: 'UPSTREAM_RATE_LIMITED',
      message: 'Upstream rate limit exceeded (HTTP 429)',
      retryable: true,
      status: 429,
    };
  }

  if (status >= 500 && status <= 599) {
    return {
      code: 'UPSTREAM_UNAVAILABLE',
      message: `Upstream service is temporarily unavailable (HTTP ${status})`,
      retryable: true,
      status,
    };
  }

  if (status === 400) {
    return {
      code: 'INVALID_REQUEST',
      message: 'Upstream rejected request as invalid (HTTP 400)',
      retryable: false,
      status: 400,
    };
  }

  return {
    code: 'INVALID_UPSTREAM_RESPONSE',
    message: `Unexpected HTTP status ${status}`,
    retryable: false,
    status,
  };
}
