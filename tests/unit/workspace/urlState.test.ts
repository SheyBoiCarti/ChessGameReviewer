import { describe, expect, it } from 'vitest';

import { readWorkspaceUrl, writeWorkspaceUrl } from '@/features/workspace/urlState';

describe('workspace url state', () => {
  it('preserves unrelated parameters and hash while encoding the workspace intent', () => {
    const url = new URL('http://localhost/?engine=single&campaign=x#board');
    const next = writeWorkspaceUrl(url, {
      tab: 'analysis',
      reviewMode: 'review',
      gameId: 'g 1',
      ply: 28,
    });
    expect(next.searchParams.get('engine')).toBe('single');
    expect(next.searchParams.get('campaign')).toBe('x');
    expect(next.hash).toBe('#board');
    expect(next.searchParams.get('view')).toBe('analysis');
    expect(next.searchParams.get('mode')).toBe('review');
    expect(next.searchParams.get('game')).toBe('g 1');
    expect(next.searchParams.get('ply')).toBe('28');
    expect(readWorkspaceUrl(next)).toEqual({
      tab: 'analysis',
      reviewMode: 'review',
      gameId: 'g 1',
      ply: 28,
    });
  });

  it('does not mutate the url it is given', () => {
    const url = new URL('http://localhost/?view=games&engine=unavailable');
    const next = writeWorkspaceUrl(url, {
      tab: 'analysis',
      reviewMode: 'analysis',
      gameId: 'g1',
    });
    expect(next).not.toBe(url);
    expect(url.searchParams.get('view')).toBe('games');
    expect(url.searchParams.get('game')).toBeNull();
    expect(url.searchParams.get('engine')).toBe('unavailable');
  });

  it('round-trips a view without game and ply', () => {
    const next = writeWorkspaceUrl(new URL('http://localhost/'), {
      tab: 'opening',
      reviewMode: 'review',
    });
    expect(next.searchParams.get('game')).toBeNull();
    expect(next.searchParams.get('ply')).toBeNull();
    expect(readWorkspaceUrl(next)).toEqual({ tab: 'opening', reviewMode: 'review' });
  });

  it('defaults a missing mode to review', () => {
    expect(readWorkspaceUrl(new URL('http://localhost/?view=analysis&game=g1'))).toEqual({
      tab: 'analysis',
      reviewMode: 'review',
      gameId: 'g1',
    });
  });

  it('rejects invalid views, modes, and plies', () => {
    expect(readWorkspaceUrl(new URL('http://localhost/'))).toBeNull();
    expect(readWorkspaceUrl(new URL('http://localhost/?view=nope'))).toBeNull();
    expect(readWorkspaceUrl(new URL('http://localhost/?view=analysis&mode=nope'))).toBeNull();
    expect(readWorkspaceUrl(new URL('http://localhost/?view=analysis&ply=-1'))).toBeNull();
    expect(readWorkspaceUrl(new URL('http://localhost/?view=analysis&ply=1.5'))).toBeNull();
    expect(readWorkspaceUrl(new URL('http://localhost/?view=analysis&ply=abc'))).toBeNull();
    expect(
      readWorkspaceUrl(new URL('http://localhost/?view=analysis&ply=9007199254740992'))
    ).toBeNull();
  });

  it('accepts ply zero and encodes ids with reserved characters', () => {
    const next = writeWorkspaceUrl(new URL('http://localhost/?view=games'), {
      tab: 'analysis',
      reviewMode: 'analysis',
      gameId: 'g/1?x',
      ply: 0,
    });
    expect(readWorkspaceUrl(next)).toEqual({
      tab: 'analysis',
      reviewMode: 'analysis',
      gameId: 'g/1?x',
      ply: 0,
    });
  });
});
