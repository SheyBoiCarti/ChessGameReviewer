## 5. Task 1.4 — Versioned IndexedDB repositories

### Files

- Create `lib/db/schema.ts`.
- Create `lib/db/openDatabase.ts`.
- Create repositories for archive sync metadata, games, evaluations, graph snapshots, and metadata.
- Create `lib/db/retention.ts` and `lib/db/deleteLocalData.ts`.
- Create repository and migration tests.

### Schema v1

| Store | Key | Required indexes | Stored data |
|---|---|---|---|
| `archiveSync` | `username:YYYY-MM` | `username`, `month`, `lastSuccessfulFetchAt` | timestamps, status, observed normalized game IDs/count, normalizer version; no PGNs or raw monthly JSON |
| `games` | stable game ID | `username`, `endedAt`, `timeClass`, `userColor` | normalized metadata and the only persisted copy of the PGN |
| `evaluations` | serialized evaluation key | `positionHash`, `engineBuild`, `lastUsedAt` | compatible engine output |
| `graphSnapshots` | query fingerprint | `username`, `createdAt` | optional versioned graph snapshot within the Phase 2 byte limit |
| `meta` | name | none | schema, retention, and archive-list planning metadata |

The archive list may be cached as a small normalized array of year/month values. The raw monthly response is transient and must not be persisted.

### Repository rules

Repositories must:

- runtime-validate records read after open/upgrade;
- use transactions with explicit scopes;
- upsert games idempotently by stable ID;
- store game upserts and the matching successful `archiveSync` marker in one transaction;
- never advance the sync marker when fetch, validation, normalization, or transaction commit is incomplete;
- detect schema/normalizer incompatibility;
- expose storage-unavailable and quota-exceeded errors without discarding valid in-memory results;
- support per-username and complete deletion;
- implement LRU eviction for evaluations and graph snapshots;
- close cleanly on version changes and surface blocked-upgrade guidance.

### Tests first

- Read/write, deduplication, transaction rollback, and concurrent-open behavior.
- Prove a PGN exists only in its `games` record and never in `archiveSync` or `meta`.
- Upgrade from an artificial prior schema.
- Invalid persisted record handling.
- Quota-error preservation of in-memory results.
- Per-user deletion, full deletion, and LRU eviction.
- Failed multi-store commit leaves neither new games nor a successful sync marker.

### Acceptance

- Tests use fake IndexedDB and at least one real-browser repository flow.
- Migration failure is visible and recoverable.
- Storage size is not doubled by retaining raw monthly payloads.
- The UI-facing deletion API confirms what was removed.
