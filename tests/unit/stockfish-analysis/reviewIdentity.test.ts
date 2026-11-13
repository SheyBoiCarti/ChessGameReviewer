import { describe, expect, it } from 'vitest';
import { computePgnDigest, reviewResultKey } from '@/features/stockfish-analysis/reviewIdentity';

describe('review identity', () => {
  it('hashes the exact UTF-8 PGN with SHA-256', async () => {
    expect(await computePgnDigest('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
    expect(await computePgnDigest('1. e4')).not.toBe(await computePgnDigest('1. e4 '));
  });
  it('separates username, content, strength and delimiter-containing game IDs', () => {
    const key = reviewResultKey('PLAYER', 'one', 'digest', 'balanced');
    expect(key).toBe(reviewResultKey('player', 'one', 'digest', 'balanced'));
    expect(key).not.toBe(reviewResultKey('player', 'one', 'digest', 'deep'));
    expect(key).not.toBe(reviewResultKey('player', 'one', 'changed', 'balanced'));
    expect(reviewResultKey('a:b', 'c', 'd', 'quick')).not.toBe(
      reviewResultKey('a', 'b:c', 'd', 'quick')
    );
  });
});
