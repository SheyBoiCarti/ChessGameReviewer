# Chess.com Game Analyzer — Production Design Specification

**Version:** 2.2  
**Date:** 2026-08-11  
**Status:** Approved for implementation  
**Canonical document:** Yes. If another document conflicts with this specification, this document wins.  
**Target:** A public, local-first web application for analysing public Chess.com games.

Version 2.1 replaced the public same-origin PubAPI proxy with verified direct browser CORS ingestion, removed duplicate raw-archive persistence, and established hard graph resource limits. Version 2.2 adds Playwright MCP to implementation-time browser verification without making local MCP state a CI dependency.

## 1. Product scope

### 1.1 Release objective

The application shall let a user:

1. Fetch public standard-chess games for a Chess.com username.
2. Restrict ingestion by UTC date range, maximum game count, time class, rated status, and player colour.
3. Explore an opening-position graph that correctly merges transpositions while preserving the move orders used to reach each position.
4. Select games for local Stockfish analysis, inspect evaluations and principal variations, and receive transparent project-specific move-quality and accuracy estimates.
5. Retain downloaded games and engine evaluations locally in the browser.
6. Delete all locally retained data without creating an account.

### 1.2 Release boundaries

- The Chess.com Published Data API is read-only and public. The application does not log in to Chess.com, submit moves, or access private data.
- Version 1 has no application accounts, cloud database, cross-device sync, or collaborative sharing.
- Only games whose `rules` value is standard chess are accepted. Variants are reported as excluded.
- Engine results are local estimates. The UI must not describe them as Chess.com Game Review scores or imply affiliation with Chess.com.
- Zero infrastructure cost is a deployment goal for personal-scale use, not a product guarantee.

### 1.3 Deferred capabilities

The following are Phase 5 capabilities and must not block the production MVP in Phases 1–4:

- repertoire leak ranking;
- statistically qualified move-order vulnerability comparison;
- engine-versus-human pragmatic matrix;
- opening blunder heatmaps;
- theory/repertoire departure detection;
- rating-tier comparison.

They may be enabled only when their data and confidence requirements in section 9 are satisfied.

## 2. Architecture decisions

### ADR-001: Local-first and account-free

Normalized game records, graph snapshots, and engine evaluations are stored in IndexedDB. No authentication is required because no private application data is stored on a server. A future account or sync feature requires a new threat model and architecture decision.

### ADR-002: Direct browser access to the Chess.com PubAPI

The browser makes credentialless CORS `GET` requests directly to fixed `https://api.chess.com/pub/*` endpoints. This avoids an unauthenticated serverless proxy, centralized upstream rate limits, and denial-of-wallet exposure. URLs are constructed only from validated username/year/month segments. The application does not attempt to set `User-Agent`, conditional-request, or custom contact headers: browsers control `User-Agent`, and the PubAPI's current CORS preflight does not allow the proposed custom headers. Browser-managed HTTP caching and IndexedDB sync metadata replace proxy-managed validator forwarding.

### ADR-003: Work outside the React thread

React owns presentation and lightweight orchestration only. PGN parsing and graph aggregation run in a dedicated analysis-data worker. Stockfish runs in its own engine worker. Large loops must not execute in React event handlers.

### ADR-004: Position graph plus interned path store

Positions are keyed by normalized FEN. Move orders are represented by an interned prefix store rather than copying complete move arrays onto every edge. Arrival-path aggregates live on the target position.

### ADR-005: Resource-budgeted Stockfish scheduler

The default is one engine instance. If cross-origin isolation and threaded WASM are available, that instance receives a bounded thread count. The implementation must not create several multithreaded engines based only on `hardwareConcurrency`.

### ADR-006: Supported dependencies only

At implementation start, use the current supported Next.js Active LTS patch and its supported React/Node versions. As of this specification, Next.js 16.2.11 or newer patched 16.x is the minimum. Exact versions are locked in the package lockfile. Unsupported major versions are prohibited.

## 3. Component architecture

```text
Browser
├── React application
│   ├── query and filter controls
│   ├── game list and progress/error states
│   ├── opening graph workspace
│   └── game-analysis workspace
├── application services
│   ├── ingestion coordinator
│   ├── graph coordinator
│   └── engine-analysis coordinator
├── analysis-data worker
│   ├── PGN parser
│   └── position graph builder
├── Stockfish engine worker
│   ├── UCI adapter
│   └── preemptive job scheduler
└── IndexedDB
    ├── archive sync metadata
    ├── normalized games and PGNs
    ├── engine evaluations
    └── metadata and migrations

External
└── https://api.chess.com/pub/*
```

### 3.1 Separation rules

- `app/` contains routing, layout, headers, and composition. It must not contain domain algorithms.
- `components/` contains presentational and accessible interaction components.
- `features/` contains feature-level controllers, hooks, and view models.
- `lib/chess/` contains deterministic chess parsing and graph logic with no React imports.
- `lib/engine/` contains engine protocols, scheduling, score normalization, and accuracy logic.
- `lib/api/` contains upstream schemas, safe PubAPI URL construction, the browser client, and normalized errors.
- `lib/db/` contains IndexedDB schema, migrations, repositories, retention, and recovery.
- `workers/` contains browser-worker entry points and typed message contracts.
- `tests/fixtures/` contains fixed PGN and upstream-response fixtures.

## 4. Ingestion and API design

### 4.1 Query contract

```typescript
type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'daily';
type PlayerColor = 'white' | 'black';

interface GameQuery {
  username: string;
  dateFrom?: string; // inclusive YYYY-MM-DD UTC
  dateTo?: string; // inclusive YYYY-MM-DD UTC
  maxGames: number; // 1..5000; default 500
  timeClasses: TimeClass[];
  colors: PlayerColor[];
  rated?: boolean;
}
```

Validation rules:

- Normalize username case for keys but preserve the display value.
- Validate the username against the documented Chess.com username grammar and length.
- Reject invalid or inverted date ranges.
- Reject limits outside the supported range.
- Require at least one time class and colour.
- Interpret date boundaries in UTC and document inclusive behaviour in the UI.

### 4.2 Browser PubAPI client

Allowed upstream requests:

- `GET https://api.chess.com/pub/player/{username}/games/archives`
- `GET https://api.chess.com/pub/player/{username}/games/{year}/{month}`

The client returns validated data or a normalized error:

```typescript
interface UpstreamError {
  code:
    | 'INVALID_REQUEST'
    | 'PLAYER_NOT_FOUND'
    | 'UPSTREAM_RATE_LIMITED'
    | 'UPSTREAM_UNAVAILABLE'
    | 'RESPONSE_TOO_LARGE'
    | 'INVALID_UPSTREAM_RESPONSE';
  message: string;
  retryable: boolean;
  status?: number;
}
```

Client requirements:

- Construct URLs from validated segments with `new URL()`; never accept an arbitrary target URL or path from callers.
- Use `mode: 'cors'`, `credentials: 'omit'`, and normal browser HTTP caching. The CSP `connect-src` allowlist contains only `https://api.chess.com` for ingestion.
- After redirects, require `response.url` to retain the HTTPS `api.chess.com` origin and approved PubAPI path family before consuming the body.
- Do not add non-safelisted request headers. In particular, do not attempt to set `User-Agent`, `If-None-Match`, `If-Modified-Since`, or `X-Application-Contact` from browser JavaScript.
- Abort each network attempt after 10 seconds and enforce a 32 MiB monthly-response byte ceiling while streaming, with `Content-Length` used only as an early rejection hint.
- Validate response content type and JSON shape before use; cap the number of raw game objects accepted from one response at 20,000.
- Preserve meaningful 404, 410, and 429 semantics without reflecting arbitrary upstream bodies.
- Serialize requests within one ingestion job. Coordinate PubAPI access across same-origin tabs with the Web Locks API when available; the fallback remains serial per tab and handles 429 with backoff.
- Keep client diagnostics local by default. Optional telemetry may include stable error code, status, duration bucket, and build version, but never a full username, URL containing a username, or PGN.

### 4.3 Fetch algorithm

1. Fetch the archive list.
2. Select only months intersecting the query range.
3. Traverse selected months newest-first.
4. Reuse fresh normalized games using IndexedDB sync metadata. When stale, issue a normal browser fetch and allow the browser HTTP cache to perform protocol-level reuse/revalidation.
5. Fetch months serially. On 429, 502, 503, 504, or network failure, retry with bounded exponential backoff and jitter, up to three attempts.
6. Apply standard-chess, date, time-class, colour, and rated filters.
7. Deduplicate using the stable Chess.com game URL or UUID.
8. Stop when `maxGames` is reached or the oldest requested boundary has been crossed.
9. Return explicit complete, partial, cancelled, or failed status with excluded/failed counts.

The current month uses an application freshness window of 15 minutes. Completed months are not assumed immutable forever and are fetched again after 30 days by default. These timers decide when the application asks the browser to fetch; browser HTTP cache directives remain authoritative for network reuse. A manual refresh bypasses the application freshness timer but not browser security controls.

## 5. Browser data model

### 5.1 IndexedDB stores

Database name: `ChessGameAnalyzerDB`. Initial schema version: 1.

| Store            | Key                       | Required indexes                                | Purpose                                                                                                          |
| ---------------- | ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `archiveSync`    | `username:YYYY-MM`        | `username`, `month`, `lastSuccessfulFetchAt`    | Sync status, observed game IDs/count, and freshness metadata only; never raw PGNs or a duplicate monthly payload |
| `games`          | stable game ID            | `username`, `endedAt`, `timeClass`, `userColor` | Normalized game metadata and PGN                                                                                 |
| `evaluations`    | serialized evaluation key | `positionHash`, `engineBuild`, `lastUsedAt`     | Reusable engine output                                                                                           |
| `graphSnapshots` | query fingerprint         | `username`, `createdAt`                         | Optional versioned graph snapshot                                                                                |
| `meta`           | name                      | none                                            | schema and retention metadata                                                                                    |

No store may use `any`. Runtime validation occurs at the API boundary and again before persisted data is trusted after a schema upgrade.

### 5.2 Retention and recovery

- Estimate storage before large ingestions when supported.
- Handle quota errors without losing the in-memory session.
- Use least-recently-used eviction for evaluations and graph snapshots.
- Commit game upserts and their `archiveSync` marker atomically; a marker must never claim success for an incomplete transaction.
- Provide “Clear local data” and per-username deletion.
- A failed migration must close the database, report a recoverable error, and offer reset; it must not loop indefinitely.

## 6. Chess parsing and position identity

### 6.1 Parsed game

```typescript
interface ParsedGame {
  id: string;
  usernameKey: string;
  userColor: PlayerColor;
  result: 'win' | 'draw' | 'loss';
  endedAt: number;
  timeClass: TimeClass;
  rated: boolean;
  userRating: number | null;
  opponentRating: number | null;
  plies: MovePly[];
  warnings: ParseWarning[];
}

interface MovePly {
  ply: number;
  san: string;
  uci: string;
  fenBefore: string; // complete six-field FEN
  fenAfter: string;
  positionBefore: string; // normalized key
  positionAfter: string;
}
```

Result conversion must explicitly cover every documented Chess.com result token. Unknown tokens produce an excluded-game diagnostic rather than silently becoming draws.

PGN parsing must:

- validate headers and movetext;
- support a legal `[SetUp "1"]` plus `[FEN "..."]` start position even though non-standard games are normally filtered;
- return structured warnings/errors with game IDs;
- never silently return partial plies as if parsing succeeded.

### 6.2 Normalized position key

The position key is:

```text
piece-placement active-colour castling-rights en-passant
```

Halfmove and fullmove counters are excluded for opening aggregation. The en-passant square is included only when a legal en-passant capture exists. FEN validation failure is an error, not a pass-through string.

Complete six-field FEN remains mandatory for engine evaluation because draw-rule state can affect analysis.

## 7. Opening graph

### 7.1 Aggregates

```typescript
interface OutcomeAggregate {
  games: number;
  userWins: number;
  draws: number;
  userLosses: number;
  whiteWins: number;
  blackWins: number;
  opponentRatingSum: number;
  opponentRatingCount: number;
}

interface PositionNode {
  key: string;
  aggregate: OutcomeAggregate;
  outgoing: Map<string, MoveEdge>; // key: UCI
  arrivalsByPath: Map<number, OutcomeAggregate>;
}

interface MoveEdge {
  uci: string;
  san: string;
  targetKey: string;
  aggregate: OutcomeAggregate;
}

interface PathNode {
  id: number;
  parentId: number | null;
  uci: string | null;
  san: string | null;
  ply: number;
}
```

### 7.2 Aggregation algorithm

For each accepted game:

1. Increment the root position once.
2. Start at the root path ID.
3. For every ply within the configured opening horizon:
   - validate that `positionBefore` equals the current position;
   - intern `(parentPathId, uci)` in the path store;
   - increment the source edge exactly once;
   - increment the target position exactly once;
   - increment the target position’s aggregate for the interned arrival path;
   - advance current position and path ID.
4. Reject the game from graph aggregation if position continuity breaks; report the diagnostic.

Required invariants:

- `games = userWins + draws + userLosses` for every aggregate.
- Each accepted game increments every visited position at most once per occurrence; repeated positions in the same game remain separate visits and are explicitly supported.
- Every edge target exists.
- Every path ID resolves to a finite prefix ending at the associated position.
- Rebuilding from the same sorted game set is deterministic.

Graph construction runs in the analysis-data worker and emits progress no more often than every 50 ms.

### 7.3 Resource limits and limited results

The opening horizon defaults to 30 plies and is user-configurable from 2 through 40 plies. Forty plies is an absolute version-1 ceiling, not a UI-only validation hint. The worker also enforces these hard structural limits per graph build:

```typescript
interface GraphBuildLimits {
  maxOpeningPlies: number; // default 30; inclusive range 2..40
  maxPositions: number; // fixed v1 value: 150_000
  maxEdges: number; // fixed v1 value: 200_000
  maxPathNodes: number; // fixed v1 value: 200_001; includes root
  maxSnapshotBytes: number; // fixed v1 value: 64 MiB
}
```

Updates are staged per game. If committing the next complete game would exceed a structural limit, the worker does not retain any part of that game and returns `status: 'limited'`, the usable graph for all previously committed games, the exact limit reached, and included/remaining game counts. A snapshot larger than the serialized byte limit remains usable for the current in-memory session but is not persisted; the UI explains why. `limited` is never labelled complete. The 10,000-game workload is a stress benchmark, not a supported query size; `GameQuery.maxGames` remains capped at 5,000.

## 8. Stockfish integration

### 8.1 Distribution

- Pin the exact Stockfish source/port commit and NNUE network.
- Store build instructions, checksums, GPLv3 notice, and a link to the exact corresponding source beside the deployed artifacts.
- Serve worker, WASM, and NNUE assets from the same origin with correct MIME and cross-origin isolation headers.
- Verify artifact checksums in CI.

### 8.2 Capability detection

Threaded mode requires all of:

- `window.crossOriginIsolated === true`;
- `SharedArrayBuffer` availability;
- successful threaded-WASM engine initialization;
- worker-side `self.crossOriginIsolated === true`.

Failure of any probe selects single-thread mode and produces a non-fatal capability status for the UI.

### 8.3 Scheduler

Job priorities:

1. interactive position evaluation;
2. selected-game analysis;
3. optional background precomputation.

Interactive work may issue `stop`, wait for `bestmove`, and then preempt lower-priority work. Interrupted work is requeued only if it is still relevant. Every job has an ID, deadline, abort signal, and terminal result. Worker errors trigger one clean restart; repeated failure disables the engine for the session with a visible error.

Default resource policy:

- one engine instance;
- threaded mode: `Threads = clamp(hardwareConcurrency - 1, 1, 4)` and bounded hash memory;
- single-thread mode: one worker and one engine thread;
- analysis pauses when the document is hidden unless the user explicitly opts in;
- mobile defaults use lower node/time budgets.

### 8.4 Evaluation contract

```typescript
interface AnalysisLimit {
  kind: 'nodes' | 'movetime' | 'depth';
  value: number;
}

interface EvaluationKey {
  fen: string; // complete FEN
  engineBuild: string;
  networkHash: string;
  limit: AnalysisLimit;
  multiPv: number;
  threads: number;
  hashMb: number;
}

interface EngineLine {
  multiPv: number;
  depth: number;
  selDepth?: number;
  score: { kind: 'cp'; value: number } | { kind: 'mate'; moves: number };
  bound?: 'lower' | 'upper';
  pv: string[];
}
```

Scores from UCI are normalized first to White’s perspective using the FEN side to move. UI conversion to player or mover perspective happens only after that normalization. Bound scores must not be treated as exact.

For a played move, compare the best evaluation of the position before the move with the evaluation after the played move using equivalent analysis limits, both expressed from the mover’s perspective.

Mate values are represented separately and converted directly to terminal win/draw/loss probabilities; they are not silently replaced by arbitrary centipawn constants.

### 8.5 Accuracy labeling

The project may use a versioned heuristic derived from win-probability loss. It must be named “Analyzer accuracy estimate,” display its engine/heuristic version, and avoid Chess.com branding.

Tests must cover both colours, score sign changes after a ply, mate transitions, terminal positions, promotions, and bound scores.

## 9. Advanced metrics

All metrics operate from the user’s perspective and publish sample size. A metric is hidden when its minimum evidence threshold is not met.

### 9.1 Repertoire leak score

Use expected score, not raw win rate:

```text
score = (wins + 0.5 × draws) / games
leakPoints = max(0, baselineScore - moveScore) × moveGames
```

The baseline must be configurable as sibling-best, parent average, or repertoire target. The UI states which baseline is active.

### 9.2 Move-order vulnerability

Compare `arrivalsByPath` for the same target position. Require at least 10 games per compared path by default and show Wilson confidence intervals. Flag a path only when the configured practical difference is exceeded and intervals provide adequate evidence. Never fabricate rates.

### 9.3 Pragmatic matrix

Use normalized mover-perspective engine evaluation plus human expected score. Require a minimum game sample and a completed engine evaluation with recorded settings. Thresholds live in versioned configuration and are shown in the UI.

### 9.4 Blunder heatmap

Aggregate classified errors by source position, move UCI, and from/to squares. Only analyzed moves contribute. The UI must show analysed-game coverage so an incomplete batch is not mistaken for complete data.

### 9.5 Theory or repertoire departure

Implement a `TheoryProvider` interface. Version 1 supports a user-imported repertoire PGN and an optional versioned bundled ECO corpus. Every bundled corpus requires provenance and a compatible license in `THIRD_PARTY_NOTICES.md`. If no provider is configured, this feature is disabled rather than guessed.

### 9.6 Rating tiers

Tiers are configurable and use `opponentRating`. Missing ratings form an explicit “unknown” group. Results show sample counts and do not compare tiers below the minimum threshold.

## 10. UI and state design

Application state is divided into:

- query draft and validated active query;
- ingestion job state and diagnostics;
- selected game/position/path;
- immutable graph snapshot/view model;
- engine capability, queue, and job results;
- user preferences.

`app/page.tsx` composes feature containers only. It does not fetch months, parse PGNs, build graphs, or speak UCI.

Required UX states include initial, loading with progress, partial result, cancelled, empty, invalid user, upstream limited, offline-cache-only, storage unavailable, engine unavailable, and complete.

Accessibility requirements:

- full keyboard navigation for board history, tabs, tables, and dialogs;
- semantic buttons, tables, headings, status regions, and modal focus management;
- visible focus and non-colour-only move classifications;
- responsive board sizing using available width, not a fixed 480 px layout;
- reduced-motion support and WCAG 2.2 AA contrast targets.

## 11. Security and privacy

- No secrets are shipped to the browser.
- Add CSP, `X-Content-Type-Options`, `Referrer-Policy`, and framing restrictions compatible with WASM workers.
- Limit CSP `connect-src` to the application origin, optional explicitly configured telemetry origin, and `https://api.chess.com`; PubAPI calls use `credentials: 'omit'`.
- Apply COOP/COEP to document and worker resources as required; test actual isolation in production.
- Render upstream strings as text. Never inject PGN, usernames, or engine output as HTML.
- Sanitize filenames and PGN headers during export.
- Use dependency scanning, lockfile integrity, and pinned engine checksums.
- Publish a privacy note explaining that requested public games are stored on the device.
- Provide deletion controls and never collect PGN or analysis telemetry without explicit opt-in.

Chess.com branding, piece art, glyphs, sounds, and other recognizable assets are not copied. Include a clear unaffiliated-product disclaimer.

## 12. Reliability and observability

- Every long-running browser operation supports progress and cancellation.
- Partial data is marked and never silently promoted to complete.
- Browser ingestion diagnostics use structured error codes and remain local unless redacted telemetry is explicitly enabled.
- Client diagnostics are local by default; optional error reporting must redact usernames and PGNs.
- Cache corruption, worker failure, upstream failure, and unsupported-browser paths have user-visible recovery actions.

## 13. Testing strategy

### 13.1 Test layers

- Unit and property tests: FEN normalization, PGN parsing, result mapping, graph invariants, statistics, evaluation perspective, accuracy formulas, and UCI parsing.
- Repository tests: IndexedDB migrations, validators, eviction, quota failures, and evaluation cache keys using a browser-compatible fake IndexedDB.
- PubAPI client contract tests: mocked CORS responses for every supported status, timeout, streaming size limit, schema validation, URL construction, credentials omission, and normalized errors.
- Worker integration tests: typed messages, cancellation, progress, crash recovery, and scheduling.
- Browser E2E tests: fetch-to-tree flow, offline cache reuse, transposition navigation, real WASM single-thread analysis, capability fallback, local-data deletion, and accessibility.
- Deployment smoke tests: headers, `crossOriginIsolated`, WASM MIME/loading, CSP connectivity, and a separately controlled direct-PubAPI contract check.
- Optional live Chess.com contract test: scheduled and isolated from pull-request CI.

### 13.2 Playwright MCP verification

When Playwright MCP is available, implementation agents use it after every phase that changes browser-visible behavior to inspect the running local or preview build. Its scope includes primary user journeys, responsive layouts, keyboard/focus behavior, accessibility-tree semantics, console/page errors, failed network requests, worker startup, IndexedDB behavior, and deployed header/CORS/WASM smoke checks.

Playwright MCP is an interactive verification and diagnosis tool, not the release test runner:

- every stable regression or acceptance check discovered through MCP must be encoded in the repository's Playwright/Vitest suites where automation is practical;
- CI and release gates run from committed tests and must not require a developer's MCP installation, session state, browser profile, or stored credentials;
- MCP verification uses fixture data for normal development and must not turn pull-request checks into live Chess.com traffic;
- verification notes record build/revision, environment URL, journeys checked, console/network findings, and any follow-up test added;
- MCP screenshots, traces, or observations supplement assertions but cannot replace a failing or missing automated gate;
- Chromium MCP inspection does not replace the required Firefox and WebKit coverage.

### 13.3 Quality gates

- Type check, lint, unit/integration tests, production build, Playwright smoke tests, dependency audit, and license/checksum verification pass in CI.
- Domain modules maintain at least 90% branch coverage; other application code at least 80% unless an exception is documented.
- No unhandled promise rejection or console error in the primary E2E flows.
- Parsing and graph construction produce no UI-thread long task over 50 ms because work is delegated to a worker.
- Performance baselines are recorded on a named reference machine and regressions over 20% require approval.
- Axe reports no serious or critical accessibility violations on primary screens.

## 14. Deployment and operations

Primary deployment is Vercel with a supported Next.js runtime. Hobby is acceptable only for personal, non-commercial use within current terms. Production ownership must include a budget or migration plan before public growth. Cloudflare is an alternative only after adapter, header, and function-limit tests pass.

Required environments: local, preview, and production. Production configuration includes security headers, the fixed PubAPI `connect-src` allowlist, and optional redacted error reporting. No server-side PubAPI credentials, contact header, or rate-limit service is required.

Release process:

1. CI quality gates pass from a clean lockfile install.
2. Preview deployment passes browser and header smoke tests.
3. Engine artifacts and third-party notices are verified.
4. Production deployment is promoted from the tested revision.
5. A post-deploy smoke test verifies ingestion, cache, graph, and single-thread engine fallback.
6. Rollback uses the hosting provider’s immutable prior deployment.

## 15. Definition of production-ready

The release is production-ready only when:

- query filters affect fetched and displayed data;
- graph invariants pass on legal transposition fixtures;
- no metric contains hard-coded analytical output;
- engine analysis works in threaded and fallback modes or shows a recoverable unsupported state;
- partial ingestion and analysis are visibly labelled;
- direct PubAPI URL validation, credential omission, serial scheduling, timeout, size cap, caching, and error contracts are deployed;
- graph horizon and structural limits produce explicit `limited` results rather than exhausting the tab;
- local data can be inspected and deleted;
- accessibility, performance, browser, security, license, and deployment gates pass;
- documentation and implementation agree on every shipped feature.
