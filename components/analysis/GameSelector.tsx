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
}: {
  games: readonly GameRecord[];
  selectedGameId: string | null;
  onSelect(gameId: string): void;
  onAnalyze?(gameId: string): void;
  analysisStatus?: Readonly<Record<string, string>>;
  hasLoaded?: boolean;
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

  return (
    <section className="game-selector surface-panel" aria-labelledby="game-selector-heading">
      <h3 id="game-selector-heading">Games</h3>
      <div className="game-selector-controls">
        <label>
          Filter games
          <input value={filter} onChange={(event) => setFilter(event.currentTarget.value)} />
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
      {selectedGameId && onAnalyze ? (
        <div className="game-selector-actions">
          <button
            type="button"
            className="button-primary game-selector-actions__analyze"
            onClick={() => onAnalyze(selectedGameId)}
          >
            Open Stockfish Analysis for Selected Game →
          </button>
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
  return (
    <button
      type="button"
      className="game-card"
      aria-pressed={selected}
      onClick={() => onSelect(game.id)}
    >
      <span className="game-card__heading">
        <strong>{opponent}</strong>
        <span>{formatDate(game.endedAt)}</span>
      </span>
      <span className="game-card__meta">
        <span>{titleCase(game.result)}</span>
        <span>{titleCase(game.userColor)}</span>
        <span>
          {game.userRating ?? '—'} vs {game.opponentRating ?? '—'}
        </span>
      </span>
      <span className="game-card__meta game-card__meta--subtle">
        <span>{titleCase(game.timeClass)}</span>
        <span>{game.rated ? 'Rated' : 'Unrated'}</span>
        <span>{status ?? 'Not analysed'}</span>
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
