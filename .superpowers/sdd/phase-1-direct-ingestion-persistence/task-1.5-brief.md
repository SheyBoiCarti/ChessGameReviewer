## 6. Task 1.5 — Synchronous job queue and processing logic

### Files

- Create `lib/ingestion/jobQueue.ts`.
- Create `lib/ingestion/syncOrchestrator.ts`.
- Create tests covering cancellation, serialization, and error escalation.

### Requirements

- A global job queue accepts sync requests `(username: string, signal: AbortSignal)` and ensures no two sync jobs run concurrently for any user.
- If a sync is requested while another is running, the new request waits. If the same username is already queued, deduplicate the request and return the existing promise.
- The `syncOrchestrator` implements the `ArchiveSync` state machine:
  1. Retrieve local `archiveSync` records.
  2. Fetch the player's `archives` list from Chess.com.
  3. Identify missing or stale months (current UTC month is stale after 15 minutes, completed months after 30 days).
  4. Yield control/progress events (so the UI can render step progress).
  5. Fetch one stale month.
  6. Normalize all raw games (unknown result tokens map to diagnostics, skipped).
  7. Commit normalized games and the updated `archiveSync` marker in one transaction.
  8. Repeat 4–7 until all months are synced.
- The orchestrator checks the `AbortSignal` before every network request and transaction.
- If the PubAPI returns 404, 410, or 429, the sync terminates and propagates the typed error.
- Yield progress metadata (`totalMonths`, `completedMonths`, `currentGameRatio`) via an async generator or callback interface.

### Tests first

- The job queue serializes concurrent identical and distinct requests correctly.
- Deduplication prevents queuing the exact same `username` multiple times if one is pending.
- The orchestrator respects abort signals and stops fetching immediately.
- A 429 response aborts the current sync without marking the failed month as complete.
- Success correctly commits the transaction and yields progress updates.
- Tests mock the PubAPI client and IndexedDB repositories.

### Acceptance

- Unit tests prove that concurrency deduplicates requests and the orchestrator yields accurate progress updates.
- Canceling a sync job cleanly aborts network requests and doesn't partially commit data.
