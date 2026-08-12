import { STORES } from './schema';
import { wrapIDBError } from './openDatabase';

export interface DeletionResult {
  username: string;
  gamesDeleted: number;
  archiveSyncDeleted: number;
  graphSnapshotsDeleted: number;
}

export interface ClearAllResult {
  clearedStores: string[];
}

export async function deleteUserData(
  db: IDBDatabase,
  username: string
): Promise<DeletionResult> {
  const normUsername = username.toLowerCase();

  return new Promise<DeletionResult>((resolve, reject) => {
    const tx = db.transaction(
      [STORES.GAMES, STORES.ARCHIVE_SYNC, STORES.GRAPH_SNAPSHOTS, STORES.META],
      'readwrite'
    );

    let gamesDeleted = 0;
    let archiveSyncDeleted = 0;
    let graphSnapshotsDeleted = 0;

    // Delete matching games
    const gamesStore = tx.objectStore(STORES.GAMES);
    const gamesReq = gamesStore.index('username').openKeyCursor(normUsername);
    gamesReq.onsuccess = () => {
      const cursor = gamesReq.result;
      if (cursor) {
        gamesStore.delete(cursor.primaryKey);
        gamesDeleted++;
        cursor.continue();
      }
    };

    // Delete matching archiveSync records
    const syncStore = tx.objectStore(STORES.ARCHIVE_SYNC);
    const syncReq = syncStore.index('username').openKeyCursor(normUsername);
    syncReq.onsuccess = () => {
      const cursor = syncReq.result;
      if (cursor) {
        syncStore.delete(cursor.primaryKey);
        archiveSyncDeleted++;
        cursor.continue();
      }
    };

    // Delete matching graphSnapshots
    const graphStore = tx.objectStore(STORES.GRAPH_SNAPSHOTS);
    const graphReq = graphStore.index('username').openKeyCursor(normUsername);
    graphReq.onsuccess = () => {
      const cursor = graphReq.result;
      if (cursor) {
        graphStore.delete(cursor.primaryKey);
        graphSnapshotsDeleted++;
        cursor.continue();
      }
    };

    // Delete user-specific meta keys (e.g., archiveList:username)
    const metaStore = tx.objectStore(STORES.META);
    const userMetaKey = `archiveList:${normUsername}`;
    metaStore.delete(userMetaKey);

    tx.oncomplete = () => {
      resolve({
        username: normUsername,
        gamesDeleted,
        archiveSyncDeleted,
        graphSnapshotsDeleted,
      });
    };

    tx.onerror = () => reject(wrapIDBError(tx.error));
    tx.onabort = () => reject(wrapIDBError(tx.error));
  });
}

export async function clearAllData(db: IDBDatabase): Promise<ClearAllResult> {
  const storeNames = [
    STORES.ARCHIVE_SYNC,
    STORES.GAMES,
    STORES.EVALUATIONS,
    STORES.GRAPH_SNAPSHOTS,
    STORES.META,
  ];

  return new Promise<ClearAllResult>((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');

    for (const name of storeNames) {
      if (db.objectStoreNames.contains(name)) {
        tx.objectStore(name).clear();
      }
    }

    tx.oncomplete = () => {
      resolve({
        clearedStores: [...storeNames],
      });
    };

    tx.onerror = () => reject(wrapIDBError(tx.error));
    tx.onabort = () => reject(wrapIDBError(tx.error));
  });
}
