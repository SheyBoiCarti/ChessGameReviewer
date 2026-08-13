'use client';

import { useEffect, useMemo, useState } from 'react';

import type { GameRecord } from '@/lib/db/schema';

export function GameSelector({
  games,
  selectedGameId,
  onSelect,
  analysisStatus = {},
}: {
  games: readonly GameRecord[];
  selectedGameId: string | null;
  onSelect(gameId: string): void;
  analysisStatus?: Readonly<Record<string, string>>;
}) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'rating'>('newest');
  const compact = useCompactLayout();
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
    <section className="game-selector" aria-labelledby="game-selector-heading">
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
      {compact ? (
        <ul className="compact-game-list" aria-label="Compact games">
          {rows.map(({ game, opponent }) => (
            <li key={game.id} data-selected={game.id === selectedGameId}>
              <GameButton game={game} opponent={opponent} onSelect={onSelect} />
              <span>{metadata(game, analysisStatus[game.id])}</span>
            </li>
          ))}
        </ul>
      ) : (
        <table aria-label="Games">
          <thead>
            <tr>
              <th>Opponent</th>
              <th>Colour</th>
              <th>Result</th>
              <th>Ratings</th>
              <th>Ended</th>
              <th>Time</th>
              <th>Rated</th>
              <th>Analysis</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ game, opponent }) => (
              <tr key={game.id} aria-selected={game.id === selectedGameId}>
                <td>
                  <GameButton game={game} opponent={opponent} onSelect={onSelect} />
                </td>
                <td>{game.userColor}</td>
                <td>{game.result}</td>
                <td>
                  {game.userRating ?? '—'} / {game.opponentRating ?? '—'}
                </td>
                <td>{new Date(game.endedAt * 1000).toLocaleDateString()}</td>
                <td>{game.timeClass}</td>
                <td>{game.rated ? 'Rated' : 'Unrated'}</td>
                <td>{analysisStatus[game.id] ?? 'Not analysed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function GameButton({
  game,
  opponent,
  onSelect,
}: {
  game: GameRecord;
  opponent: string;
  onSelect(gameId: string): void;
}) {
  return (
    <button type="button" onClick={() => onSelect(game.id)}>
      Select game versus {opponent}
    </button>
  );
}

function opponentName(game: GameRecord): string {
  const tag = game.userColor === 'white' ? 'Black' : 'White';
  const match = new RegExp(`^\\[${tag} "([^"]+)"\\]$`, 'm').exec(game.pgn);
  return match?.[1] ?? 'Unknown opponent';
}

function metadata(game: GameRecord, status: string | undefined): string {
  return `${game.userColor}, ${game.result}, ${game.timeClass}, ${game.rated ? 'rated' : 'unrated'}, ${status ?? 'not analysed'}`;
}

function useCompactLayout(): boolean {
  const query = '(max-width: 42rem)';
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const update = () => setCompact(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}
