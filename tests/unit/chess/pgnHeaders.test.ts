import { describe, it, expect } from 'vitest';
import { parsePgnHeaders, extractPgnPlayers } from '@/lib/chess/pgnHeaders';

describe('PGN Header Parser Helper', () => {
  describe('parsePgnHeaders', () => {
    it('parses standard PGN header tags', () => {
      const pgn = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2024.01.01"]
[White "MagnusCarlsen"]
[Black "HikaruNakamura"]
[Result "1-0"]
[WhiteElo "2850"]
[BlackElo "2800"]

1. e4 e5 1-0`;

      const headers = parsePgnHeaders(pgn);
      expect(headers['Event']).toBe('Live Chess');
      expect(headers['Site']).toBe('Chess.com');
      expect(headers['White']).toBe('MagnusCarlsen');
      expect(headers['Black']).toBe('HikaruNakamura');
      expect(headers['WhiteElo']).toBe('2850');
      expect(headers['BlackElo']).toBe('2800');
      expect(headers['Result']).toBe('1-0');
    });

    it('handles escaped quotes and backslashes in header values', () => {
      const pgn = `[Event "Live \\"Blitz\\" Cup"]
[White "Player \\"The Boss\\" One"]
[Black "Player \\\\ Special"]`;

      const headers = parsePgnHeaders(pgn);
      expect(headers['Event']).toBe('Live "Blitz" Cup');
      expect(headers['White']).toBe('Player "The Boss" One');
      expect(headers['Black']).toBe('Player \\ Special');
    });

    it('gracefully handles empty, missing, or malformed PGN strings', () => {
      expect(parsePgnHeaders('')).toEqual({});
      expect(parsePgnHeaders('   \n  \t  ')).toEqual({});
      expect(parsePgnHeaders('1. e4 e5 2. Nf3 Nc6')).toEqual({});
      expect(parsePgnHeaders('[IncompleteHeader')).toEqual({});
      expect(parsePgnHeaders('[NoClosingQuote "value]')).toEqual({});
    });
  });

  describe('extractPgnPlayers', () => {
    it('extracts white and black player metadata with numeric ratings', () => {
      const pgn = `[White "MagnusCarlsen"]
[Black "HikaruNakamura"]
[WhiteElo "2850"]
[BlackElo "2800"]

1. e4 1-0`;

      const result = extractPgnPlayers(pgn);
      expect(result).toEqual({
        white: { username: 'MagnusCarlsen', rating: 2850 },
        black: { username: 'HikaruNakamura', rating: 2800 },
      });
    });

    it('handles missing or unparseable ratings by falling back to null', () => {
      const pgn = `[White "Alice"]
[Black "Bob"]
[WhiteElo "invalid"]
[BlackElo "?"]`;

      const result = extractPgnPlayers(pgn);
      expect(result).toEqual({
        white: { username: 'Alice', rating: null },
        black: { username: 'Bob', rating: null },
      });
    });

    it('handles missing player headers by falling back to username null', () => {
      const pgn = `[Event "Casual Game"]
[WhiteElo "1500"]`;

      const result = extractPgnPlayers(pgn);
      expect(result).toEqual({
        white: { username: null, rating: 1500 },
        black: { username: null, rating: null },
      });
    });

    it('trims whitespace on usernames', () => {
      const pgn = `[White "   AliceInChains   "]
[Black "   BobDylan   "]`;

      const result = extractPgnPlayers(pgn);
      expect(result.white.username).toBe('AliceInChains');
      expect(result.black.username).toBe('BobDylan');
    });
  });
});
