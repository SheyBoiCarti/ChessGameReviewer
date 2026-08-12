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
   - Typed error hierarchy: `StorageUnavailableError`, `QuotaExceededError`, `DatabaseBlockedError`, `SchemaVersionError`.

3. **`lib/db/repositories.ts`**
   - CRUD repository functions for all stores using explicit transaction scopes and modes (`readonly`, `readwrite`).
   - `saveSyncBatch`: Atomic multi-store commit that persists games and the matching `archiveSync` marker in a single transaction. Pre-validates all records; if validation fails or transaction aborts, neither games nor the sync marker persist.
   - Runtime validation on read: corrupt/invalid persisted records are detected and safely filtered/ignored.

4. **`lib/db/retention.ts`**
   - LRU eviction for engine evaluations (`evictEvaluations`) and graph snapshots (`evictGraphSnapshots`) based on usage timestamps (`lastUsedAt`/`createdAt`).
   - Schema and normalizer version compatibility detection (`checkSchemaCompatibility`).

5. **`lib/db/deleteLocalData.ts`**
   - `deleteUserData`: Case-insensitive per-username deletion across `games`, `archiveSync`, and `graphSnapshots` stores. Returns `DeletionResult` with detailed item counts.
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
  - Output: `1 passed (11 tests)`

### 4. Retention & LRU Eviction (`tests/dom/db/retention.test.ts`)
- **RED**: Command: `npx vitest run tests/dom/db/retention.test.ts`
  - Output: `Failed to resolve import "../../../lib/db/retention". Does the file exist?`
- **GREEN**: Command: `npx vitest run tests/dom/db/retention.test.ts`
  - Output: `1 passed (4 tests)`

### 5. Deletion API (`tests/dom/db/deleteLocalData.test.ts`)
- **RED**: Command: `npx vitest run tests/dom/db/deleteLocalData.test.ts`
  - Output: `Failed to resolve import "../../../lib/db/deleteLocalData". Does the file exist?`
- **GREEN**: Command: `npx vitest run tests/dom/db/deleteLocalData.test.ts`
  - Output: `1 passed (2 tests)`

### 6. Schema Upgrade & Migration (`tests/dom/db/migration.test.ts`)
- **RED**: Command: `npx vitest run tests/dom/db/migration.test.ts`
  - Output: `expected false to be true` (missing stores on upgrade from prior schema)
- **GREEN**: Command: `npx vitest run tests/dom/db/migration.test.ts`
  - Output: `1 passed (1 test)`

---

## Files Changed

- `lib/db/schema.ts` (created)
- `lib/db/openDatabase.ts` (created)
- `lib/db/repositories.ts` (created)
- `lib/db/retention.ts` (created)
- `lib/db/deleteLocalData.ts` (created)
- `lib/api/contracts.ts` (updated `UpstreamErrorCode` definition to include extended error codes)
- `tests/dom/db/schema.test.ts` (created)
- `tests/dom/db/openDatabase.test.ts` (created)
- `tests/dom/db/repositories.test.ts` (created)
- `tests/dom/db/retention.test.ts` (created)
- `tests/dom/db/deleteLocalData.test.ts` (created)
- `tests/dom/db/migration.test.ts` (created)

---

## Verification Summary

- **`npm test`**: 105 passed across 10 test files. Output pristine.
- **`npm run typecheck`**: Passed with 0 errors.
- **`npm run lint`**: Passed with 0 errors.

---

## Self-Review Findings

- All requirements in Task 1.4 brief and plan met.
- Multi-store atomic transaction rollback verified: aborted/failed sync batches leave zero orphaned games or sync markers.
- PGN isolation verified: stored PGN string exists exclusively within `games` store records.
- Runtime validation on read prevents corrupt or outdated IDB records from breaking downstream callers.
