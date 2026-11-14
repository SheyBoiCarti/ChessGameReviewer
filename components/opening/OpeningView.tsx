'use client';

import { useMemo, type JSX } from 'react';
import type { GameRecord } from '@/lib/db/schema';
import type { SerializedOpeningGraph } from '@/lib/chess/graph/serialization';
import { selectPositionGameIds, selectPrefixGameIds } from '@/features/opening-tree/selectors';
import { OpeningGamesPanel } from './OpeningGamesPanel';

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
  const positionCount = useMemo(
    () => selectPositionGameIds(snapshot, positionKey).filter((id) => gamesById.has(id)).length,
    [snapshot, positionKey, gamesById]
  );
  const whiteCount = useMemo(
    () => matching.filter((id) => gamesById.get(id)?.userColor === 'white').length,
    [matching, gamesById]
  );
  return (
    <section className="surface-panel" aria-label="Games in this opening">
      <h3>Your games in this line</h3>
      <p>
        {whiteCount} as White · {matching.length - whiteCount} as Black
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
