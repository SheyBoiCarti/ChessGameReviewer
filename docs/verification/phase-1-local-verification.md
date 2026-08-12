# Phase 1 Local Verification

**Date:** 2026-08-12  
**Verified implementation revision:** `55397f68beda0ea29323f06d23bb0b413f287470`  
**Environment:** Windows, Node.js 22, Next.js 16.3.0, Chromium project using installed Microsoft Edge  
**Scope:** Local deterministic evidence for Tasks 1.1–1.5. Deployed-preview/MCP and controlled-live Chess.com checks remain external.

## Fresh gate results

| Command                            | Result                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm.cmd ci`                       | Passed; 502 packages installed from the lockfile; zero vulnerabilities after patched exact dependency updates                                          |
| `npm.cmd run format:check`         | Passed                                                                                                                                                 |
| `npm.cmd run lint`                 | Passed                                                                                                                                                 |
| `npm.cmd run typecheck`            | Passed with strict and exact optional property checking                                                                                                |
| `npm.cmd run test:coverage`        | Passed; 16 files and 223 tests; 91.54% overall branch coverage, 92.82% ingestion-feature branch coverage, and the `lib/**/*.ts` 90% branch gate passed |
| `npm.cmd run build`                | Passed; Next.js 16.3.0 production build generated `/`, `/phase-1-test-harness`, and static routes                                                      |
| `npm.cmd run test:e2e`             | Passed; 11 Chromium-project tests against `next start`                                                                                                 |
| `npm.cmd audit --audit-level=high` | Passed; zero vulnerabilities                                                                                                                           |

## Task 1.1 — Supported tooling

| Requirement                                                                                     | Evidence                                                                                                     | Status                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Supported patched Next.js 16, React, and Node                                                   | Exact versions and engine in `package.json`; Next production build output                                    | Proven locally                |
| Pinned npm and reproducible lockfile                                                            | `packageManager` and exact dependencies in `package.json`; `package-lock.json`; clean `npm.cmd ci`           | Proven locally                |
| Strict TypeScript and path alias                                                                | `tsconfig.json`; fresh `npm.cmd run typecheck`                                                               | Proven locally                |
| Separate Node/DOM Vitest projects, browser helpers, fake IndexedDB, worker strategy             | `vitest.config.ts`, `tests/setup/dom.setup.ts`, `tests/setup/worker-strategy.test.ts`                        | Proven locally                |
| Chromium Playwright configuration                                                               | `playwright.config.ts`; 11 passing browser tests                                                             | Proven locally                |
| Required quality scripts                                                                        | `package.json`; every Phase 1 script executed successfully                                                   | Proven locally                |
| COOP, COEP, nosniff, referrer, framing, worker/WASM CSP, and PubAPI-only ingestion connectivity | `next.config.ts`; `tests/setup/headers.test.ts`; `tests/e2e/server-headers.spec.ts`; `tests/e2e/csp.spec.ts` | Proven locally                |
| No unauthenticated application PubAPI proxy                                                     | Architecture search found no `app/api` or `pages/api`; only browser client fetch remains                     | Proven locally                |
| Unaffiliated notice and local-storage/privacy summary                                           | `app/page.tsx`; `tests/e2e/smoke.spec.ts`                                                                    | Proven locally                |
| Computed isolation state, console/network behavior, CSP, and persistence                        | `components/IsolationStatus.tsx`; browser header, CSP, smoke, and IndexedDB suites                           | Proven locally                |
| Exact deployed preview revision and Playwright MCP inspection                                   | Requires a deployed preview URL and MCP session for this revision                                            | External verification pending |

## Task 1.2 — Contracts and runtime validation

| Requirement                                                                                                                            | Evidence                                                                                                               | Status         |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------- |
| Canonical query, upstream error, raw response, normalized game, job, and diagnostic contracts                                          | `lib/api/contracts.ts`, `features/ingestion/types.ts`                                                                  | Proven locally |
| Username, inclusive UTC dates, inversion, 1–5000/default limit, non-empty supported sets, deduplication, and optional rated validation | `lib/validation/gameQuery.ts`; `tests/unit/gameQuery.test.ts`                                                          | Proven locally |
| Trust-boundary narrowing, ignored unknown fields, required-field diagnostics, and 20,000-item cap                                      | `lib/api/chesscomSchemas.ts`; `tests/unit/chesscomSchemas.test.ts`; `tests/fixtures/upstream/oversizedMonthlyGames.ts` | Proven locally |
| Explicit result-token mapping for both colours; inconsistent and unknown outcomes excluded                                             | `lib/chess/results.ts`; `tests/unit/results.test.ts`; ingestion normalization tests                                    | Proven locally |
| Stable safe diagnostic codes without raw response-body reflection                                                                      | API/schema/result tests and `sanitizeMessage` cases in `tests/api/chesscomClient.test.ts`                              | Proven locally |

## Task 1.3 — Direct browser PubAPI client

| Requirement                                                                                 | Evidence                                                                                | Status                        |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------- |
| Only approved archives/month URL families, constructed from validated segments              | `lib/api/chesscomUrl.ts`; URL and injection tests in `tests/api/chesscomClient.test.ts` | Proven locally                |
| Credentialless simple CORS GET, browser cache, no disallowed request headers                | `lib/api/chesscomClient.ts`; exact request-option assertions; architecture search       | Proven locally                |
| Final redirect origin/path validation                                                       | `isValidRedirectUrl`; redirect contract tests                                           | Proven locally                |
| Ten-second deadline and caller cancellation composed per attempt                            | client abort composition; timeout, cancellation, and mid-stream abort tests             | Proven locally                |
| Serial attempts and abortable same-origin Web Locks scoped to network/body read             | `lib/api/pubApiCoordinator.ts`; coordinator and lock-release tests                      | Proven locally                |
| Status, content type, JSON, schema, declared/streamed 32 MiB, and 20,000-object enforcement | client/schema implementation and API contract tests                                     | Proven locally                |
| Typed 404/410/429/5xx/offline/CORS/timeout/abort/malformed/schema/redirect outcomes         | table and behavior tests in `tests/api/chesscomClient.test.ts`                          | Proven locally                |
| Browser-managed HTTP cache plus IndexedDB freshness, without false protocol-cache claims    | `cache: 'default'`; `features/ingestion/ingestionService.ts`; freshness tests           | Proven locally                |
| Controlled real Chess.com CORS request from the deployed preview                            | Requires approved preview URL/revision and live external service                        | External verification pending |

## Task 1.4 — Versioned IndexedDB repositories

| Requirement                                                                              | Evidence                                                                        | Status         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------- |
| Canonical `ChessGameAnalyzerDB` schema v1, stores, keys, and indexes                     | `lib/db/schema.ts`, `lib/db/openDatabase.ts`; schema/open/migration tests       | Proven locally |
| PGN stored only with normalized games; no raw monthly persistence                        | runtime validators; repository PGN-isolation test; architecture search          | Proven locally |
| Runtime validation of persisted records and visible corrupt/incompatible recovery errors | schema validators, repositories, compatibility checks, corrupt-record tests     | Proven locally |
| Explicit transaction scopes, idempotent upserts, and atomic games-plus-marker commit     | `lib/db/repositories.ts`; rollback, abort, and deduplication tests              | Proven locally |
| Cache reads and normalized archive-list metadata                                         | repository methods and metadata/month-query tests                               | Proven locally |
| Storage/quota errors preserve caller-owned in-memory results                             | `wrapIDBError`; repository and ingestion quota/error tests                      | Proven locally |
| Per-user and complete deletion with counts                                               | `lib/db/deleteLocalData.ts`; DOM and real-browser deletion tests                | Proven locally |
| True LRU evaluation/snapshot eviction                                                    | `lib/db/retention.ts`; last-used ordering, count, byte, and default-limit tests | Proven locally |
| Version-change close, blocked upgrade, migration recovery                                | `openDatabase.ts`; open/migration tests                                         | Proven locally |
| Real-browser reload persistence and deletion                                             | `tests/e2e/indexeddb-persistence.spec.ts`                                       | Proven locally |

## Task 1.5 — Resilient ingestion

| Requirement                                                                                                      | Evidence                                                                           | Status         |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------- |
| Stable query fingerprint and cryptographically random job ID where available                                     | `features/ingestion/archivePlanner.ts`, `ingestionService.ts`; unit/manager tests  | Proven locally |
| Fresh archive metadata reuse, fetch fallback, and offline cached planning                                        | ingestion service and cache/offline tests                                          | Proven locally |
| Inclusive UTC month intersection and newest-first ordering                                                       | archive planner and boundary tests                                                 | Proven locally |
| Current/completed freshness windows and manual refresh                                                           | ingestion freshness tests                                                          | Proven locally |
| Serial month processing and no lock held during backoff/normalization/filtering/persistence                      | service dependency sequencing and coordinator tests                                | Proven locally |
| Retry only CORS/network, timeout, 429, 502/503/504; three attempts; full jitter; Retry-After; abort-aware waits  | `features/ingestion/retryPolicy.ts`; 10 retry-policy tests and service retry tests | Proven locally |
| Standard chess, inclusive date, time class, colour, rated, and explicit player identity filters                  | ingestion service filter/normalization tests                                       | Proven locally |
| Cross-month deduplication and immediate `maxGames` stop                                                          | ingestion service tests                                                            | Proven locally |
| Atomic persistence per successful fetched month; cached months not rewritten                                     | repository/service interaction tests                                               | Proven locally |
| Monotonic bounded progress and explicit cache/browser/retry details                                              | ingestion progress tests and contracts                                             | Proven locally |
| Exactly one complete/empty, partial, cancelled, or failed terminal result; accepted games survive later failures | unit/DOM service tests and fixture-driven browser journeys                         | Proven locally |
| Newer jobs abort/supersede older jobs and suppress stale publication                                             | `IngestionManager`; supersession and late-progress tests                           | Proven locally |

## Phase 1 exit gate

| Requirement                                                                                                     | Evidence                                                                    | Status                        |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------- |
| All local phase tests and global CI checks pass                                                                 | Fresh gate table above                                                      | Proven locally                |
| Preview security/isolation headers and CSP                                                                      | Local `next start` production tests pass; deployed preview URL not supplied | External verification pending |
| Direct URL construction, CORS, credentials omission, timeout, stream cap, errors, and coordination              | API contract suite and architecture search                                  | Proven locally                |
| IndexedDB reload persistence, single PGN copy, and deletion                                                     | repository plus browser persistence suite                                   | Proven locally                |
| Complete, partial, cancelled, empty, offline-cache-only, and failed E2E fixtures                                | `tests/e2e/ingestion-fixtures.spec.ts`                                      | Proven locally                |
| Normal PR tests make no live Chess.com calls                                                                    | CSP test intercepts the approved request; other E2E journeys use fixtures   | Proven locally                |
| Controlled live PubAPI smoke recorded                                                                           | Requires approved deployed preview and live external service                | External verification pending |
| Playwright MCP journey recorded for deployed tested revision                                                    | Requires exact preview URL and available MCP browser session                | External verification pending |
| No proxy, obsolete DB/orchestrator/queue, disallowed headers, raw monthly persistence, or general `unsafe-eval` | Architecture searches; CSP contains only `wasm-unsafe-eval` for WASM        | Proven locally                |

## Architecture search interpretation

- The only application `fetch(` is in `lib/api/chesscomClient.ts`; the two E2E fetches are deliberate CSP probes.
- `wasm-unsafe-eval` is the narrowly required WASM permission and is not general `unsafe-eval`.
- `rawMonthlyJson` appears only in a rejection validator proving such data cannot be persisted.
- No legacy database name, `syncOrchestrator`, `jobQueue`, server proxy, or disallowed request-header use remains in application/test scope.
