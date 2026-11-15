'use client';

import { useMemo, useState, type JSX } from 'react';
import type { GameRecord } from '@/lib/db/schema';

const PAGE_SIZE = 50;
const utcDateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });

export function OpeningGamesPanel({
  ids,
  gamesById,
  onSelectGame,
}: {
  ids: readonly string[];
  gamesById: ReadonlyMap<string, GameRecord>;
  onSelectGame(id: string): void;
}): JSX.Element {
  const [page, setPage] = useState(0);

  const sortedIds = useMemo(() => {
    return [...ids].sort((a, b) => {
      const gameA = gamesById.get(a);
      const gameB = gamesById.get(b);
      const timeA = gameA?.endedAt ?? 0;
      const timeB = gameB?.endedAt ?? 0;
      return timeB - timeA;
    });
  }, [ids, gamesById]);

  const pageCount = Math.max(1, Math.ceil(sortedIds.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);

  return (
    <>
      <div className="result-viewport">
        <ul aria-label="Matching source games">
          {sortedIds.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((id) => {
            const record = gamesById.get(id);
            if (!record) return null;
            const formattedDate = utcDateFormatter.format(new Date(record.endedAt * 1000));
            return (
              <li key={id}>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => onSelectGame(id)}
                  aria-label={`Review source game: ${record.whitePlayer.username ?? 'White'} vs ${record.blackPlayer.username ?? 'Black'}`}
                >
                  {record.whitePlayer.username ?? 'White'} vs{' '}
                  {record.blackPlayer.username ?? 'Black'} · You played{' '}
                  {record.userColor === 'white' ? 'White' : 'Black'} · {formattedDate}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {pageCount > 1 ? (
        <nav aria-label="Matching game pages">
          <button
            type="button"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous matching games
          </button>
          <span>
            Page {currentPage + 1} of {pageCount}
          </span>
          <button
            type="button"
            disabled={currentPage + 1 === pageCount}
            onClick={() => setPage(currentPage + 1)}
          >
            Next matching games
          </button>
        </nav>
      ) : null}
    </>
  );
}
