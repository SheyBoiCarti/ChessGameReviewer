import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { restoreReviews, saveReview } from '@/features/stockfish-analysis/reviewRepository';
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
