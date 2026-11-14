'use client';

import { useMemo, type JSX } from 'react';
import { parseSelectedGame } from '@/features/workspace/parseSelectedGame';
import type { GameRecord } from '@/lib/db/schema';

/**
 * T37/T41: exact-line membership matches the actual visited sequence, not a
 * stored arrival path; the panel mounts only when its disclosure is expanded.
 */
export function OpeningView({
  games,
  sequence,
  onSelectGame,
}: {
  games: readonly GameRecord[];
  sequence: readonly string[];
  onSelectGame(id: string): void;
}): JSX.Element {
  const matching = useMemo(
    () =>
      games
        .map((record) => ({ record, game: parseSelectedGame(record) }))
        .filter(({ game }) => {
          if (!game) return false;
          if (sequence.length === 0) return true;
          return sequence.every((uci, index) => game.plies[index]?.uci === uci);
        }),
    [games, sequence]
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
      <div className="result-viewport">
        <ul>
          {matching.map(({ record }) => (
            <li key={record.id}>
              <button
                type="button"
                className="button-secondary"
                onClick={() => onSelectGame(record.id)}
              >
                {record.whitePlayer.username ?? 'White'} vs {record.blackPlayer.username ?? 'Black'}{' '}
                · You played {record.userColor === 'white' ? 'White' : 'Black'} ·{' '}
                {new Date(record.endedAt * 1000).toLocaleDateString()}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
