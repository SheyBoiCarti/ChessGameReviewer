'use client';

import { useMemo } from 'react';
import { parseSelectedGame } from '@/features/workspace/parseSelectedGame';
import type { GameRecord } from '@/lib/db/schema';

export function OpeningView({
  games,
  sequence,
  onSelectGame,
}: {
  games: readonly GameRecord[];
  sequence: readonly { uci: string }[];
  onSelectGame(id: string): void;
}) {
  const openingGames = useMemo(
    () =>
      games
        .map((record) => ({ record, game: parseSelectedGame(record) }))
        .filter(({ game }) => game !== null),
    [games]
  );
  const matching = openingGames.filter(({ game }) =>
    sequence.every((move, index) => game?.plies[index]?.uci === move.uci)
  );
  return (
    <section className="surface-panel" aria-label="Games in this opening">
      <h3>Your games in this line</h3>
      <p>
        {matching.filter(({ record }) => record.userColor === 'white').length} as White ·{' '}
        {matching.filter(({ record }) => record.userColor === 'black').length} as Black
      </p>
      <p className="field-help">
        This tree combines your imported games. Your playing color is shown for each game below.
      </p>
      <details>
        <summary>Show matching games ({matching.length})</summary>
        <div className="result-viewport">
          <ul>
            {matching.map(({ record }) => (
              <li key={record.id}>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => onSelectGame(record.id)}
                >
                  {record.whitePlayer.username ?? 'White'} vs{' '}
                  {record.blackPlayer.username ?? 'Black'} · You played{' '}
                  {record.userColor === 'white' ? 'White' : 'Black'} ·{' '}
                  {new Date(record.endedAt * 1000).toLocaleDateString()}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </section>
  );
}
