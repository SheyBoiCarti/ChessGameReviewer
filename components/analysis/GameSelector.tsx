'use client';

import { useMemo, useState } from 'react';

import type { GameRecord } from '@/lib/db/schema';
import { extractPgnPlayers } from '@/lib/chess/pgnHeaders';

export function GameSelector({
  games,
  selectedGameId,
  onSelect,
  onAnalyze,
  analysisStatus = {},
  hasLoaded = false,
  reviewDisabledReason,
}: {
  games: readonly GameRecord[];
  selectedGameId: string | null;
  onSelect(gameId: string): void;
  onAnalyze?(gameId: string): void;
  analysisStatus?: Readonly<Record<string, string>>;
  hasLoaded?: boolean;
  reviewDisabledReason?: string | undefined;
}) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'rating'>('newest');

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return games
      .map((game) => ({ game, opponent: opponentName(game) }))
      .filter(({ opponent }) => !needle || opponent.toLowerCase().includes(needle))
      .sort((left, right) => {
        if (sort === 'oldest') return left.game.endedAt - right.game.endedAt;
        if (sort === 'rating')
          return (right.game.opponentRating ?? -1) - (left.game.opponentRating ?? -1);
        return right.game.endedAt - left.game.endedAt;
      });
  }, [filter, games, sort]);

  const selectedGame = useMemo(
    () => (selectedGameId ? (games.find((g) => g.id === selectedGameId) ?? null) : null),
    [games, selectedGameId]
  );

  return (
    <section className="game-selector surface-panel" aria-labelledby="game-selector-heading">
      <div className="game-selector-header">
        <h3 id="game-selector-heading">Games ({games.length})</h3>
      </div>
      <div className="game-selector-controls">
        <label>
          Filter games
          <input
            value={filter}
            onChange={(event) => setFilter(event.currentTarget.value)}
            placeholder="Opponent name"
          />
        </label>
        <label>
          Sort games
          <select
            value={sort}
            onChange={(event) => setSort(event.currentTarget.value as typeof sort)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="rating">Opponent rating</option>
          </select>
        </label>
      </div>
      {selectedGame && onAnalyze ? (
        <div className="game-selector-selected-bar">
          <div
            className="selected-game-detail"
            title={`${playerName(selectedGame, 'white')} (${playerRating(selectedGame, 'white')}) vs ${playerName(selectedGame, 'black')} (${playerRating(selectedGame, 'black')})`}
          >
            <span className="selected-game-matchup">
              {playerName(selectedGame, 'white')} ({playerRating(selectedGame, 'white')}) vs{' '}
              {playerName(selectedGame, 'black')} ({playerRating(selectedGame, 'black')})
            </span>
          </div>
          <button
            type="button"
            className="button-primary game-selector-review-button"
            disabled={Boolean(reviewDisabledReason)}
            onClick={() => {
              if (!reviewDisabledReason && selectedGameId) {
                onAnalyze(selectedGameId);
              }
            }}
          >
            Review game
          </button>
          {reviewDisabledReason ? (
            <p className="review-disabled-reason" role="status">
              {reviewDisabledReason}
            </p>
          ) : null}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="empty-copy">
          {hasLoaded || games.length > 0
            ? 'No games match this filter. Try another opponent name.'
            : 'Load a player’s games to choose a game and begin reviewing.'}
        </p>
      ) : (
        <div
          className="result-viewport game-results"
          role="region"
          aria-label="Game results"
          tabIndex={0}
        >
          <ul className="game-card-list" aria-label="Games">
            {rows.map(({ game, opponent }) => (
              <li key={game.id} data-selected={game.id === selectedGameId}>
                <GameButton
                  game={game}
                  opponent={opponent}
                  selected={game.id === selectedGameId}
                  status={analysisStatus[game.id]}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function GameButton({
  game,
  opponent,
  selected,
  status,
  onSelect,
}: {
  game: GameRecord;
  opponent: string;
  selected: boolean;
  status: string | undefined;
  onSelect(gameId: string): void;
}) {
  const resultText = game.result === 'win' ? 'Win' : game.result === 'loss' ? 'Loss' : 'Draw';
  const resultClass = `game-result-badge game-result-badge--${game.result}`;
  const reviewStatus = status ?? 'Not reviewed';
  const oppRating =
    game.opponentRating !== null && game.opponentRating !== undefined
      ? `(${game.opponentRating})`
      : '';

  const accessibleLabel = `${opponent}${oppRating ? ` ${oppRating}` : ''}, ${resultText}, ${titleCase(game.timeClass)}, ${game.rated ? 'Rated' : 'Unrated'}, played as ${game.userColor}, user rating ${game.userRating ?? '—'}, opponent rating ${game.opponentRating ?? '—'}`;

  return (
    <button
      type="button"
      className="game-card game-row-button"
      aria-pressed={selected}
      aria-label={accessibleLabel}
      onClick={() => onSelect(game.id)}
    >
      <span className="game-row-top">
        <span className="game-row-opponent">
          <strong className="opponent-name">{opponent}</strong>
          {oppRating ? <span className="opponent-rating">{oppRating}</span> : null}
        </span>
        <span className={resultClass}>{resultText}</span>
      </span>
      <span className="game-row-bottom">
        <span className="game-row-time-class">{titleCase(game.timeClass)}</span>
        <span className="game-row-divider" aria-hidden="true">
          •
        </span>
        <span className="game-card__date game-card-date">{formatDate(game.endedAt)}</span>
        <span className="game-row-divider" aria-hidden="true">
          •
        </span>
        <span className="game-row-status">{reviewStatus}</span>
      </span>
      <span className="sr-only">
        {game.rated ? 'Rated' : 'Unrated'}, played as {game.userColor}, user rating{' '}
        {game.userRating ?? '—'}, opponent rating {game.opponentRating ?? '—'}
      </span>
    </button>
  );
}

function opponentName(game: GameRecord): string {
  const opponent = game.userColor === 'white' ? game.blackPlayer : game.whitePlayer;
  if (opponent?.username && opponent.username.trim().length > 0) {
    return opponent.username.trim();
  }
  if (game.pgn) {
    const pgnPlayers = extractPgnPlayers(game.pgn);
    const pgnOpponent =
      game.userColor === 'white' ? pgnPlayers.black.username : pgnPlayers.white.username;
    if (pgnOpponent && pgnOpponent.trim().length > 0) {
      return pgnOpponent.trim();
    }
  }
  return 'Unknown opponent';
}

function playerName(game: GameRecord, color: 'white' | 'black'): string {
  const player = color === 'white' ? game.whitePlayer : game.blackPlayer;
  if (player?.username && player.username.trim().length > 0) {
    return player.username.trim();
  }
  if (game.pgn) {
    const pgnPlayers = extractPgnPlayers(game.pgn);
    const pgnPlayer = color === 'white' ? pgnPlayers.white.username : pgnPlayers.black.username;
    if (pgnPlayer && pgnPlayer.trim().length > 0) {
      return pgnPlayer.trim();
    }
  }
  return color === 'white' ? 'White' : 'Black';
}

function playerRating(game: GameRecord, color: 'white' | 'black'): string {
  const player = color === 'white' ? game.whitePlayer : game.blackPlayer;
  if (player?.rating !== null && player?.rating !== undefined) {
    return String(player.rating);
  }
  const fallback = color === game.userColor ? game.userRating : game.opponentRating;
  if (fallback !== null && fallback !== undefined) {
    return String(fallback);
  }
  return '—';
}

function formatDate(endedAt: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(endedAt * 1000));
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
