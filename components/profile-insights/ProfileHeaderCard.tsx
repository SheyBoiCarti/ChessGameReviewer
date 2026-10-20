'use client';

import React from 'react';
import type { ChesscomPlayerProfile, ChesscomPlayerStats } from '@/lib/api/chesscomProfile';

export interface ProfileHeaderCardProps {
  username: string;
  profile: ChesscomPlayerProfile | null;
  stats: ChesscomPlayerStats | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

function extractCountryCode(countryUrl?: string): string | null {
  if (!countryUrl) return null;
  try {
    const parts = countryUrl.split('/').filter(Boolean);
    const code = parts[parts.length - 1];
    return code ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}

function formatJoinDate(joinedSeconds?: number): string | null {
  if (!joinedSeconds || !Number.isFinite(joinedSeconds)) return null;
  const d = new Date(joinedSeconds * 1000);
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  return `Joined ${month} ${year}`;
}

export function ProfileHeaderCard({
  username,
  profile,
  stats,
  isLoading = false,
  onRefresh,
}: ProfileHeaderCardProps): React.JSX.Element {
  const displayName = profile?.name?.trim() || username;
  const title = profile?.title?.trim();
  const country = extractCountryCode(profile?.country);
  const joinDate = formatJoinDate(profile?.joined);

  const rapid = stats?.chess_rapid;
  const blitz = stats?.chess_blitz;
  const bullet = stats?.chess_bullet;
  const daily = stats?.chess_daily;

  return (
    <div className="profile-insights-card profile-header-card" data-testid="profile-header-card">
      <div className="profile-header-top">
        <div className="profile-header-user">
          {profile?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar} alt={`${displayName}'s avatar`} className="profile-avatar" />
          ) : (
            <div className="profile-avatar-fallback">{username.charAt(0).toUpperCase()}</div>
          )}

          <div className="profile-user-info">
            <div className="profile-name-row">
              <h2 className="profile-display-name">{displayName}</h2>
              {title ? <span className="profile-title-badge">{title}</span> : null}
            </div>

            <div className="profile-meta-row">
              <span className="profile-handle">@{username}</span>
              {country ? <span className="profile-country-badge">{country}</span> : null}
              {joinDate ? <span className="profile-join-date">{joinDate}</span> : null}
              {profile?.status ? (
                <span className="profile-status-pill">{profile.status}</span>
              ) : null}
            </div>
          </div>
        </div>

        {onRefresh ? (
          <div className="profile-header-actions">
            <button
              type="button"
              className="profile-refresh-btn"
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh Chess.com profile and stats"
              aria-label="Refresh profile data"
            >
              <svg
                className={`profile-refresh-icon ${isLoading ? 'animate-spin' : ''}`}
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
              <span>{isLoading ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="profile-ratings-ribbon" role="region" aria-label="Official Chess.com Ratings">
        <div className="profile-rating-pill">
          <span className="profile-rating-timeclass">Rapid</span>
          <span className="profile-rating-score">{rapid?.last?.rating ?? '—'}</span>
          {rapid?.best?.rating ? (
            <span className="profile-rating-peak">Peak {rapid.best.rating}</span>
          ) : null}
        </div>

        <div className="profile-rating-pill">
          <span className="profile-rating-timeclass">Blitz</span>
          <span className="profile-rating-score">{blitz?.last?.rating ?? '—'}</span>
          {blitz?.best?.rating ? (
            <span className="profile-rating-peak">Peak {blitz.best.rating}</span>
          ) : null}
        </div>

        <div className="profile-rating-pill">
          <span className="profile-rating-timeclass">Bullet</span>
          <span className="profile-rating-score">{bullet?.last?.rating ?? '—'}</span>
          {bullet?.best?.rating ? (
            <span className="profile-rating-peak">Peak {bullet.best.rating}</span>
          ) : null}
        </div>

        <div className="profile-rating-pill">
          <span className="profile-rating-timeclass">Daily</span>
          <span className="profile-rating-score">{daily?.last?.rating ?? '—'}</span>
          {daily?.best?.rating ? (
            <span className="profile-rating-peak">Peak {daily.best.rating}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
