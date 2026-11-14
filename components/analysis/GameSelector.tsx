'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { GameRecord } from '@/lib/db/schema';
import { extractPgnPlayers, parsePgnHeaders } from '@/lib/chess/pgnHeaders';

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

  const metadata = useMemo(
    () =>
      games.map((game) => {
        const headers = parsePgnHeaders(game.pgn);
        return {
          game,
          opponent: opponentName(game),
          date: formatDate(game.endedAt),
          timeControl: game.timeControl || headers.TimeControl || 'Unknown time control',
          opening: [headers.ECO, headers.Opening, headers.Variation].filter(Boolean).join(' · '),
        };
      }),
    [games]
  );
  const rows = useMemo(
    () => rowsOf(metadata, listState.filter, listState.sort),
    [metadata, listState.filter, listState.sort]
  );
  const pageCount = Math.max(1, Math.ceil(rows.length / 20));
  const page = Math.max(1, Math.min(listState.page, pageCount));
  const visibleRows = rows.slice((page - 1) * 20, page * 20);
  useEffect(() => {
    if (listState.page !== page) {
      const next = { ...listStateRef.current, page, scrollTop: 0 };
      if (controlled) onListStateChangeRef.current?.(next);
      else setInternalListState(next);
    }
  }, [page, listState.page, controlled]);
  const hasRows = rows.length > 0;
  // Restore the saved scroll once matching rows exist again.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (viewport.scrollTop !== listState.scrollTop) {
      viewport.scrollTop = listState.scrollTop;
    }
    lastScrollRef.current = listState.scrollTop;
  }, [listState.scrollTop, hasRows, listState.filter, listState.sort, page]);

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
        <div className="empty-copy">
          <p>
            {games.length > 0
              ? 'No games match this filter. Try another opponent name.'
              : hasLoaded
                ? 'No games found for this search. Try another date range or edit your search.'
                : 'Find a player’s games to choose a game and begin reviewing.'}
          </p>
          {listState.filter.trim() ? (
            <button
              type="button"
              onClick={() => updateListState({ filter: '', page: 1, scrollTop: 0 })}
            >
              Clear filter
            </button>
          ) : null}
        </div>
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
            {visibleRows.map(({ game, opponent, date, timeControl, opening }) => (
              <li key={game.id} data-selected={game.id === selectedGameId}>
                <GameButton
                  game={game}
                  opponent={opponent}
                  selected={game.id === selectedGameId}
                  status={analysisStatus[game.id]}
                  onSelect={onSelect}
                  onReview={onReview}
                  date={date}
                  timeControl={timeControl}
                  opening={opening}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      {rows.length > 0 ? (
        <nav className="game-pagination" aria-label="Game pages">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => updateListState({ page: page - 1, scrollTop: 0 })}
          >
            Previous page
          </button>
          <span role="status">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            disabled={page === pageCount}
            onClick={() => updateListState({ page: page + 1, scrollTop: 0 })}
          >
            Next page
          </button>
        </nav>
      ) : null}
    </section>
  );
}

interface GameRowMetadata {
  game: GameRecord;
  opponent: string;
  date: string;
  timeControl: string;
  opening: string;
}

function rowsOf(metadata: GameRowMetadata[], filter: string, sort: GameListSort) {
  const needle = filter.trim().toLowerCase();
  return metadata
    .filter(({ opponent }) => !needle || opponent.toLowerCase().includes(needle))
    .sort((left, right) => {
      if (sort === 'oldest') return left.game.endedAt - right.game.endedAt;
      if (sort === 'rating')
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
  onReview,
  date,
  timeControl,
  opening,
}: {
  game: GameRecord;
  opponent: string;
  selected: boolean;
  status: string | undefined;
  onSelect(gameId: string): void;
  onReview?: ((gameId: string) => void) | undefined;
  date: string;
  timeControl: string;
  opening: string;
}) {
  const resultText = game.result === 'win' ? 'Win' : game.result === 'loss' ? 'Loss' : 'Draw';
  const resultClass = `game-result-badge game-result-badge--${game.result}`;
  const reviewStatus = status ?? 'Not reviewed';
  const oppRating =
    game.opponentRating !== null && game.opponentRating !== undefined
      ? `(${game.opponentRating})`
      : '';

  const accessibleLabel = `${opponent}${oppRating ? ` ${oppRating}` : ''}, ${resultText}, ${titleCase(game.timeClass)}, ${game.rated ? 'Rated' : 'Unrated'}, played as ${game.userColor}, user rating ${game.userRating ?? '—'}, opponent rating ${game.opponentRating ?? '—'}, ${date}, ${timeControl}${opening ? `, ${opening}` : ''}`;

  return (
    <div className="game-card-actions">
      <button
        type="button"
        className="game-card game-row-button"
        aria-pressed={selected}
        aria-label={`Preview ${accessibleLabel}`}
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
          <span className="game-card__date game-card-date">{date}</span>
          <span className="game-row-divider" aria-hidden="true">
            •
          </span>
          <span className="game-row-status">{reviewStatus}</span>
        </span>
        <span className="game-row-metadata">
          You played {titleCase(game.userColor)} · {timeControl}
          {opening ? ` · ${opening}` : ''}
        </span>
        <span className="game-row-preview">Preview</span>
        <span className="sr-only">
          {game.rated ? 'Rated' : 'Unrated'}, played as {game.userColor}, user rating{' '}
          {game.userRating ?? '—'}, opponent rating {game.opponentRating ?? '—'}
        </span>
      </button>
      {onReview ? (
        <button
          type="button"
          className="button-secondary"
          aria-label={`Review ${accessibleLabel}`}
          onClick={() => onReview(game.id)}
        >
          Review
        </button>
      ) : null}
    </div>
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
  if (!Number.isFinite(endedAt) || Number.isNaN(new Date(endedAt * 1000).getTime()))
    return 'Unknown date';
  return (
    new Intl.DateTimeFormat('en-GB', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'UTC',
    }).format(new Date(endedAt * 1000)) + ' UTC'
  );
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
