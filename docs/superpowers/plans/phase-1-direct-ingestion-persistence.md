# Phase 1 — Foundation, Direct PubAPI Ingestion, and Persistence

**Status:** Ready for implementation  
**Depends on:** Canonical production design  
**Produces:** A deployable shell that safely fetches, validates, stores, filters, cancels, and reports public Chess.com game ingestion without server-side API routes.

## 1. Phase outcomes

At completion:

- the supported Next.js/React/Node stack is locked and reproducible;
- CI performs static checks, deterministic tests, production build, and preview smoke tests;
- COOP/COEP, CSP, and baseline security headers are configured and verified;
- a credentialless browser PubAPI client constructs only approved Chess.com URLs, validates responses, enforces timeout/size limits, and normalizes failures;
- requests are serial within a job and coordinated across same-origin tabs where the browser supports Web Locks;
- IndexedDB stores each PGN once and has a versioned schema, repositories, retention, recovery, and deletion;
- ingestion honours every `GameQuery` field, walks months newest-first, retries safely, deduplicates, supports cancellation, and reports partial results.

## 2. Task 1.1 — Bootstrap supported tooling

### Files

- Create `package.json` and lockfile.
- Create `tsconfig.json`.
- Create framework, CSS, lint, formatting, test, and Playwright configuration.
- Create `app/layout.tsx`, `app/page.tsx`, and `app/globals.css`.
- Create `tests/setup/headers.test.ts` and a minimal browser smoke test.
- Create CI workflow configuration.

### Requirements

1. Start from the current supported Next.js Active LTS patch; minimum permitted version is 16.2.11. Use its supported React and Node releases.
2. Pin the package manager version and commit the lockfile.
3. Enable strict TypeScript, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and path aliases.
4. Configure Vitest for Node and DOM projects separately. Include Testing Library, user-event, fake IndexedDB, and a worker-test strategy.
5. Configure Playwright with Chromium initially; Firefox and WebKit join preview coverage in Phase 4.
6. Provide scripts for `format:check`, `lint`, `typecheck`, `test`, `test:coverage`, `test:e2e`, and `build`.
7. Configure these response headers on document and required worker/static routes:
   - `Cross-Origin-Opener-Policy: same-origin`;
   - `Cross-Origin-Embedder-Policy: require-corp`;
   - `X-Content-Type-Options: nosniff`;
   - an application-appropriate `Referrer-Policy`;
   - framing restrictions;
   - a CSP that permits same-origin workers and the selected WASM loading mechanism, and limits ingestion `connect-src` to `https://api.chess.com`.
8. Do not create `app/api/chesscom` routes or another unauthenticated PubAPI proxy.
9. Add an unaffiliated-product notice and a local-storage/privacy summary to the shell.
10. Use the installed Playwright MCP to inspect the running local and preview shell, console, network activity, computed isolation state, CSP behavior, and IndexedDB persistence. Preserve reproducibility by adding committed Playwright tests for stable checks.

### Tests first

- Configuration test asserts headers for document and worker asset paths.
- Production-server smoke test asserts actual response headers; importing a config object is not sufficient as the only test.
- Browser smoke test asserts heading, privacy notice, and no console errors.
- CSP smoke test proves an approved PubAPI CORS request is allowed and an arbitrary connection target is blocked.
- CI test proves a clean lockfile install and build.

### Acceptance

- Clean clone/install/build succeeds on the documented Node version.
- Preview response headers are verified over HTTP.
- `window.crossOriginIsolated` is reported as capability state, not assumed from config.
- No unsupported framework major, server PubAPI proxy, or unpinned direct dependency remains.
- Playwright MCP verification notes identify the tested revision/URL, observed console/network state, and any regression test added; CI remains independent of MCP.

## 3. Task 1.2 — Shared contracts and runtime validation

### Files

- Create `lib/api/contracts.ts`.
- Create `lib/api/chesscomSchemas.ts`.
- Create `lib/validation/gameQuery.ts`.
- Create `lib/chess/results.ts`.
- Create fixtures for valid, missing, malformed, oversized, 404, 410, 429, and 5xx upstream responses.

### Requirements

Implement and export the canonical `GameQuery`, normalized upstream error, raw upstream schemas, normalized game summary, job status, and diagnostic contracts.

`GameQuery` validation covers:

- normalized Chess.com username grammar and length;
- inclusive UTC date bounds and inverted ranges;
- `maxGames` from 1 through 5,000, default 500;
- non-empty supported time-class and colour sets;
- optional rated status.

Raw game validation retains only required fields. Unknown upstream fields are ignored. Missing required fields produce a structured diagnostic tied to a stable game identifier when available.

Map all documented Chess.com player-result tokens explicitly. Determine user outcome from both player result fields and reject inconsistent pairs. Unknown tokens are excluded with diagnostics, never silently mapped to a draw.

### Tests first

- Boundary/property tests for username, dates, sets, and `maxGames`.
- Schema tests for optional fields, unknown fields, wrong types, malformed arrays, and oversized counts.
- Table-driven result mapping for both user colours, draws, abandonment/time outcomes, and unknown/inconsistent tokens.
- Error messages are safe for rendering and contain no raw response body.

### Acceptance

- Every trust-boundary value is narrowed from `unknown`.
- Every validation failure maps to a stable error/diagnostic code.
- The browser client, repositories, and ingestion service share these contracts.

## 4. Task 1.3 — Direct browser Chess.com PubAPI client

### Files

- Create `lib/api/chesscomUrl.ts`.
- Create `lib/api/chesscomClient.ts`.
- Create `lib/api/errors.ts`.
- Create `lib/api/pubApiCoordinator.ts`.
- Create `tests/api/chesscomClient.test.ts`.

### Request requirements

- Support only:
  - `https://api.chess.com/pub/player/{username}/games/archives`;
  - `https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}`.
- Build URLs from validated segments with `new URL()`; never accept a caller-supplied URL or arbitrary path.
- Use `GET`, `mode: 'cors'`, `credentials: 'omit'`, `redirect: 'follow'`, and normal browser HTTP caching.
- After redirects, reject the response unless `response.url` still has HTTPS origin `api.chess.com` and the approved player-archives/monthly path family.
- Do not set `User-Agent`, `If-None-Match`, `If-Modified-Since`, `X-Application-Contact`, or another non-safelisted request header. Browsers control `User-Agent`, and the current PubAPI preflight permits only simple cross-origin use.
- Give every attempt a composed abort signal that enforces a 10-second deadline and caller cancellation.
- Fetch one PubAPI request at a time per ingestion job.
- When available, hold a named Web Lock only for the duration of each network attempt so same-origin tabs do not issue concurrent PubAPI calls. If Web Locks are unavailable, remain serial per tab and rely on bounded 429 recovery.

### Response and resource requirements

- Accept only a successful JSON response matching the endpoint schema.
- Map 404 to player/data not found, 410 to permanently unavailable, 429 to rate limited, and other retryable statuses according to the canonical error contract.
- Never reflect arbitrary upstream response text into the UI.
- Reject a declared body over 32 MiB before reading when `Content-Length` is available.
- Independently count streamed bytes and abort above 32 MiB; a missing or false `Content-Length` must not bypass the limit.
- Reject a monthly response containing more than 20,000 raw game objects before normalization.
- Treat CORS rejection, offline state, timeout, malformed JSON, invalid schema, and abort as distinct typed outcomes.

### Caching rule

Use `cache: 'default'`. JavaScript does not manage validators because the current PubAPI CORS preflight does not allow conditional-request headers, and `ETag` is not guaranteed readable. The browser may reuse/revalidate its HTTP cache. Application freshness comes from IndexedDB `archiveSync` records:

- current UTC month: stale after 15 minutes;
- completed month: stale after 30 days;
- archive-list planning metadata: stale after 15 minutes;
- manual refresh: ignore the application timer and issue a normal browser fetch.

Do not claim that a request was an HTTP cache hit unless the platform exposes trustworthy evidence; report only application-cache reuse versus a browser fetch.

### Tests first

- Assert exact origin/path encoding for valid usernames, years, and months, plus rejection of an unexpected final redirect origin/path.
- Prove arbitrary URL/path injection is impossible.
- Assert method, CORS mode, omitted credentials, allowed request headers, abort signal, and fetch-cache mode.
- Cover 200, 404, 410, 429, 5xx, network/CORS failure, timeout, cancellation, wrong content type, malformed JSON, schema failure, lying/missing `Content-Length`, streamed overflow, and raw-count overflow.
- Test serial job scheduling and mocked Web Lock acquisition/release.
- Assert diagnostics/telemetry never contain full usernames, username-bearing URLs, response bodies, or PGNs.

### Acceptance

- No application endpoint can be abused as a Chess.com proxy because none exists.
- Every request completes, aborts, or times out with exactly one typed result.
- A real preview-browser smoke request confirms `Access-Control-Allow-Origin: *` behavior without custom headers.

## 5. Task 1.4 — Versioned IndexedDB repositories

### Files

- Create `lib/db/schema.ts`.
- Create `lib/db/openDatabase.ts`.
- Create repositories for archive sync metadata, games, evaluations, graph snapshots, and metadata.
- Create `lib/db/retention.ts` and `lib/db/deleteLocalData.ts`.
- Create repository and migration tests.

### Schema v1

| Store            | Key                       | Required indexes                                | Stored data                                                                                             |
| ---------------- | ------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `archiveSync`    | `username:YYYY-MM`        | `username`, `month`, `lastSuccessfulFetchAt`    | timestamps, status, observed normalized game IDs/count, normalizer version; no PGNs or raw monthly JSON |
| `games`          | stable game ID            | `username`, `endedAt`, `timeClass`, `userColor` | normalized metadata and the only persisted copy of the PGN                                              |
| `evaluations`    | serialized evaluation key | `positionHash`, `engineBuild`, `lastUsedAt`     | compatible engine output                                                                                |
| `graphSnapshots` | query fingerprint         | `username`, `createdAt`                         | optional versioned graph snapshot within the Phase 2 byte limit                                         |
| `meta`           | name                      | none                                            | schema, retention, and archive-list planning metadata                                                   |

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

## 6. Task 1.5 — Resilient ingestion service

### Files

- Create `features/ingestion/ingestionService.ts`.
- Create `features/ingestion/archivePlanner.ts`.
- Create `features/ingestion/retryPolicy.ts`.
- Create `features/ingestion/types.ts`.
- Create ingestion tests with a fake API client, clock, repository, lock coordinator, and abort signal.

### Status contract

```typescript
type IngestionStatus =
  | 'planning'
  | 'loading-cache'
  | 'fetching'
  | 'filtering'
  | 'complete'
  | 'partial'
  | 'cancelled'
  | 'failed';
```

Progress includes months planned/completed, records fetched/accepted/excluded, whether data came from IndexedDB or a browser fetch, retry state, and bounded diagnostics. Partial results identify failed months and remain retryable.

### Algorithm requirements

1. Fingerprint the validated query.
2. Read fresh archive-list planning metadata or fetch the archive list.
3. Select only months intersecting the UTC query range and order them descending.
4. For each month, reuse fresh normalized games or issue a browser fetch when stale/missing.
5. Execute PubAPI requests serially; coordinate each network attempt across tabs when possible.
6. Retry only network/CORS errors, timeouts, 429, 502, 503, and 504, at most three attempts using exponential backoff with full jitter and abort-aware waits. Honor a valid `Retry-After` value if it is readable.
7. Validate, normalize, deduplicate, filter, and atomically persist each successful month.
8. Apply standard-chess, inclusive UTC date, time-class, colour, and rated filters.
9. Stop as soon as `maxGames` is satisfied or the oldest requested boundary is crossed.
10. Emit exactly one complete, partial, cancelled, empty-complete, or failed terminal result. Never erase already accepted in-memory results because a later month fails.

Generate a cryptographically random job ID where available. A newer query cancels and supersedes the old job; late progress/results are ignored by relevance token.

### Tests first

- Archive planning across date boundaries and missing months.
- Application-cache hit, stale current month, stale completed month, manual refresh, and offline cache reuse.
- Every filter alone and in combination.
- Case-insensitive player matching with explicit colour verification.
- Duplicate games across cached/fetched months.
- Retry delays with fake clock, cancellation during wait/fetch/lock acquisition, and stale-job isolation.
- Partial result with diagnostics and total failure without silent empty output.
- Multi-tab coordinator never holds a lock during backoff, parsing, filtering, or persistence.

### Acceptance

- A user with years of archives does not fetch irrelevant months.
- All controls demonstrably affect the result set.
- 429 and transient failures are retried without same-job parallel bursts.
- Cancellation promptly stops lock waits, network work, and persistence.
- Offline cached data remains usable with an explicit freshness notice.

## 7. Phase 1 exit gate

- All phase tests and global CI checks pass.
- Preview deployment has verified security/isolation headers and CSP.
- Direct PubAPI URL construction, CORS mode, omitted credentials, timeout, streaming size limit, normalized errors, and serial coordination are demonstrated.
- IndexedDB survives reload, stores each PGN once, and supports deletion.
- Ingestion E2E fixtures cover complete, partial, cancelled, empty, offline-cache, and failed results.
- Normal pull-request CI makes no live Chess.com calls; one controlled preview smoke call is recorded.
- Playwright MCP has been used against the tested preview revision for the Phase 1 browser smoke journey, with material findings represented by committed tests.
- Architecture and implementation contain no server PubAPI proxy, obsolete Next.js 14 APIs, disallowed request headers, or placeholder contact address.
