'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { GameRecord } from '@/lib/db/schema';
import type { GameAnalysisResult } from '@/features/stockfish-analysis/analyzeGame';
import { openDatabase } from '@/lib/db/openDatabase';
import { getPlayerProfile, putPlayerProfile } from '@/lib/db/repositories';
import {
  fetchPlayerProfile,
  fetchPlayerStats,
  type CachedProfileRecord,
} from '@/lib/api/chesscomProfile';
import { aggregateAllInsights } from '@/features/profile-insights/aggregations';
import type { InsightFilters } from '@/features/profile-insights/types';

import { ProfileHeaderCard } from './ProfileHeaderCard';
import { InsightsFilterBar } from './InsightsFilterBar';
import { PerformanceKpiGrid } from './PerformanceKpiGrid';
import { RatingTrendChart } from './RatingTrendChart';
import { OutcomeDistributionChart } from './OutcomeDistributionChart';
import { TopOpeningsCard } from './TopOpeningsCard';
import { TacticalMistakesCard } from './TacticalMistakesCard';

export interface ProfileInsightsDashboardProps {
  username: string | null;
  games: readonly GameRecord[];
  analysisMap: Record<string, GameAnalysisResult>;
  onNavigateToGames?: () => void;
}

const DEFAULT_FILTERS: InsightFilters = {
  timeClass: 'all',
  color: 'all',
  dateRange: 'all',
};

const ONE_HOUR_MS = 3600000;

export function ProfileInsightsDashboard({
  username,
  games,
  analysisMap,
  onNavigateToGames,
}: ProfileInsightsDashboardProps): React.JSX.Element {
  const [filters, setFilters] = useState<InsightFilters>(DEFAULT_FILTERS);
  const [cachedData, setCachedData] = useState<CachedProfileRecord | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(false);

  // Refresh profile & stats handler
  const refreshProfileData = useCallback(async () => {
    if (!username) return;

    setIsLoadingProfile(true);
    try {
      const [profile, stats] = await Promise.allSettled([
        fetchPlayerProfile(username),
        fetchPlayerStats(username),
      ]);

      setCachedData((prev) => {
        const resolvedProfile =
          profile.status === 'fulfilled' ? profile.value : (prev?.profile ?? null);
        const resolvedStats = stats.status === 'fulfilled' ? stats.value : (prev?.stats ?? null);

        const newRecord: CachedProfileRecord = {
          username,
          profile: resolvedProfile,
          stats: resolvedStats,
          fetchedAt: Date.now(),
        };

        void openDatabase()
          .then((db) => putPlayerProfile(db, newRecord))
          .catch(() => {});

        return newRecord;
      });
    } catch {
      // Fetch failures handled gracefully
    } finally {
      setIsLoadingProfile(false);
    }
  }, [username]);

  // Load cached profile from IndexedDB on user change, then background refresh if needed
  useEffect(() => {
    let active = true;

    if (!username) {
      setCachedData(null);
      return;
    }

    async function initProfile() {
      let cached: CachedProfileRecord | null = null;
      try {
        const db = await openDatabase();
        cached = await getPlayerProfile(db, username!);
        if (active && cached) {
          setCachedData(cached);
        }
      } catch {
        // IDB read error ignored gracefully
      }

      // If no cache or cache older than 1 hour, fetch fresh in background
      if (active && (!cached || Date.now() - cached.fetchedAt > ONE_HOUR_MS)) {
        void refreshProfileData();
      }
    }

    void initProfile();

    return () => {
      active = false;
    };
  }, [username, refreshProfileData]);

  // Compute aggregated insights based on current filters
  const aggregated = useMemo(() => {
    return aggregateAllInsights(games, analysisMap, filters);
  }, [games, analysisMap, filters]);

  // Compute peak rating across all time classes and historical trend
  const peakRating = useMemo(() => {
    const statPeaks: number[] = [];
    if (cachedData?.stats) {
      const { chess_rapid, chess_blitz, chess_bullet, chess_daily } = cachedData.stats;
      if (chess_rapid?.best?.rating) statPeaks.push(chess_rapid.best.rating);
      if (chess_blitz?.best?.rating) statPeaks.push(chess_blitz.best.rating);
      if (chess_bullet?.best?.rating) statPeaks.push(chess_bullet.best.rating);
      if (chess_daily?.best?.rating) statPeaks.push(chess_daily.best.rating);
    }

    const trendRatings = aggregated.ratingPoints.map((p) => p.rating);
    const all = [...statPeaks, ...trendRatings];
    return all.length > 0 ? Math.max(...all) : null;
  }, [cachedData, aggregated.ratingPoints]);

  // 1. Empty state: No active username
  if (!username) {
    return (
      <div className="profile-insights-container" role="region" aria-label="Profile insights">
        <div className="profile-empty-dashboard">
          <div className="profile-empty-icon">📊</div>
          <h3>No active player selected</h3>
          <p>Search for a Chess.com username in the Games tab to explore performance insights.</p>
          {onNavigateToGames ? (
            <button type="button" className="profile-cta-btn" onClick={onNavigateToGames}>
              Go to Games Tab
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // 2. Empty state: Username active but no games ingested
  if (games.length === 0) {
    return (
      <div className="profile-insights-container" role="region" aria-label="Profile insights">
        <ProfileHeaderCard
          username={username}
          profile={cachedData?.profile ?? null}
          stats={cachedData?.stats ?? null}
          isLoading={isLoadingProfile}
          onRefresh={refreshProfileData}
        />

        <div className="profile-empty-dashboard">
          <div className="profile-empty-icon">♟️</div>
          <h3>No ingested games found for {username}</h3>
          <p>
            Ingest recent game archives to calculate your win/loss trends, top openings, and
            Stockfish tactical accuracies.
          </p>
          {onNavigateToGames ? (
            <button type="button" className="profile-cta-btn" onClick={onNavigateToGames}>
              Load Games from Chess.com
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="profile-insights-container" role="region" aria-label="Profile insights">
      <ProfileHeaderCard
        username={username}
        profile={cachedData?.profile ?? null}
        stats={cachedData?.stats ?? null}
        isLoading={isLoadingProfile}
        onRefresh={refreshProfileData}
      />

      <InsightsFilterBar filters={filters} onChange={setFilters} />

      {aggregated.totalGames === 0 ? (
        <div className="profile-no-matches-card">
          <p>No games match the selected filters.</p>
          <button
            type="button"
            className="profile-reset-btn"
            onClick={() => setFilters(DEFAULT_FILTERS)}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <>
          <PerformanceKpiGrid
            totalGames={aggregated.totalGames}
            winRate={aggregated.overall.winRate}
            currentStreak={aggregated.currentStreak}
            avgAccuracy={aggregated.tactics.avgAccuracy}
            peakRating={peakRating}
          />

          <div className="profile-dashboard-grid">
            <div className="profile-dashboard-col">
              <RatingTrendChart points={aggregated.ratingPoints} />
              <OutcomeDistributionChart
                overall={aggregated.overall}
                asWhite={aggregated.asWhite}
                asBlack={aggregated.asBlack}
              />
            </div>

            <div className="profile-dashboard-col">
              <TopOpeningsCard
                whiteOpenings={aggregated.topOpeningsWhite}
                blackOpenings={aggregated.topOpeningsBlack}
              />
              <TacticalMistakesCard tactics={aggregated.tactics} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
