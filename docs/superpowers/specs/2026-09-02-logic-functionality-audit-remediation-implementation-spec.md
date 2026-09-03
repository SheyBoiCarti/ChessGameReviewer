# Logic and Functionality Audit Remediation Implementation Spec

**Status:** Ready for implementation planning

**Source of truth:** Logic and functionality audit completed 2026-09-02

**Scope:** Correctness, local-data guarantees, graph resource limits, persistence resilience, cancellation semantics, and verification reliability

## 1. Objective

Correct the audit findings without weakening the application's local-first architecture, browser-only Chess.com integration, worker isolation, or existing stale-job protections. The completed remediation must:

- count only usable, legally parseable PGNs toward the requested game limit;
- expose bounded parse diagnostics instead of silently reducing graph samples;
- guarantee that a confirmed local-data deletion cannot be undone by an operation that started before the deletion;
- enforce the 64 MiB serialized graph budget at a complete-game boundary;
- bound the evaluation cache, maintain meaningful least-recently-used metadata, and surface non-fatal persistence degradation;
- retain games from fully completed archive months when ingestion is cancelled;
- restore a fully passing, repeatable browser test matrix; and
- state clearly that the approved Phase 5 advanced analytics remain deferred.

## 2. Governing requirements

This specification implements or restores the following requirements from `docs/Chess.com Game Analyzer & Opening Tree Technical Spec.md`:

- `FR-ING-003`, `FR-ING-006`, `FR-ING-008`, and `FR-ING-009`
- `FR-GRAPH-001` and `FR-GRAPH-007`
- `FR-ENG-004`
- `FR-DATA-002` and `FR-DATA-003`
- `NFR-REL-001`, `NFR-REL-002`, and `NFR-REL-003`
- `NFR-PERF-001`, `NFR-PERF-004`, and `NFR-PERF-006`

The existing security and privacy rules remain mandatory: there is no application proxy, PGNs stay local, PubAPI URLs remain allow-listed, and parsing/graph construction must not move onto the UI thread.

## 3. Program structure and sequence

Implement the remediation in this order:

1. PGN validation and diagnostic propagation.
2. Cancellation result preservation.
3. Data-deletion quiescence.
4. Serialized graph budget enforcement.
5. Evaluation-cache retention and visible degradation.
6. Browser regression cleanup and Phase 5 status documentation.

Each workstream must be independently reviewable and committed only after its focused tests pass. Workstreams 1 and 2 both touch ingestion and should land in that order. Workstream 3 depends on cancellation having deterministic terminal behavior. The other workstreams may be implemented after those dependencies are satisfied.

## 4. Global constraints

- Use test-driven development: add a failing regression test before changing production behavior.
- Preserve the current `GameQuery.maxGames` range of 1 through 5000.
- Never parse PGNs or build opening graphs on the UI thread.
- Keep diagnostics bounded to 100 detailed entries and 20 distinct codes at every worker/UI boundary.
- Preserve newest-month-first archive traversal and stable cross-month deduplication.
- Do not persist invalid PGNs or duplicate raw monthly payloads.
- Deletion must win over every operation that began before the user confirmed deletion.
- Graph byte-limit enforcement must be deterministic and must never split a game.
- Cache failures must not invalidate a successfully computed engine analysis.
- Do not add a new runtime dependency unless the existing platform and `chess.js` cannot implement the requirement.
- Follow the Next.js 16.3 guidance in `node_modules/next/dist/docs/` before changing Next-specific APIs or configuration.
- Do not regenerate visual baselines until the rendered change has been reviewed as intentional.

## 5. Workstream 1 — Validate PGNs before acceptance

### 5.1 Current defect

`normalizeRawGame` converts a missing PGN to an empty string and treats the record as accepted. The graph worker later rejects an empty or illegal PGN, but `GraphWorkerClient` ignores worker progress diagnostics. This allows ingestion to report a complete result with `maxGames` accepted while the graph silently contains fewer usable games.

### 5.2 Design

Add a dedicated PGN-validation request to the existing analysis-data worker protocol. Ingestion will normalize a fetched month, send the normalized candidates to the worker, and receive a compact validation result before candidates are counted toward `maxGames` or persisted.

The validation response must contain only:

```ts
interface PgnValidationResult {
  validGameIds: readonly string[];
  diagnostics: readonly Diagnostic[];
  totalInvalid: number;
  diagnosticCodes: readonly string[];
}
```

Do not return parsed plies to the UI thread. The graph build may parse the accepted records again in its worker; avoiding duplicate parsing is not worth coupling ingestion lifetime to mutable worker-held parse state.

Extend `IngestionDependencies` with an abort-aware validator:

```ts
validatePgns(
  games: readonly GameRecord[],
  options: { signal: AbortSignal }
): Promise<PgnValidationResult>;
```

The browser implementation must use a dedicated `PgnValidationWorkerClient` instance backed by `analysis-data.worker.ts`; it must not share a mutable job slot with `GraphWorkerClient`. Unit tests may use an in-process fake. The worker request and response must carry protocol version and job ID, and cancellation must produce exactly one terminal response. Extend `WorkspaceServices.ingestion` with `dispose(): void`; its browser implementation must cancel the manager and terminate the validation worker, and the workspace controller must call it during disposal.

For each fetched month:

1. Normalize structurally valid Chess.com records.
2. Validate their PGNs in the worker.
3. Append bounded diagnostics for invalid PGNs and increment excluded/failed counters.
4. Persist only the PGN-valid normalized records and the corresponding sync marker.
5. Add only matching, deduplicated, PGN-valid records to the query result.
6. Continue into older months until `maxGames` usable records are accepted or all planned months are exhausted.

Cached records created under the previous normalizer may contain invalid PGNs. Increment `NORMALIZER_VERSION` from 4 to 5 so prior sync markers are stale and online queries refetch them. If another change has already raised the constant above 4 when implementation begins, use the next monotonic integer. In offline-cache-only mode, validate cached records before acceptance, exclude invalid entries visibly, and do not claim that missing games can be repaired without a future online sync.

The later graph build remains defensive: it must still reject unexpected malformed input. Add graph terminal status `partial` alongside `complete` and `limited`. If graph parsing excludes anything after ingestion validation, return `partial` with `excludedGameCount`, bounded diagnostic codes, and a visible warning. Structural or byte limits still return `limited`; if both exclusions and a limit occur, return `limited` and include both the limit metadata and exclusion metadata.

### 5.3 Expected files

- Modify `workers/protocol.ts` for validation request/response types and guards.
- Modify `workers/analysis-data.worker.ts` to handle validation independently from graph builds.
- Create `features/ingestion/pgnValidationWorkerClient.ts` for request lifecycle, abort, and disposal.
- Modify `features/ingestion/types.ts` to add the validation dependency and result contract.
- Modify `features/ingestion/ingestionService.ts` to validate before persistence/counting.
- Modify `features/workspace/browserServices.ts` to construct and dispose the validation client.
- Modify `features/opening-tree/graphWorkerClient.ts`, `features/workspace/types.ts`, `features/workspace/reducer.ts`, and `features/workspace/createWorkspaceController.ts` to propagate graph status `partial`, exclusion count, and diagnostic codes.
- Modify `components/tree/OpeningTreeTable.tsx` to display a defensive exclusion warning.
- Update worker, ingestion, controller, and browser tests.

### 5.4 Acceptance criteria

- Empty and illegal PGNs do not count toward `maxGames`.
- Invalid PGNs are not written to the games store by a new-version sync.
- Ingestion continues to older months to fill the requested count with usable games.
- The user sees the number and reason categories for PGN exclusions.
- Diagnostic arrays and distinct-code arrays remain bounded.
- Cancellation of validation is prompt and produces no late progress or terminal publication.
- No production call to `parseGamePgn` is introduced on the UI thread.
- A defensive graph-stage exclusion is visible and prevents misleading sample claims.

## 6. Workstream 2 — Preserve completed work on cancellation

### 6.1 Current defect

The outer cancellation handler constructs a new terminal result with empty games, failures, and diagnostics. It discards the in-memory result accumulated from fully completed months. During a network month, records are also appended to the global result before the atomic persistence operation succeeds.

### 6.2 Design

Introduce a private ingestion accumulator owned by `executeIngestion`:

```ts
interface IngestionAccumulator {
  games: GameRecord[];
  seen: Set<string>;
  failedMonths: FailedMonth[];
  diagnostics: Diagnostic[];
  monthsPlanned: number;
  monthsCompleted: number;
  recordsFetched: number;
  recordsExcluded: number;
  recordsFailed: number;
  offlineCacheOnly: boolean;
}
```

Stage each network month's query matches in a month-local array. Persist the complete valid month and its sync marker atomically, then merge the staged matches into the global accumulator. If validation or persistence aborts, none of that month's matches appear in the returned result.

Handle cancellation inside `executeIngestion`, where the accumulator is available. Return `status: 'cancelled'` with:

- games from cached or network months that fully completed;
- diagnostics already produced by completed work;
- no fabricated failed month for the aborted operation; and
- the existing query fingerprint and offline-cache flag.

Unexpected failures before any per-month recovery remain `failed`. Per-month upstream failures retain the existing `partial`/`failed` semantics.

### 6.3 Expected files

- Modify `features/ingestion/ingestionService.ts`.
- Update `tests/dom/ingestion/ingestionService.test.ts`.
- Update `components/feedback/DiagnosticSummary.tsx` only if its cancellation wording needs to distinguish zero retained games from a non-zero retained set.
- Update fixture-driven browser tests for cancellation.

### 6.4 Acceptance criteria

- Cancelling during archive planning returns zero games.
- Cancelling during a later month returns matches from every previously completed month.
- Cancelling during PGN validation or persistence excludes the incomplete month.
- Progress never reports a globally accepted record before its month commits.
- A cancelled result renders retained games normally and truthfully describes their source.
- The job emits exactly one terminal outcome and no progress after termination.

## 7. Workstream 3 — Make deletion win over active work

### 7.1 Current defect

The controller deletes IndexedDB records without first stopping and awaiting ingestion, graph, or analysis operations. Those operations can subsequently write games, sync markers, or evaluations and recreate data after the UI confirms deletion.

### 7.2 Design

Add a controller-level quiescence barrier. The controller must track the currently executing query pipeline and analysis promise in addition to their abort controllers/tokens.

```ts
interface WorkspaceQuiescence {
  cancelAndWait(): Promise<void>;
  isMutatingData(): boolean;
}
```

The concrete implementation may remain private to `createWorkspaceController`; the interface documents required behavior rather than requiring a new exported type.

When deletion starts:

1. Enter a `deleting` data-maintenance state and reject or ignore new query/analysis starts.
2. Increment relevance tokens before aborting so late publications are stale immediately.
3. Cancel ingestion, validation, graph building, and engine analysis.
4. Await settlement of the tracked operation promises; treat expected aborts as successful quiescence.
5. Execute the IndexedDB deletion transaction.
6. Reset loaded workspace state only after the transaction completes.
7. Leave maintenance state and allow new operations.

For username deletion, quiesce all active writers rather than attempting to infer whether an evaluation belongs exclusively to that username. The current evaluation keys are position-based and may be shared across games. Preserve the existing behavior of deleting username-owned games, sync data, graph snapshots, and archive-list metadata; do not delete shared evaluations for a single username. `clearAllData` must delete evaluations after all analysis writes have settled.

Extend workspace state with:

```ts
dataMaintenance: {
  status: 'idle' | 'deleting-user' | 'clearing-all';
  error: string | null;
}
```

Disable destructive controls while maintenance is active and show a completion message only after the deletion transaction succeeds. On failure, preserve the loaded UI state where safe and present an alert; never report successful deletion optimistically.

### 7.3 Expected files

- Modify `features/workspace/types.ts` and `features/workspace/reducer.ts`.
- Modify `features/workspace/createWorkspaceController.ts` for promise tracking and quiescence.
- Modify `features/workspace/browserServices.ts` only if a service-level settlement hook is needed.
- Modify `components/controls/LocalDataSettings.tsx` to disable conflicting actions and render maintenance state.
- Modify `components/workspace/ChessWorkspace.tsx` to pass maintenance state.
- Update workspace controller, hook, ingestion, analysis, database, and component tests.

### 7.4 Acceptance criteria

- A confirmed deletion cannot be followed by a write from an operation started before confirmation.
- Clearing all during analysis leaves the evaluations store empty after every operation settles.
- Deleting during ingestion leaves the affected games, sync markers, snapshots, and archive metadata absent.
- Query, analysis, and repeated deletion actions cannot start during maintenance.
- Expected cancellation does not produce a user-facing deletion error.
- A failed deletion is visible and is not announced as successful.
- Existing stale-token protections continue to prevent obsolete UI publication.

## 8. Workstream 4 — Enforce the serialized graph budget

### 8.1 Current defect

`maxSnapshotBytes` is declared in `GraphBuildLimits` but is not checked by `OpeningGraphBuilder.exceedsLimit`. The worker serializes and posts an oversized graph, attaching only a persistence notice. This does not enforce the approved 64 MiB worker budget or return a usable `limited` graph at a complete-game boundary.

### 8.2 Design

Keep structural limits in `OpeningGraphBuilder` and make serialized-byte enforcement the responsibility of the worker serialization pipeline, where exact UTF-8 JSON size is available.

After a structurally valid graph is built:

1. Serialize it and measure it with `serializedGraphByteSize`.
2. If it is within 64 MiB, return it normally.
3. If it exceeds 64 MiB, find the largest canonical complete-game prefix whose serialized snapshot fits.
4. Rebuild candidate prefixes and use binary search, because snapshot size is monotonic for an append-only graph and this path runs only after an overflow.
5. Return the fitting snapshot as `status: 'limited'`, `reachedLimit: 'maxSnapshotBytes'`, with exact included and remaining valid-game counts.
6. If one game alone exceeds the budget, return a valid empty limited snapshot with every valid game counted as remaining.

Use the same canonical game ordering for the initial and prefix builds. Cancellation must be checked between rebuild attempts and during each asynchronous build. Do not post the known-oversized snapshot to the main thread.

Remove `maxSnapshotBytes` from `OpeningGraphBuilder`'s unused structural-limit object or otherwise prevent it from implying enforcement there. Define one exported byte-budget constant in the serialization/worker boundary and use it for production and tests.

### 8.3 Expected files

- Modify `lib/chess/graph/types.ts` so `GraphBuildLimits` contains only `maxPositions`, `maxEdges`, and `maxPathNodes`; serialized budget ownership moves to the worker serialization pipeline.
- Modify `lib/chess/graph/openingGraph.ts` to remove the unused byte-limit claim.
- Modify `lib/chess/graph/serialization.ts` to expose exact limit helpers.
- Modify `workers/analysis-data.worker.ts` to perform bounded prefix selection.
- Modify `workers/protocol.ts` only if reached-limit typing needs tightening.
- Update graph builder, serialization, worker, protocol, and UI tests.

### 8.4 Acceptance criteria

- No graph snapshot posted to the UI exceeds 64 MiB.
- Byte overflow returns `limited` with `reachedLimit: 'maxSnapshotBytes'`.
- The selected prefix is the largest complete-game prefix that fits.
- Included plus remaining valid games equals the valid input count.
- Structural limit behavior remains unchanged.
- Cancellation remains responsive during overflow rebuilds.
- Unit tests use a small injected byte limit and do not allocate a 64 MiB fixture.

## 9. Workstream 5 — Bound evaluation persistence and report degradation

### 9.1 Current defect

Evaluation retention utilities exist but no production path calls them. Cache hits do not refresh `lastUsedAt`, so the stored order is not true LRU. Cache write and quota failures are swallowed by analysis without any visible indication.

### 9.2 Design

Create a focused IndexedDB evaluation repository that owns retention policy rather than spreading policy across `analyzeGame`:

```ts
interface EvaluationCacheRepository {
  get(key: string): Promise<EvaluationRecord | null>;
  put(record: EvaluationRecord): Promise<void>;
  touch(key: string, lastUsedAt: number): Promise<void>;
}
```

On a valid cache hit, update `lastUsedAt` asynchronously through `touch`. A touch failure is non-fatal but must be recorded as a cache warning for the analysis result.

Before inserting a new evaluation, serialize repository writes and evict down to 999 records so the new insert leaves at most 1000. If the insert still raises `QuotaExceededError`, perform one more eviction pass to a conservative lower watermark of 900 and retry once. Do not retry other persistence failures indefinitely.

Add bounded non-fatal warnings to `GameAnalysisResult`:

```ts
interface AnalysisWarning {
  code: 'EVALUATION_CACHE_READ_FAILED' | 'EVALUATION_CACHE_WRITE_FAILED' | 'EVALUATION_CACHE_QUOTA';
  message: string;
}
```

`analyzeGame` must continue using a live engine result when cache access fails, but return the warning. `AnalyzerWorkspace` must show a concise warning that analysis succeeded but may not resume from local cache. Do not expose raw IndexedDB exception details.

Run `checkSchemaCompatibility` once when opening the production database. A stored schema newer than the code must fail with a recoverable, visible storage error. Normalizer-version mismatch must continue to invalidate archive freshness; it must not erase valid games pre-emptively. Persist current schema and normalizer metadata after a successful compatible open so future comparisons use explicit values.

Graph snapshot retention remains dormant until production graph persistence is introduced; graph snapshots are optional under `FR-DATA-001`. Do not add graph persistence solely to exercise existing repository helpers.

### 9.3 Expected files

- Modify `features/stockfish-analysis/evaluationCache.ts`.
- Modify `features/stockfish-analysis/analyzeGame.ts` and its result types.
- Modify `features/workspace/browserServices.ts` to construct the retention-aware repository.
- Modify `lib/db/repositories.ts` for an atomic evaluation touch helper if required.
- Modify `lib/db/retention.ts` to support pre-insert/high-watermark eviction cleanly.
- Modify `lib/db/openDatabase.ts` or browser database initialization for compatibility metadata.
- Modify `components/analysis/AnalyzerWorkspace.tsx` to show non-fatal persistence warnings.
- Update evaluation cache, analysis, retention, database, controller, and component tests.

### 9.4 Acceptance criteria

- Production evaluation storage remains at or below 1000 records after a successful write.
- A cache hit advances its LRU timestamp.
- Quota-triggered eviction retries exactly once.
- Analysis completes using live results when cache reads or writes fail.
- Non-fatal persistence degradation is visible without exposing raw error details.
- A newer stored schema produces a visible recoverable storage error.
- Normalizer-version mismatch retains the established online-refetch behavior.
- Concurrent analysis writes cannot race retention above the configured limit.

## 10. Workstream 6 — Restore verification reliability and document deferred scope

### 10.1 Visual regression

The Chromium Windows `loaded-board` snapshot fails consistently with a 4% pixel difference. The current rendering includes the new player metadata/orientation layout, while the stored baseline reflects the preceding layout.

Review the actual, expected, and diff artifacts. If the current rendering matches the approved player-metadata design and all semantic board-orientation tests pass, regenerate only the affected platform baseline. Do not update unrelated snapshots and do not loosen the pixel threshold to hide the difference.

### 10.2 Firefox concurrency timeout

The Firefox accessibility scenario timed out in its `beforeEach` hook during the four-worker full matrix and passed in 10.1 seconds when rerun alone. Treat this as suite-load flakiness rather than an accessibility failure.

Set a suite- or describe-level timeout before hooks execute for the affected accessibility scenarios. Prefer a focused 60-second timeout over globally reducing parallelism or adding arbitrary sleeps. Keep all existing axe assertions.

### 10.3 Deferred Phase 5 scope

Add an implementation-status section to the canonical product requirements or a linked status document. Mark `FR-ADV-001` through `FR-ADV-006` as deferred Phase 5 work and `FR-ADV-007` as a governing rule for any future advanced metric. Do not implement these analytics as part of this remediation.

### 10.4 Expected files

- Review and, if approved, update `tests/e2e/workspace-visual.spec.ts-snapshots/loaded-board-chromium-win32.png`.
- Modify `tests/e2e/workspace-accessibility.spec.ts` for a pre-hook timeout.
- Modify `docs/Chess.com Game Analyzer & Opening Tree Technical Spec.md` or add a linked implementation-status document.
- Add or update verification notes under `docs/verification/`.

### 10.5 Acceptance criteria

- The loaded-board visual test passes without increasing mismatch tolerance.
- The affected Firefox test passes alone and in the fully parallel browser matrix.
- No accessibility assertion is removed or weakened.
- The approved requirements clearly distinguish implemented functionality from deferred Phase 5 scope.
- Verification documentation records the reviewed visual change and test commands.

## 11. Cross-workstream state and interface rules

- Validation, ingestion, graph building, and analysis must retain independent job IDs.
- Workspace relevance tokens remain the final UI-state guard; abort signals are the resource and persistence guard.
- A stale job may finish internally, but it must neither publish UI state nor persist after a deletion barrier has begun.
- Diagnostic messages crossing worker or storage boundaries must be sanitized and must not contain raw PGN content.
- Terminal result types must distinguish fatal errors from non-fatal exclusions/warnings.
- Counts shown to users must specify their population: fetched records, usable accepted games, graph-included games, excluded games, analyzed plies, or cached evaluations.

## 12. Required regression scenarios

1. A newest month contains invalid PGNs followed by valid games, and older months supply enough valid games to reach `maxGames`.
2. Every fetched PGN is invalid; ingestion completes with zero usable games and visible diagnostics rather than a misleading populated result.
3. Offline cache contains a pre-remediation invalid PGN; it is visibly excluded without a network repair claim.
4. Cancellation occurs after one month commits and while the next month validates.
5. Cancellation occurs while an IndexedDB batch is aborting.
6. Username deletion is confirmed during monthly persistence.
7. Clear-all is confirmed while an evaluation cache write is in flight.
8. A new query is attempted during deletion maintenance.
9. A graph crosses the byte limit by one complete game.
10. The first valid graph game alone exceeds an injected byte limit.
11. A graph hits a structural limit before it reaches the byte limit.
12. A cache hit changes eviction order.
13. Concurrent cache writes finish with no more than 1000 records.
14. Quota recovery succeeds after eviction, and separately fails after its single retry with a visible warning.
15. Full Playwright execution reproduces neither the Chromium baseline failure nor the Firefox setup timeout.

## 13. Verification gates

Every focused workstream must run its direct Vitest or Playwright tests. Before completion, run from the repository root:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:e2e
git diff --check
```

The final evidence must include:

- exact test counts and exit codes;
- a clean or intentionally scoped `git status --short`;
- confirmation that no snapshot over 64 MiB crosses the worker boundary;
- IndexedDB assertions after deletion and retention races;
- the reviewed visual diff for any regenerated baseline; and
- the requirements-status documentation showing Phase 5 deferral.

## 14. Out of scope

- Implementing `FR-ADV-001` through `FR-ADV-006`.
- Persisting graph snapshots when no production graph-persistence feature currently consumes them.
- Changing the public Chess.com API integration model.
- Changing Stockfish binaries, engine evaluation heuristics, or move-classification thresholds.
- Reworking the application layout beyond the confirmed visual baseline.
- Broad database abstraction or state-management rewrites unrelated to the audit findings.

## 15. Definition of done

This remediation is complete only when all six workstreams meet their acceptance criteria, all required regression scenarios have automated coverage, the full verification command set passes, the visual change has been explicitly reviewed, Phase 5 is documented as deferred, and no operation started before a confirmed deletion can recreate deleted data afterward.
