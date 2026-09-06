import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { getPlayerInitials, PlayerStrip } from '@/components/board/PlayerStrip';

describe('PlayerStrip', () => {
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
