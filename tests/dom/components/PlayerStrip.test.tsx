import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fetchPlayerProfile } from '@/lib/api/chesscomProfile';

import { getPlayerInitials, PlayerStrip } from '@/components/board/PlayerStrip';

vi.mock('@/lib/api/chesscomProfile', () => ({ fetchPlayerProfile: vi.fn().mockResolvedValue({}) }));

describe('PlayerStrip', () => {
  it('loads profile photos, shares requests across navigation, and falls back when an image fails', async () => {
    vi.mocked(fetchPlayerProfile).mockResolvedValueOnce({
      username: 'photo-player',
      avatar: 'https://images.chesscomfiles.com/photo-player.jpg',
      joined: 0,
      status: 'basic',
      url: 'https://www.chess.com/member/photo-player',
    });
    const { container, unmount } = render(
      <PlayerStrip player={{ username: 'photo-player', rating: 1500 }} color="white" />
    );
    await waitFor(() =>
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        'https://images.chesscomfiles.com/photo-player.jpg'
      )
    );
    fireEvent.error(container.querySelector('img')!);
    expect(screen.getByText('PH')).toBeInTheDocument();
    unmount();
    const calls = vi.mocked(fetchPlayerProfile).mock.calls.length;
    const next = render(
      <PlayerStrip player={{ username: 'PHOTO-PLAYER', rating: 1500 }} color="black" />
    );
    await waitFor(() => expect(next.container.querySelector('img')).toBeInTheDocument());
    expect(fetchPlayerProfile).toHaveBeenCalledTimes(calls);
  });

  it('ignores an old profile response after the selected player changes', async () => {
    let resolve!: (profile: Awaited<ReturnType<typeof fetchPlayerProfile>>) => void;
    vi.mocked(fetchPlayerProfile).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const { container, rerender } = render(
      <PlayerStrip player={{ username: 'old-player', rating: 1500 }} color="white" />
    );
    rerender(<PlayerStrip player={{ username: 'new-player', rating: 1500 }} color="white" />);
    await act(async () =>
      resolve({
        username: 'old-player',
        avatar: 'https://example.com/old.jpg',
        joined: 0,
        status: 'basic',
        url: 'https://www.chess.com/member/old-player',
      })
    );
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('NE')).toBeInTheDocument();
  });
  it('renders player username, rating, initials avatar, and color dot', () => {
    render(
      <PlayerStrip
        player={{ username: 'MagnusCarlsen', rating: 2882 }}
        color="black"
        position="top"
      />
    );

    const strip = screen.getByLabelText('Black: MagnusCarlsen (2882)');
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveClass('player-strip--black');
    expect(strip).toHaveClass('player-row--top');

    expect(screen.getByText('MA')).toBeInTheDocument();
    expect(screen.getByText('MagnusCarlsen')).toBeInTheDocument();
    expect(screen.getByText('(2882)')).toBeInTheDocument();
    expect(screen.getByText('Black', { selector: '.sr-only' })).toBeInTheDocument();
  });

  it('handles missing username with "Unknown player" and initials "?"', () => {
    render(<PlayerStrip player={{ username: null, rating: 1500 }} color="white" />);

    const strip = screen.getByLabelText('White: Unknown player (1500)');
    expect(strip).toBeInTheDocument();
    expect(screen.getByText('Unknown player')).toBeInTheDocument();
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('handles missing rating with em dash fallback', () => {
    render(<PlayerStrip player={{ username: 'Guest', rating: null }} color="black" />);

    const strip = screen.getByLabelText('Black: Guest');
    expect(strip).toBeInTheDocument();
    expect(screen.getByText('\u2014')).toBeInTheDocument();
    expect(screen.queryByText(/\(\d+\)/)).not.toBeInTheDocument();
  });

  it('handles non-alphanumeric username with initials "?"', () => {
    render(<PlayerStrip player={{ username: '---_---', rating: null }} color="white" />);

    expect(screen.getByText('?')).toBeInTheDocument();
    expect(screen.getByText('---_---')).toBeInTheDocument();
  });

  it('retains full name in title attribute for truncated long names', () => {
    const longName = 'VeryLongChessGrandmasterUsernameThatWillTruncateOnSmallScreens';
    render(<PlayerStrip player={{ username: longName, rating: 2600 }} color="white" />);

    const nameElement = screen.getByText(longName);
    expect(nameElement).toHaveAttribute('title', longName);
    expect(screen.getByLabelText(`White: ${longName} (2600)`)).toBeInTheDocument();
  });

  describe('getPlayerInitials', () => {
    it('returns first two alphanumeric characters in uppercase', () => {
      expect(getPlayerInitials('hikaru')).toBe('HI');
      expect(getPlayerInitials('MagnusCarlsen')).toBe('MA');
      expect(getPlayerInitials('user123')).toBe('US');
    });

    it('returns single uppercase character if length is 1', () => {
      expect(getPlayerInitials('k')).toBe('K');
    });

    it('returns "?" for null, undefined, empty, or non-alphanumeric strings', () => {
      expect(getPlayerInitials(null)).toBe('?');
      expect(getPlayerInitials(undefined)).toBe('?');
      expect(getPlayerInitials('')).toBe('?');
      expect(getPlayerInitials('   ')).toBe('?');
      expect(getPlayerInitials('!@#$%^&*()')).toBe('?');
      expect(getPlayerInitials('---')).toBe('?');
    });

    it('ignores leading non-alphanumeric characters', () => {
      expect(getPlayerInitials('_test')).toBe('TE');
      expect(getPlayerInitials('--gm--')).toBe('GM');
    });
  });
});
