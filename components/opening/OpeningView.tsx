'use client';

import { useMemo, type JSX } from 'react';
import type { GameRecord } from '@/lib/db/schema';
import type { SerializedOpeningGraph } from '@/lib/chess/graph/serialization';
import {
  selectPositionGameIds,
  selectPrefixGameIds,
  selectLatestGameEndedAt,
} from '@/features/opening-tree/selectors';
import { OpeningGamesPanel } from './OpeningGamesPanel';

const utcDateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' });

/** Mounted only on disclosure expansion. Source games are resolved by worker membership. */
export function OpeningView({
  gamesById,
  snapshot,
  positionKey,
  pathId,
  onSelectGame,
}: {
  gamesById: ReadonlyMap<string, GameRecord>;
  snapshot: SerializedOpeningGraph;
  positionKey: string;
  pathId: number | null;
  onSelectGame(id: string): void;
}): JSX.Element {
  const matching = useMemo(
    () => selectPrefixGameIds(snapshot, pathId).filter((id) => gamesById.has(id)),
    [snapshot, pathId, gamesById]
  );
  const positionIds = useMemo(
    () => selectPositionGameIds(snapshot, positionKey).filter((id) => gamesById.has(id)),
    [snapshot, positionKey, gamesById]
  );
  const positionCount = positionIds.length;
  const whiteCount = useMemo(
    () => matching.filter((id) => gamesById.get(id)?.userColor === 'white').length,
    [matching, gamesById]
  );

  const latestEndedAt = useMemo(
    () => selectLatestGameEndedAt(matching, gamesById),
    [matching, gamesById]
  );

  const lastPlayedText =
    latestEndedAt !== null ? utcDateFormatter.format(new Date(latestEndedAt * 1000)) : null;

  return (
    <section className="surface-panel" aria-label="Games in this opening">
      <h3>Your games in this line</h3>
      <p className="opening-summary-line">
        {whiteCount} as White · {matching.length - whiteCount} as Black
        {lastPlayedText ? ` · Last played: ${lastPlayedText}` : ''}
      </p>
      <p>
        {positionCount} position-wide games · {matching.length} exact-line games
      </p>
      <p className="field-help">
        Position-wide games include other move orders. Counts refer to games included in this tree;
        repeated arrivals may contribute more than once to position statistics.
      </p>
      {matching.length === 0 ? <p>No games followed this exact move order.</p> : null}
      <OpeningGamesPanel
        key={`${positionKey}:${pathId}`}
        ids={matching}
        gamesById={gamesById}
        onSelectGame={onSelectGame}
      />
    </section>
  );
}
