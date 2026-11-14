import { Chess } from 'chess.js';

import { OpeningGraphBuilder } from '@/lib/chess/graph/openingGraph';
import { parseGamePgn } from '@/lib/chess/pgnParser';
import { normalizePositionKey } from '@/lib/chess/fen';
import type { OpeningGraphSnapshot } from '@/lib/chess/graph/openingGraph';

/**
 * Legal two-route transposition graph built from parsed PGN games:
 * Nf3 d5 d4 Nf6 and d4 d5 Nf3 Nf6 reach the same normalized position,
 * and e4 e5 Nf3 branches independently. Position keys are actual
 * normalized FEN keys, not fake labels.
 */
const fixtureGames = [
  '1. Nf3 d5 2. d4 Nf6 1-0',
  '1. d4 d5 2. Nf3 Nf6 0-1',
  '1. e4 e5 2. Nf3 1/2-1/2',
];

export function buildOpeningGraphFixture(
  status: 'complete' | 'limited' = 'complete'
): OpeningGraphSnapshot {
  const games = fixtureGames.map((moves, index) => {
    const parsed = parseGamePgn({
      game: {
        id: `fixture-${index}`,
        url: `https://example.test/fixture-${index}`,
        usernameKey: 'fixture-user',
        userColor: 'white',
        result: moves.endsWith('1-0') ? 'win' : moves.endsWith('0-1') ? 'loss' : 'draw',
        endedAt: index,
        timeClass: 'blitz',
        rated: true,
        userRating: 1500,
        opponentRating: 1600,
        whitePlayer: { username: 'fixture-user', rating: 1500 },
        blackPlayer: { username: 'opponent', rating: 1600 },
        rules: 'chess',
        pgn: moves,
      },
    });
    if (!parsed.ok) throw new Error('Fixture PGN should parse');
    return parsed.game;
  });
  const graph = new OpeningGraphBuilder({ maxOpeningPlies: 4 }).build(games);
  return status === 'limited'
    ? { ...graph, status, remainingGameCount: 2, reachedLimit: 'maxEdges' as const }
    : graph;
}

let cached: OpeningGraphSnapshot | null = null;

export function openingGraphFixture(
  status: 'complete' | 'limited' = 'complete'
): OpeningGraphSnapshot {
  if (status === 'limited') return buildOpeningGraphFixture(status);
  if (!cached) cached = buildOpeningGraphFixture(status);
  return cached;
}

/** Normalized position key after the given SAN plies of the shared fixture game A. */
export function fixtureKeyAfter(...sans: string[]): string {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return normalizePositionKey(chess.fen());
}
