'use client';

import type { JSX } from 'react';

import type { PlayerMetadata } from '@/lib/api/contracts';

export interface PlayerStripProps {
  player: PlayerMetadata;
  color: 'white' | 'black';
  position?: 'top' | 'bottom' | undefined;
}

export function getPlayerInitials(username: string | null | undefined): string {
  if (!username) return '?';
  const alphanumeric = username.replace(/[^a-zA-Z0-9]/g, '');
  if (alphanumeric.length === 0) return '?';
  return alphanumeric.slice(0, 2).toUpperCase();
}

export function PlayerStrip({ player, color, position }: PlayerStripProps): JSX.Element {
  const colorLabel = color === 'white' ? 'White' : 'Black';
  const rawUsername = player?.username?.trim();
  const displayName = rawUsername || 'Unknown player';
  const initials = getPlayerInitials(rawUsername);
  const hasRating = player?.rating !== null && player?.rating !== undefined;
  const ratingText = hasRating ? `(${player.rating})` : '\u2014';

  const positionClass = position ? ` player-row--${position} player-strip--${position}` : '';

  return (
    <div
      className={`player-strip player-strip--${color} player-row player-row--${color}${positionClass}`}
      aria-label={`${colorLabel}: ${displayName}${hasRating ? ` (${player.rating})` : ''}`}
    >
      <div className="player-strip__avatar" aria-hidden="true">
        {initials}
      </div>
      <div className="player-strip__info">
        <span
          className={`player-strip__color-dot player-strip__color-dot--${color}`}
          aria-hidden="true"
        />
        <span className="sr-only">{colorLabel}</span>
        <span className="player-strip__name player-row__name" title={displayName}>
          {displayName}
        </span>
        <span className="player-strip__rating player-row__rating tabular-nums">{ratingText}</span>
      </div>
    </div>
  );
}
