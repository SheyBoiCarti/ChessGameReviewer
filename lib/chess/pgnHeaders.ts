import type { PlayerMetadata } from '../api/contracts';

const HEADER_REGEX = /^\[([A-Za-z0-9_]+)\s+"((?:[^"\\]|\\.)*)"\]/gm;

export function parsePgnHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!pgn || typeof pgn !== 'string') return headers;
  let match: RegExpExecArray | null;
  HEADER_REGEX.lastIndex = 0;
  while ((match = HEADER_REGEX.exec(pgn)) !== null) {
    const key = match[1];
    const rawVal = match[2];
    if (key && rawVal !== undefined) {
      headers[key] = rawVal.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }
  return headers;
}

export function extractPgnPlayers(pgn: string): { white: PlayerMetadata; black: PlayerMetadata } {
  const headers = parsePgnHeaders(pgn);
  const whiteName = headers['White']?.trim() || null;
  const blackName = headers['Black']?.trim() || null;
  const whiteEloRaw = headers['WhiteElo'] ? Number(headers['WhiteElo']) : null;
  const blackEloRaw = headers['BlackElo'] ? Number(headers['BlackElo']) : null;
  const whiteRating =
    whiteEloRaw !== null && Number.isFinite(whiteEloRaw) && whiteEloRaw > 0 ? whiteEloRaw : null;
  const blackRating =
    blackEloRaw !== null && Number.isFinite(blackEloRaw) && blackEloRaw > 0 ? blackEloRaw : null;

  return {
    white: { username: whiteName, rating: whiteRating },
    black: { username: blackName, rating: blackRating },
  };
}
