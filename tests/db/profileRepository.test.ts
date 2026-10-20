import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, closeDatabase } from '../../lib/db/openDatabase';
import { STORES } from '../../lib/db/schema';
import {
  getPlayerProfile,
  putPlayerProfile,
  setMeta,
  CorruptRecordError,
} from '../../lib/db/repositories';
import type { CachedProfileRecord } from '../../lib/api/chesscomProfile';

describe('profileRepository', () => {
  let db: IDBDatabase;

  beforeEach(async () => {
    db = await openDatabase();
  });

  afterEach(async () => {
    closeDatabase(db);
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(db.name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });

  it('returns null when no profile record is cached for the user', async () => {
    const record = await getPlayerProfile(db, 'unknown_player');
    expect(record).toBeNull();
  });

  it('stores and retrieves cached profile and stats record case-insensitively', async () => {
    const cachedRecord: CachedProfileRecord = {
      username: 'MagnusCarlsen',
      profile: {
        username: 'magnuscarlsen',
        name: 'Magnus Carlsen',
        title: 'GM',
        status: 'premium',
        url: 'https://www.chess.com/member/magnuscarlsen',
        joined: 1200000000,
      },
      stats: {
        chess_rapid: {
          last: { rating: 2820, date: 1680000000 },
          best: { rating: 2900, date: 1650000000 },
        },
      },
      fetchedAt: 1690000000000,
    };

    await putPlayerProfile(db, cachedRecord);

    const retrieved = await getPlayerProfile(db, 'magnuscarlsen');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.username).toBe('MagnusCarlsen');
    expect(retrieved?.profile?.title).toBe('GM');
    expect(retrieved?.stats?.chess_rapid?.last?.rating).toBe(2820);
    expect(retrieved?.fetchedAt).toBe(1690000000000);

    // Case-insensitive query
    const retrievedUpper = await getPlayerProfile(db, 'MAGNUSCARLSEN');
    expect(retrievedUpper).toEqual(retrieved);
  });

  it('overwrites previous cached record when updated', async () => {
    const initial: CachedProfileRecord = {
      username: 'erik',
      profile: {
        username: 'erik',
        status: 'basic',
        url: 'https://chess.com/member/erik',
        joined: 100000,
      },
      stats: null,
      fetchedAt: 1000,
    };

    await putPlayerProfile(db, initial);

    const updated: CachedProfileRecord = {
      username: 'erik',
      profile: {
        username: 'erik',
        status: 'premium',
        url: 'https://chess.com/member/erik',
        joined: 100000,
      },
      stats: {
        chess_blitz: { last: { rating: 1700 } },
      },
      fetchedAt: 2000,
    };

    await putPlayerProfile(db, updated);

    const retrieved = await getPlayerProfile(db, 'erik');
    expect(retrieved?.profile?.status).toBe('premium');
    expect(retrieved?.stats?.chess_blitz?.last?.rating).toBe(1700);
    expect(retrieved?.fetchedAt).toBe(2000);
  });

  it('throws CorruptRecordError when stored meta value is not a valid CachedProfileRecord', async () => {
    await setMeta(db, 'profile:corrupteduser', { invalid: 'payload' });

    await expect(getPlayerProfile(db, 'corrupteduser')).rejects.toThrow(CorruptRecordError);
  });
});
