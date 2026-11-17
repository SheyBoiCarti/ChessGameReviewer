'use client';

import { useEffect, useState, type JSX } from 'react';
import { fetchPlayerProfile } from '@/lib/api/chesscomProfile';

import type { PlayerMetadata } from '@/lib/api/contracts';

export interface PlayerStripProps {
  player: PlayerMetadata;
  color: 'white' | 'black';
  position?: 'top' | 'bottom' | undefined;
}

// Share requests between the two board strips and retain photos through navigation.
const avatars = new Map<string, { expiresAt: number; request: Promise<string | null> }>();

function loadAvatar(username: string): Promise<string | null> {
  const cached = avatars.get(username);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  const request = fetchPlayerProfile(username)
    .then((profile) => {
      const url = profile.avatar;
      return url && new URL(url).protocol === 'https:' ? url : null;
    })
    .catch(() => null);
  if (avatars.size >= 100) avatars.delete(avatars.keys().next().value!);
  avatars.set(username, { expiresAt: Date.now() + 5 * 60 * 1000, request });
  return request;
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
  const usernameKey = rawUsername?.toLowerCase() ?? '';
  const [photo, setPhoto] = useState<{ username: string; url: string | null } | null>(null);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  useEffect(() => {
    if (!usernameKey) return;
    let active = true;
    void loadAvatar(usernameKey).then((url) => {
      if (active) setPhoto({ username: usernameKey, url });
    });
    return () => {
      active = false;
    };
  }, [usernameKey]);
  const avatar = photo?.username === usernameKey ? photo.url : null;

  const positionClass = position ? ` player-row--${position} player-strip--${position}` : '';

  return (
    <div
      className={`player-strip player-strip--${color} player-row player-row--${color}${positionClass}`}
      aria-label={`${colorLabel}: ${displayName}${hasRating ? ` (${player.rating})` : ''}`}
    >
      <div className="player-strip__avatar" aria-hidden="true">
        {avatar && avatar !== failedPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- Public Chess.com profile photos.
          <img
            src={avatar}
            alt=""
            crossOrigin="anonymous"
            onError={() => setFailedPhoto(avatar)}
            referrerPolicy="no-referrer"
          />
        ) : (
          initials
        )}
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
