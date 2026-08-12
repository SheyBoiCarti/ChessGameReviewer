# Task 1.4 — Versioned IndexedDB Repositories Report

## Summary of Implementation

Implemented the local persistence layer using native IndexedDB according to Schema v1 specifications for caching PubAPI sync status, persisting normalized games, engine evaluations, graph snapshots, and database metadata.

### Core Modules Created

1. **`lib/db/schema.ts`**
   - Constants: `DB_NAME` (`ChessGameReviewerDB`), `SCHEMA_VERSION` (1), `NORMALIZER_VERSION` (1), `STORES`.
   - Record Interfaces: `ArchiveSyncRecord`, `GameRecord`, `EvaluationRecord`, `GraphSnapshotRecord`, `MetaRecord`.
   - Runtime Validation Type Guards: `isValidArchiveSyncRecord`, `isValidGameRecord`, `isValidEvaluationRecord`, `isValidGraphSnapshotRecord`, `isValidMetaRecord`.
   - Strictly enforces that PGNs exist ONLY in `games` records and never in `archiveSync` or `meta`.

2. **`lib/db/openDatabase.ts`**
   - Database opening with V1 schema initialization (`archiveSync`, `games`, `evaluations`, `graphSnapshots`, `meta` stores and required indexes).
   - Event listeners for `onversionchange` (clean connection closure) and `onblocked`.
   - Safe upgrade handling ensuring missing stores and missing indexes on existing stores get created.
   - Typed error hierarchy: `StorageUnavailableError`, `QuotaExceededError`, `DatabaseBlockedError`, `SchemaVersionError`.

3. **`lib/db/repositories.ts`**
   - CRUD repository functions for all stores using explicit transaction scopes and modes (`readonly`, `readwrite`).
   - `saveSyncBatch`: Atomic multi-store commit that persists games and the matching `archiveSync` marker in a single transaction. Pre-validates all records; if validation fails or transaction aborts, neither games nor the sync marker persist.
   - Runtime validation on read: corrupt/invalid persisted records are detected and safely filtered/ignored.

4. **`lib/db/retention.ts`**
   - LRU eviction for engine evaluations (`evictEvaluations`) and graph snapshots (`evictGraphSnapshots`) based on usage timestamps (`lastUsedAt`/`createdAt`) and cumulative byte limits (`maxTotalBytes`).
   - Schema and normalizer version compatibility detection (`checkSchemaCompatibility`).

5. **`lib/db/deleteLocalData.ts`**
   - `deleteUserData`: Case-insensitive per-username deletion across `games`, `archiveSync`, `graphSnapshots`, and `meta` (`archiveList:username`) stores. Returns `DeletionResult` with detailed item counts.
   - `clearAllData`: Wipes all object stores and returns `ClearAllResult`.

---

## TDD Evidence

### 1. Schema & Validation Tests (`tests/dom/db/schema.test.ts`)
- **RED**: Command: `npx vitest run tests/dom/db/schema.test.ts`
  - Output: `Failed to resolve import "../../../lib/db/schema". Does the file exist?`
- **GREEN**: Command: `npx vitest run tests/dom/db/schema.test.ts`
  - Output: `1 passed (10 tests)`

### 2. Database Open & Event Handlers (`tests/dom/db/openDatabase.test.ts`)
- **RED**: Command: `npx vitest run tests/dom/db/openDatabase.test.ts`
  - Output: `Failed to resolve import "../../../lib/db/openDatabase". Does the file exist?`
- **GREEN**: Command: `npx vitest run tests/dom/db/openDatabase.test.ts`
  - Output: `1 passed (3 tests)`

### 3. Repositories & Atomic Transactions (`tests/dom/db/repositories.test.ts`)
- **RED**: Command: `npx vitest run tests/dom/db/repositories.test.ts`
  - Output: `Failed to resolve import "../../../lib/db/repositories". Does the file exist?`
- **GREEN**: Command: `npx vitest run tests/dom/db/repositories.test.ts`
  - Output: `1 passed (12 tests)`

### 4. Retention & LRU Eviction (`tests/dom/db/retention.test.ts`)
- **RED**: Command: `npx vitest run tests/dom/db/retention.test.ts`
  - Output: `Failed to resolve import "../../../lib/db/retention". Does the file exist?`
- **GREEN**: Command: `npx vitest run tests/dom/db/retention.test.ts`
  - Output: `1 passed (5 tests)`

### 5. Deletion API (`tests/dom/db/deleteLocalData.test.ts`)
- **RED**: Command: `npx vitest run tests/dom/db/deleteLocalData.test.ts`
  - Output: `Failed to resolve import "../../../lib/db/deleteLocalData". Does the file exist?`
- **GREEN**: Command: `npx vitest run tests/dom/db/deleteLocalData.test.ts`
  - Output: `1 passed (2 tests)`

### 6. Schema Upgrade & Migration (`tests/dom/db/migration.test.ts`)
- **RED**: Command: `npx vitest run tests/dom/db/migration.test.ts`
  - Output: `expected false to be true` (missing stores/indexes on upgrade from prior schema)
- **GREEN**: Command: `npx vitest run tests/dom/db/migration.test.ts`
  - Output: `1 passed (1 test)`

---

## Code Review Fix Report

### Review Findings Addressed

1. **`evictGraphSnapshots` byte-limit eviction (`lib/db/retention.ts`)**
   - **What changed**: Updated `evictGraphSnapshots` to compute total byte size of graph snapshot records and evict oldest snapshots until cumulative bytes is $\le$ `maxTotalBytes` and count is $\le$ `maxCount`.
   - **Covering test**: Added explicit byte-limit test `evicts oldest snapshots when cumulative byte size exceeds maxTotalBytes` in `tests/dom/db/retention.test.ts`.
   - **Command run**: `npx vitest run tests/dom/db/retention.test.ts`
   - **Output**: `1 passed (5 tests)`

2. **Index creation on existing stores during upgrade (`lib/db/openDatabase.ts`)**
   - **What changed**: Updated `onupgradeneeded` in `openDatabase.ts` to inspect `store.indexNames` using `Array.from(store.indexNames).includes(...)` on existing stores retrieved via `tx.objectStore(name)`, safely adding any missing V1 indexes on upgrade.
   - **Covering test**: Updated `tests/dom/db/migration.test.ts` to test upgrading an existing V1 database that had a `games` store lacking indexes, verifying all V1 indexes (`username`, `endedAt`, `timeClass`, `userColor`) are created on upgrade. Also cleaned up dead code block.
   - **Command run**: `npx vitest run tests/dom/db/migration.test.ts`
   - **Output**: `1 passed (1 test)`

3. **QuotaExceededError test & unused import cleanup (`tests/dom/db/repositories.test.ts`)**
   - **What changed**: Added explicit unit test verifying that when an IDB write fails with `QuotaExceededError`, the in-memory record objects remain valid and uncorrupted. Wrapped synchronous transaction exceptions in `repositories.ts` with `wrapIDBError`.
   - **Covering test**: `preserves in-memory game records intact when storage quota is exceeded during write` in `tests/dom/db/repositories.test.ts`.
   - **Command run**: `npx vitest run tests/dom/db/repositories.test.ts`
   - **Output**: `1 passed (12 tests)`

4. **Minor cleanup items**
   - Added deletion of user meta keys (`archiveList:username`) in `deleteUserData` (`lib/db/deleteLocalData.ts`).
   - Verified `npm run typecheck` and `npm run lint` run with 0 warnings/errors.

### Final Verification Command Output
- Command: `npm test`
- Output: `Test Files 10 passed (10), Tests 107 passed (107)`
