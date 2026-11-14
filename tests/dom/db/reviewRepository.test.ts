import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  restoreReviews,
  restoreSelected,
  saveReview,
} from '@/features/stockfish-analysis/reviewRepository';
import type { GameAnalysisResult } from '@/features/stockfish-analysis/analyzeGame';
import { closeDatabase, openDatabase } from '@/lib/db/openDatabase';
import { clearAllData, deleteUserData } from '@/lib/db/deleteLocalData';
import type { GameRecord } from '@/lib/db/schema';

const game = { id: 'one', username: 'player', pgn: '1. e4 e5' } as GameRecord;
const review: GameAnalysisResult = {
  status: 'cancelled',
  annotations: [],
  analyzedPlies: 0,
  totalPlies: 2,
  warnings: [],
  summary: { white: {}, black: {} } as GameAnalysisResult['summary'],
};

describe('saved game reviews', () => {
  let db: IDBDatabase;
  beforeEach(async () => {
    db = await openDatabase();
    await clearAllData(db);
  });
  afterEach(() => closeDatabase(db));

  it('restores a partial review after reopening storage, isolated by strength and PGN', async () => {
    await saveReview(db, game, 'quick', review);
    closeDatabase(db);
    db = await openDatabase();
    expect(await restoreReviews(db, [game], 'quick')).toEqual({ one: review });
    expect(await restoreReviews(db, [game], 'deep')).toEqual({});
    expect(await restoreReviews(db, [{ ...game, pgn: '1. d4 d5' }], 'quick')).toEqual({});
  });

  it('retains the last complete review after a cancelled rerun', async () => {
    await saveReview(db, game, 'quick', { ...review, status: 'complete' });
    await saveReview(db, game, 'quick', review);
    expect((await restoreSelected(db, game, 'quick'))?.status).toBe('complete');
  });

  it('does not let an invalidated writer overwrite a newer saved review', async () => {
    const complete = { ...review, status: 'complete' as const };
    await saveReview(db, game, 'quick', complete);
    await saveReview(db, game, 'quick', review, () => false);
    expect(await restoreSelected(db, game, 'quick')).toEqual(complete);
  });

  it('reads only the selected review and preserves content and preset isolation', async () => {
    await saveReview(db, game, 'balanced', review);
    await saveReview(db, { ...game, id: 'other' }, 'balanced', { ...review, status: 'complete' });
    expect(await restoreSelected(db, game, 'balanced')).toEqual(review);
    expect(await restoreSelected(db, game, 'quick')).toBeNull();
    expect(await restoreSelected(db, { ...game, pgn: '1. d4 d5' }, 'balanced')).toBeNull();
    expect(await restoreSelected(db, { ...game, username: 'another' }, 'balanced')).toBeNull();
  });

  it('deletes every strength for the requested username, retaining other players', async () => {
    const other = { ...game, username: 'player-two' };
    await saveReview(db, game, 'quick', review);
    await saveReview(db, game, 'deep', { ...review, status: 'complete' });
    await saveReview(db, other, 'quick', review);
    await deleteUserData(db, 'PLAYER');
    expect(await restoreReviews(db, [game], 'quick')).toEqual({});
    expect(await restoreReviews(db, [game], 'deep')).toEqual({});
    expect(await restoreReviews(db, [other], 'quick')).toEqual({ one: review });
    await clearAllData(db);
    expect(await restoreReviews(db, [other], 'quick')).toEqual({});
  });
});
