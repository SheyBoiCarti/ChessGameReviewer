import type { GameRecord } from '@/lib/db/schema';
import { parsePgnHeaders } from '@/lib/chess/pgnHeaders';
import type { GameAnalysisResult } from '@/features/stockfish-analysis/analyzeGame';
import { filterGames } from './filterGames';
import type {
  InsightFilters,
  OutcomeCounts,
  RatingHistoryPoint,
  OpeningInsight,
  TacticalMistakeSummary,
  AggregatedProfileInsights,
} from './types';

export function computeOutcomes(
  games: readonly GameRecord[],
  userColor?: 'white' | 'black'
): OutcomeCounts {
  const relevantGames = userColor ? games.filter((g) => g.userColor === userColor) : games;

  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const game of relevantGames) {
    if (game.result === 'win') {
      wins += 1;
    } else if (game.result === 'loss') {
      losses += 1;
    } else if (game.result === 'draw') {
      draws += 1;
    }
  }

  const total = wins + losses + draws;
  const winRate = total > 0 ? Math.round((wins / total) * 1000) / 10 : 0;

  return { wins, losses, draws, total, winRate };
}

export function computeRatingTrend(games: readonly GameRecord[]): RatingHistoryPoint[] {
  const ratedGames = games.filter(
    (g): g is GameRecord & { userRating: number } =>
      typeof g.userRating === 'number' && Number.isFinite(g.userRating) && g.userRating > 0
  );

  const sorted = [...ratedGames].sort((a, b) => a.endedAt - b.endedAt);

  return sorted.map((g) => ({
    date: g.endedAt,
    rating: g.userRating,
    gameId: g.id,
    result: g.result,
    timeClass: g.timeClass,
  }));
}

export function computeStreaks(games: readonly GameRecord[]): {
  type: 'win' | 'loss' | 'draw' | 'none';
  count: number;
} {
  if (games.length === 0) {
    return { type: 'none', count: 0 };
  }

  const sorted = [...games].sort((a, b) => b.endedAt - a.endedAt);
  const first = sorted[0];
  if (!first) {
    return { type: 'none', count: 0 };
  }
  const latestResult = first.result;

  if (latestResult !== 'win' && latestResult !== 'loss' && latestResult !== 'draw') {
    return { type: 'none', count: 0 };
  }

  let count = 0;
  for (const game of sorted) {
    if (game.result === latestResult) {
      count += 1;
    } else {
      break;
    }
  }

  return { type: latestResult, count };
}

function formatEcoUrlName(ecoUrl?: string): string | undefined {
  if (!ecoUrl) return undefined;
  try {
    const url = new URL(ecoUrl);
    const pathname = url.pathname;
    const parts = pathname.split('/').filter(Boolean);
    const slug = parts[parts.length - 1];
    if (!slug) return undefined;
    return decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim();
  } catch {
    const parts = ecoUrl.split('/');
    const slug = parts[parts.length - 1];
    return slug ? slug.replace(/[-_]+/g, ' ').trim() : undefined;
  }
}

export function extractFirstMovesFromPgn(pgn: string): string {
  if (!pgn) return '';
  const body = pgn
    .replace(/^\[[^\]]*\]/gm, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = body.split(' ').filter(Boolean);
  const moves: string[] = [];
  for (const token of tokens) {
    if (token === '1-0' || token === '0-1' || token === '1/2-1/2' || token === '*') break;
    moves.push(token);
    if (moves.length >= 8) break;
  }
  return moves.join(' ');
}

export function computeOpeningStats(
  games: readonly GameRecord[],
  color: 'white' | 'black',
  limit: number = 5
): OpeningInsight[] {
  const relevantGames = games.filter((g) => g.userColor === color);
  const map = new Map<
    string,
    {
      eco?: string | undefined;
      name: string;
      moves: string;
      wins: number;
      losses: number;
      draws: number;
    }
  >();

  for (const game of relevantGames) {
    const headers = parsePgnHeaders(game.pgn);
    const eco = headers['ECO'] || undefined;
    const name =
      headers['Opening']?.trim() ||
      formatEcoUrlName(headers['ECOUrl']) ||
      (eco ? `Opening ${eco}` : 'Unknown Opening');

    let entry = map.get(name);
    if (!entry) {
      const moves = extractFirstMovesFromPgn(game.pgn);
      entry = { eco, name, moves, wins: 0, losses: 0, draws: 0 };
      map.set(name, entry);
    }

    if (game.result === 'win') {
      entry.wins += 1;
    } else if (game.result === 'loss') {
      entry.losses += 1;
    } else if (game.result === 'draw') {
      entry.draws += 1;
    }
  }

  const results: OpeningInsight[] = Array.from(map.values()).map((item) => {
    const played = item.wins + item.losses + item.draws;
    const winRate = played > 0 ? Math.round((item.wins / played) * 1000) / 10 : 0;
    return {
      eco: item.eco,
      name: item.name,
      moves: item.moves,
      played,
      wins: item.wins,
      losses: item.losses,
      draws: item.draws,
      winRate,
    };
  });

  results.sort((a, b) => {
    if (b.played !== a.played) {
      return b.played - a.played;
    }
    return b.winRate - a.winRate;
  });

  return results.slice(0, limit);
}

export function computeTacticalStats(
  games: readonly GameRecord[],
  analysisMap: Record<string, GameAnalysisResult>
): TacticalMistakeSummary {
  let totalEvaluatedMoves = 0;
  let blunders = 0;
  let mistakes = 0;
  let inaccuracies = 0;
  let misses = 0;
  let analyzedGamesCount = 0;

  let accuracySum = 0;
  let accuracyCount = 0;

  for (const game of games) {
    const analysis = analysisMap[game.id];
    if (analysis && analysis.summary) {
      analyzedGamesCount += 1;
      const colorSummary = analysis.summary[game.userColor];
      if (colorSummary) {
        totalEvaluatedMoves += colorSummary.eligibleMoves;
        if (
          colorSummary.accuracyEstimate !== null &&
          Number.isFinite(colorSummary.accuracyEstimate)
        ) {
          accuracySum += colorSummary.accuracyEstimate;
          accuracyCount += 1;
        }
        if (colorSummary.breakdown) {
          blunders += colorSummary.breakdown.blunder ?? 0;
          mistakes += colorSummary.breakdown.mistake ?? 0;
          inaccuracies += colorSummary.breakdown.inaccuracy ?? 0;
          misses += colorSummary.breakdown.miss ?? 0;
        }
      }
    } else if (game.accuracies) {
      const acc = game.accuracies[game.userColor];
      if (typeof acc === 'number' && Number.isFinite(acc)) {
        accuracySum += acc;
        accuracyCount += 1;
      }
    }
  }

  const avgAccuracy =
    accuracyCount > 0 ? Math.round((accuracySum / accuracyCount) * 10) / 10 : null;
  const blundersPerGame =
    analyzedGamesCount > 0 ? Math.round((blunders / analyzedGamesCount) * 100) / 100 : 0;

  return {
    totalEvaluatedMoves,
    avgAccuracy,
    blunders,
    mistakes,
    inaccuracies,
    misses,
    blundersPerGame,
  };
}

export function aggregateAllInsights(
  games: readonly GameRecord[],
  analysisMap: Record<string, GameAnalysisResult>,
  filters: InsightFilters,
  nowMs: number = Date.now()
): AggregatedProfileInsights {
  const filtered = filterGames(games, filters, nowMs);

  return {
    totalGames: filtered.length,
    overall: computeOutcomes(filtered),
    asWhite: computeOutcomes(filtered, 'white'),
    asBlack: computeOutcomes(filtered, 'black'),
    ratingPoints: computeRatingTrend(filtered),
    currentStreak: computeStreaks(filtered),
    topOpeningsWhite: computeOpeningStats(filtered, 'white'),
    topOpeningsBlack: computeOpeningStats(filtered, 'black'),
    tactics: computeTacticalStats(filtered, analysisMap),
  };
}
