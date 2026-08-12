import { describe, expect, it } from 'vitest';

import { parseGamePgn } from '@/lib/chess/pgnParser';

describe('parseGamePgn', () => {
  it('returns a stable diagnostic when PGN is missing', () => {
    const result = parseGamePgn({
      game: { id: 'missing', url: 'https://example.test/missing', usernameKey: 'alice', userColor: 'white', result: 'draw', endedAt: 0, timeClass: 'blitz', rated: true, userRating: null, opponentRating: null, rules: 'chess' },
    });
    expect(result).toMatchObject({ ok: false, gameId: 'missing', errors: [expect.objectContaining({ code: 'MISSING_PGN' })] });
  });
  it('replays a legal main line into continuous full-FEN plies and canonical UCI', () => {
    const result = parseGamePgn({
      game: {
        id: 'game-1',
        url: 'https://www.chess.com/game/live/1',
        usernameKey: 'alice',
        userColor: 'white',
        result: 'win',
        endedAt: 1,
        timeClass: 'blitz',
        rated: true,
        userRating: 1500,
        opponentRating: 1600,
        rules: 'chess',
        pgn: '[Event "Test"]\n\n1. e4 e5 2. Nf3 Nc6 1-0',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.game.plies.map((ply) => [ply.san, ply.uci])).toEqual([
      ['e4', 'e2e4'],
      ['e5', 'e7e5'],
      ['Nf3', 'g1f3'],
      ['Nc6', 'b8c6'],
    ]);
    expect(result.game.plies[0]?.fenBefore).toBe(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    );
    expect(result.game.plies[3]?.fenAfter).toBe(
      'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'
    );
    expect(
      result.game.plies.every(
        (ply, index, plies) => index === 0 || ply.fenBefore === plies[index - 1]?.fenAfter
      )
    ).toBe(true);
  });

  it('returns a stable failure diagnostic instead of partial plies for an illegal move', () => {
    const result = parseGamePgn({
      game: {
        id: 'broken-game',
        url: 'https://www.chess.com/game/live/2',
        usernameKey: 'alice',
        userColor: 'black',
        result: 'loss',
        endedAt: 2,
        timeClass: 'rapid',
        rated: true,
        userRating: 1500,
        opponentRating: 1600,
        rules: 'chess',
        pgn: '1. e4 e5 2. Qh9 1-0',
      },
    });

    expect(result).toEqual({
      ok: false,
      gameId: 'broken-game',
      errors: [
        expect.objectContaining({ code: 'ILLEGAL_PGN', gameId: 'broken-game', severity: 'error' }),
      ],
    });
  });

  it('uses a valid SetUp FEN as the replay start position', () => {
    const result = parseGamePgn({
      game: {
        id: 'setup-game',
        url: 'https://www.chess.com/game/live/3',
        usernameKey: 'alice',
        userColor: 'white',
        result: 'draw',
        endedAt: 3,
        timeClass: 'daily',
        rated: false,
        userRating: null,
        opponentRating: null,
        rules: 'chess',
        pgn: '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/4K3 w - - 0 1"]\n\n1. Kf2 1/2-1/2',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.plies[0]?.fenBefore).toBe('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
  });

  it('includes the promoted piece in canonical UCI', () => {
    const result = parseGamePgn({
      game: {
        id: 'promotion-game',
        url: 'https://www.chess.com/game/live/4',
        usernameKey: 'alice',
        userColor: 'white',
        result: 'win',
        endedAt: 4,
        timeClass: 'bullet',
        rated: true,
        userRating: 1500,
        opponentRating: 1600,
        rules: 'chess',
        pgn: '[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/K7 w - - 0 1"]\n\n1. a8=Q+ 1-0',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.game.plies[0]?.uci).toBe('a7a8q');
  });
});
