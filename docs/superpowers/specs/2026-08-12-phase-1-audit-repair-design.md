# Phase 1 Audit Repair Design

**Date:** 2026-08-12  
**Status:** Approved  
**Scope:** Repair Phase 1 so it conforms to the canonical production design and `phase-1-direct-ingestion-persistence.md` without implementing Phase 2 features.

## Context

The independent audit found that Phase 1 had been marked complete despite failing type and formatting gates, excluding the PubAPI contract suite from normal test and coverage commands, and leaving most of the resilient-ingestion requirements unimplemented. Existing Tasks 1.1 through 1.4 contain useful foundations, so the repair will harden those modules and replace the incomplete ingestion orchestration with the modular architecture already specified by the Phase 1 plan.

## Goals

- Make every Phase 1 quality gate truthful and reproducible.
- Enforce safe direct-browser Chess.com PubAPI access with typed outcomes and request-level coordination.
- Persist normalized games and freshness metadata without duplicating PGNs or hiding incompatible data.
- Implement the complete `GameQuery` ingestion contract: planning, caching, retrying, filtering, deduplication, cancellation, partial results, and supersession.
- Add deterministic unit, DOM, and browser tests that prove each Phase 1 acceptance criterion without live Chess.com traffic in normal pull-request CI.

## Non-goals

- PGN parsing, opening graph construction, Stockfish integration, advanced metrics, and the Phase 4 application workspace.
- A server-side Chess.com proxy.
- Deployment-provider automation. Local production-server verification will be committed and reproducible; controlled live and preview checks remain separate environment-specific gates.

## Architecture

### Foundation and quality gates

Direct production and development dependencies will use exact versions and the npm package-manager version will remain pinned. ESLint will cover all TypeScript and React source/configuration files. Vitest will discover unit, DOM, setup, and PubAPI tests through project configuration rather than script-level directory arguments. Coverage thresholds will enforce the specification's domain-module branch target and general application target with narrowly documented exclusions for type-only modules and external-tool configuration.

CI will run clean install, formatting, linting, type checking, deterministic tests with coverage, production build, and Chromium Playwright smoke tests. Normal browser tests will intercept PubAPI calls with fixtures. A separately gated controlled-live smoke test may exercise Chess.com from an approved preview environment.

The CSP will retain same-origin workers and the required WASM evaluation permission while removing general `unsafe-eval`. COOP, COEP, framing, referrer, and content-type protections remain applied to documents and worker/static routes.

### PubAPI boundary

`lib/api/chesscomClient.ts` remains the only network boundary. It will:

- accept only validated username/year/month segments;
- construct the two approved URL families;
- use credentialless simple CORS `GET` requests with normal browser caching;
- validate the final response URL, status, content type, declared length, streamed byte length, JSON, and endpoint schema;
- return data or throw exactly one redacted typed error that distinguishes cancellation, timeout, offline, CORS/network failure, malformed JSON, invalid schema, wrong content type, redirect rejection, HTTP failure, and size overflow;
- expose readable `Retry-After` information in normalized form without exposing upstream content.

`PubApiCoordinator` will serialize attempts per tab and use a named Web Lock only around the network attempt and protected body read. Lock acquisition will receive the caller's abort signal where supported. Parsing, retry backoff, normalization, filtering, and persistence occur after the lock is released.

### Persistence boundary

IndexedDB will use the canonical `ChessGameAnalyzerDB` name and schema version 1. Runtime validators will reject corrupt or incompatible persisted records with explicit typed recovery errors rather than silently presenting missing data. Repository operations use explicit store scopes and wait for transaction completion.

Repositories will provide:

- atomic game-upsert plus successful-month-marker commits;
- queryable cached normalized games for a username/month;
- archive-list planning metadata stored as normalized `YYYY-MM` values only;
- schema and normalizer compatibility checks;
- per-user and complete deletion with removal counts;
- true least-recently-used eviction based on `lastUsedAt` for evaluations and graph snapshots;
- quota/storage errors that leave caller-owned in-memory results intact;
- connection close and actionable blocked/version-change behavior.

Cancellation is checked before starting persistence and immediately before committing a successful month marker. IndexedDB transactions already executing cannot be safely interrupted after commit, so relevance tokens prevent a cancelled or superseded job from publishing late progress or terminal results.

### Ingestion modules

The incomplete `lib/ingestion/syncOrchestrator.ts` behavior will be superseded by focused modules under `features/ingestion/`:

- `types.ts` owns progress, terminal result, dependency, cache-freshness, and failed-month contracts.
- `archivePlanner.ts` validates normalized archive-list values, intersects them with inclusive UTC query bounds, and sorts newest-first.
- `retryPolicy.ts` classifies retryable failures and implements at most three total attempts with exponential full jitter, readable `Retry-After`, and abort-aware waits.
- `ingestionService.ts` owns one ingestion job state machine and dependency injection.

An ingestion manager owns the active job's relevance token and `AbortController`. Starting a newer query aborts and supersedes the previous job. Only the current token may emit progress or publish a terminal result.

## Data flow

1. Narrow the query from `unknown`, normalize the username, and calculate a deterministic query fingerprint.
2. Emit `planning`; read fresh archive-list metadata unless manual refresh requires a browser fetch.
3. If archive planning cannot reach the network, use cached archive metadata and normalized games when available, marking the result offline-cache-only and including a freshness diagnostic.
4. Intersect available months with the inclusive UTC range and order newest-first.
5. For each relevant month, emit `loading-cache`, then either load fresh cached normalized games or emit `fetching` and fetch with the retry policy.
6. Normalize and validate each raw game, explicitly verify the user colour, reject non-standard games and inconsistent result tokens, then emit `filtering`.
7. Apply inclusive UTC date, time-class, colour, rated, and standard-chess filters; deduplicate by stable game ID across all months.
8. Atomically persist each successfully fetched month and its marker. Cached months are never rewritten solely because they were read.
9. Stop immediately when `maxGames` accepted games are collected or the oldest requested boundary has been processed.
10. Publish exactly one terminal result: `complete` (including an empty result), `partial`, `cancelled`, or `failed`. Accepted in-memory games survive later month, quota, or storage failures.

## Progress and diagnostics

Progress reports months planned/completed; raw records fetched; accepted, excluded, and failed counts; source (`indexeddb` or `browser-fetch`); current retry attempt/delay; and bounded diagnostics. Diagnostic messages contain stable codes and safe identifiers but no usernames, username-bearing URLs, raw bodies, or PGNs. Failed months remain explicit and retryable in partial results.

The implementation caps retained diagnostics to prevent unbounded memory use during malformed large archives. Progress snapshots are immutable and monotonic for the active job.

## Error handling

- Invalid queries fail before storage or network activity.
- Non-retryable upstream and schema failures fail only their month; earlier accepted data produces `partial`.
- Only network/CORS, timeout, 429, 502, 503, and 504 failures retry.
- Caller cancellation interrupts lock waits, fetches, and retry waits and suppresses late publication.
- Storage-unavailable and quota errors preserve accepted in-memory data and appear as bounded diagnostics/partial status where usable data exists.
- Total failure is never reported as a successful empty result.

## Test strategy

Tests will be written before each production repair and observed failing for the intended reason.

### Unit and DOM tests

- Full query boundaries and normalization, including duplicate set values.
- Strict archives/monthly schema failures and safe identifiers.
- Exact URL, fetch options, final URL, content type, malformed JSON, schema error, streamed overflow, timeout, cancellation, offline/CORS split, status mapping, `Retry-After`, and telemetry redaction.
- Serial coordination, abortable Web Lock waiting, and proof that locks are not held during parsing/backoff/filtering/persistence.
- IndexedDB schema/indexes, migration/recovery, explicit corrupt-record errors, real LRU ordering, transaction rollback, cache reads, metadata freshness, quota preservation, and deletion counts.
- Date-bound archive planning, current/completed freshness, manual refresh, offline cache reuse, every filter alone and combined, case-insensitive identity, deduplication, `maxGames`, retry timing, cancellation at every asynchronous boundary, partial/empty/failed results, and stale-job isolation.

### Browser tests

- Production response headers and computed `crossOriginIsolated` capability.
- Shell content and zero console/page errors.
- CSP allows a fixture-routed request to the approved origin and blocks an arbitrary origin.
- A real-browser IndexedDB flow persists normalized games across page reload and deletes them.
- Fixture-driven ingestion journeys cover complete, partial, cancelled, empty, offline-cache-only, and failed states without live pull-request traffic.

### Final verification

Run clean dependency installation validation, formatting, lint, strict type checking, all Vitest projects with enforced coverage, production build, and Chromium Playwright tests against `next start`. Re-read every Phase 1 requirement and map it to current source or fresh command/browser evidence. Controlled live PubAPI and deployed-preview verification are recorded separately because they depend on an external environment URL.

## Migration and compatibility

Changing the database name aligns the implementation with the authoritative specification. Because the prior name was never part of a completed release and Phase 1 remains under review, no cross-name data migration is required. Tests will delete both known development database names to prevent stale local development data from causing ambiguous results.

## Security and privacy

No server proxy, secrets, custom cross-origin headers, raw-response reflection, HTML injection, or PGN telemetry will be introduced. Usernames are normalized at trust boundaries and redacted from diagnostics. Browser fetch credentials remain omitted. Persisted raw monthly responses are prohibited, and PGN has exactly one durable copy in the game record.

## Acceptance

The repair is accepted only when every locally provable Phase 1 requirement has direct current evidence, all required automated gates pass, and any environment-only preview/live check is explicitly identified with the exact missing URL or deployment context rather than silently treated as complete.
