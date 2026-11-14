'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { GameRecord } from '@/lib/db/schema';
import { extractPgnPlayers } from '@/lib/chess/pgnHeaders';

export type GameListSort = 'newest' | 'oldest' | 'rating';

/** List presentation state owned above GameSelector's mount lifetime (T26). */
export interface GameListState {
  filter: string;
  sort: GameListSort;
  page: number;
  scrollTop: number;
}

export const defaultGameListState: GameListState = {
  filter: '',
  sort: 'newest',
  page: 1,
  scrollTop: 0,
};

export function GameSelector({
  games,
  selectedGameId,
  onSelect,
  onReview,
  analysisStatus = {},
  hasLoaded = false,
  reviewDisabledReason,
  listState: controlledListState,
  onListStateChange,
}: {
  games: readonly GameRecord[];
  selectedGameId: string | null;
  onSelect(gameId: string): void;
  onReview?(gameId: string): void;
  analysisStatus?: Readonly<Record<string, string>>;
  hasLoaded?: boolean;
  reviewDisabledReason?: string | undefined;
  listState?: GameListState | undefined;
  onListStateChange?: ((next: GameListState) => void) | undefined;
}) {
  const controlled = controlledListState !== undefined && onListStateChange !== undefined;
  const [internalListState, setInternalListState] = useState<GameListState>(defaultGameListState);
  const listState = controlled ? controlledListState! : internalListState;
  const listStateRef = useRef(listState);
  listStateRef.current = listState;
  const onListStateChangeRef = useRef(onListStateChange);
  onListStateChangeRef.current = onListStateChange;

  const updateListState = (patch: Partial<GameListState>) => {
    const next = { ...listStateRef.current, ...patch };
    if (controlled) onListStateChange!(next);
    else setInternalListState(next);
  };

  const viewportRef = useRef<HTMLDivElement>(null);
  // React detaches refs before unmount cleanups, so scroll is tracked on the event
  // and persisted once when the selector leaves the DOM (T26).
  const lastScrollRef = useRef(listState.scrollTop);
  useEffect(() => {
    return () => {
      const save = onListStateChangeRef.current;
      if (save) {
        save({ ...listStateRef.current, scrollTop: lastScrollRef.current });
      }
    };
  }, []);

  const rows = useMemo(() => rowsOf(games, listState), [games, listState]);
  const hasRows = rows.length > 0;
  // Restore the saved scroll once matching rows exist again.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (viewport.scrollTop !== listState.scrollTop) {
      viewport.scrollTop = listState.scrollTop;
    }
    lastScrollRef.current = listState.scrollTop;
  }, [listState.scrollTop, hasRows]);

  const selectedGame = useMemo(
    () => (selectedGameId ? (games.find((g) => g.id === selectedGameId) ?? null) : null),
    [games, selectedGameId]
  );

  // The selected game remains selected even when a filter omits it; its preview explains
  // that it is outside this filter instead of silently replacing the selection (T26).
  const isSelectedInRows = rows.some(({ game }) => game.id === selectedGameId);

  return (
    <section className="game-selector surface-panel" aria-labelledby="game-selector-heading">
      <div className="game-selector-header">
        <h3 id="game-selector-heading">
          Games ({listState.filter.trim() ? `${rows.length} of ${games.length}` : games.length})
        </h3>
      </div>
      <div className="game-selector-controls">
        <label>
          Filter games
          <input
            value={listState.filter}
            onChange={(event) =>
              updateListState({
                filter: event.currentTarget.value,
                page: 1,
                scrollTop: 0,
              })
            }
            placeholder="Opponent name"
          />
        </label>
        <label>
          Sort games
          <select
            value={listState.sort}
            onChange={(event) =>
              updateListState({
                sort: event.currentTarget.value as GameListSort,
                page: 1,
                scrollTop: 0,
              })
            }
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="rating">Opponent rating</option>
          </select>
        </label>
      </div>
      {selectedGame && onReview ? (
        <div className="game-selector-selected-bar">
          <div
            className="selected-game-detail"
            title={`${playerName(selectedGame, 'white')} (${playerRating(selectedGame, 'white')}) vs ${playerName(selectedGame, 'black')} (${playerRating(selectedGame, 'black')})`}
          >
            <span className="selected-game-matchup">
              {playerName(selectedGame, 'white')} ({playerRating(selectedGame, 'white')}) vs{' '}
              {playerName(selectedGame, 'black')} ({playerRating(selectedGame, 'black')})
            </span>
            {!isSelectedInRows ? (
              <p className="selected-game-outside-filter" role="status">
                Selected game is outside this filter.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="button-primary game-selector-review-button"
            disabled={Boolean(reviewDisabledReason)}
            onClick={() => {
              if (!reviewDisabledReason) {
                onReview(selectedGame.id);
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
          ref={viewportRef}
          className="result-viewport game-results"
          role="region"
          aria-label="Game results"
          tabIndex={0}
          onScroll={(event) => {
            lastScrollRef.current = event.currentTarget.scrollTop;
          }}
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

function rowsOf(games: readonly GameRecord[], listState: GameListState) {
  const needle = listState.filter.trim().toLowerCase();
  return games
    .map((game) => ({ game, opponent: opponentName(game) }))
    .filter(({ opponent }) => !needle || opponent.toLowerCase().includes(needle))
    .sort((left, right) => {
      if (listState.sort === 'oldest') return left.game.endedAt - right.game.endedAt;
      if (listState.sort === 'rating')
        return (right.game.opponentRating ?? -1) - (left.game.opponentRating ?? -1);
      return right.game.endedAt - left.game.endedAt;
    });
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
