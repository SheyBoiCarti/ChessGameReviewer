# Chess.com Game Analyzer — Product and Technical Requirements

**Version:** 2.2  
**Date:** 2026-08-11  
**Status:** Approved  
**Purpose:** Stable product requirements and documentation entry point. Detailed architecture is defined in the [canonical production design](superpowers/specs/2026-08-11-chesscom-game-analyzer-design.md); implementation sequencing is defined in the [master plan](superpowers/plans/master-implementation-plan.md).

## 1. Product statement

Build an unaffiliated, browser-based application that retrieves public standard-chess games for a Chess.com username, constructs a transposition-aware opening graph, and performs transparent local Stockfish analysis. The application stores data on the user’s device and does not require an account.

## 2. Functional requirements

### Ingestion

- **FR-ING-001:** Accept and validate a Chess.com username.
- **FR-ING-002:** Filter by inclusive UTC date range.
- **FR-ING-003:** Limit accepted games from 1 through 5000, with a default of 500.
- **FR-ING-004:** Filter by one or more bullet, blitz, rapid, and daily time classes.
- **FR-ING-005:** Filter by user colour and optional rated status.
- **FR-ING-006:** Include only standard-chess games and report excluded records.
- **FR-ING-007:** Process relevant archives newest-first and stop when the query is satisfied.
- **FR-ING-008:** Display progress and allow cancellation.
- **FR-ING-009:** Distinguish complete, partial, cancelled, empty, and failed results.
- **FR-ING-010:** Use browser-managed HTTP caching, versioned IndexedDB freshness metadata, and offline reuse of previously normalized games.
- **FR-ING-011:** Fetch PubAPI data directly from the browser with fixed validated URLs, omitted credentials, serial scheduling, timeout/size limits, and typed CORS/upstream failures; do not deploy an unauthenticated application proxy.

### Opening graph

- **FR-GRAPH-001:** Parse legal PGN main lines into SAN, UCI, complete FEN, and normalized position keys.
- **FR-GRAPH-002:** Merge positions only when placement, side to move, castling, and meaningful en-passant rights match.
- **FR-GRAPH-003:** Count every visited position, including root and final position within the configured horizon.
- **FR-GRAPH-004:** Preserve user and board-colour outcomes separately.
- **FR-GRAPH-005:** Preserve distinct arrival move orders and aggregate outcomes for each.
- **FR-GRAPH-006:** Navigate candidate edges, back/root history, and transposition paths while updating the board.
- **FR-GRAPH-007:** Enforce a 40-ply absolute horizon and fixed node/edge/path/snapshot budgets; return an explicitly labelled usable `limited` graph at a complete-game boundary when a structural cap is reached.
- **FR-GRAPH-008:** Display sample size, expected score, draw rate, average opponent rating, and explicit perspective.

### Engine analysis

- **FR-ENG-001:** Run a pinned Stockfish WASM build locally in a worker.
- **FR-ENG-002:** Use threaded mode only after successful cross-origin-isolation and engine probes; otherwise use a single-thread fallback.
- **FR-ENG-003:** Enforce one global engine resource budget and prioritise interactive work.
- **FR-ENG-004:** Analyse a selected game with progress, cancellation, resume, and compatible evaluation-cache reuse.
- **FR-ENG-005:** Normalize UCI scores to White and mover perspectives correctly.
- **FR-ENG-006:** Represent mate and bound scores explicitly.
- **FR-ENG-007:** Display evaluation history, project-specific move-quality/accuracy estimates, and principal variations.
- **FR-ENG-008:** Record engine, network, settings, and heuristic version with results.
- **FR-ENG-009:** Keep ingestion and opening-tree functionality available when the engine is unavailable.

### Local data and user control

- **FR-DATA-001:** Persist normalized games, archive sync metadata, compatible evaluations, and optional graph snapshots in versioned IndexedDB stores; store each PGN only once and never persist a duplicate raw monthly payload.
- **FR-DATA-002:** Handle quota, migration, corruption, and eviction failures visibly and recoverably.
- **FR-DATA-003:** Delete data for one username or all local application data.
- **FR-DATA-004:** Explain local storage and send only validated public Chess.com requests directly to `https://api.chess.com`; never upload PGNs or engine analysis.

### Advanced features

- **FR-ADV-001:** Rank repertoire leaks using expected score and an explicit baseline.
- **FR-ADV-002:** Compare arrival move orders only with sufficient samples and statistical evidence.
- **FR-ADV-003:** Combine compatible engine evaluation with qualified human expected score.
- **FR-ADV-004:** Show opening error heatmaps with analysed-game/move coverage.
- **FR-ADV-005:** Detect departure against a user-imported repertoire or a licensed, versioned theory provider.
- **FR-ADV-006:** Compare configurable opponent rating tiers with an explicit unknown-rating group.
- **FR-ADV-007:** Hide or mark all metrics with insufficient data; never fabricate analytical values.

## 3. Non-functional requirements

### Correctness and reliability

- **NFR-REL-001:** No partial fetch, parse, graph, or engine result is silently presented as complete.
- **NFR-REL-002:** Every long-running operation has a job ID, progress, cancellation, and exactly one terminal outcome.
- **NFR-REL-003:** Stale async jobs cannot overwrite current user state.
- **NFR-REL-004:** Graph aggregate and reference invariants are automatically tested.
- **NFR-REL-005:** Upstream transient errors use bounded retry/backoff; non-retryable errors fail immediately.
- **NFR-REL-006:** Use Playwright MCP, when available, for interactive local/preview browser verification and diagnosis; convert stable findings into committed automated tests, and never make CI depend on local MCP state.

### Performance

- **NFR-PERF-001:** PGN parsing and graph building run outside the UI thread.
- **NFR-PERF-002:** Move-order storage grows by unique prefixes, not repeated full path copies on each edge.
- **NFR-PERF-003:** Stockfish uses a bounded CPU/hash policy suitable for mobile fallback.
- **NFR-PERF-004:** No graph task creates a UI-thread long task over 50 ms.
- **NFR-PERF-005:** Performance baselines cover 1,000 and 10,000 games and selected games up to 160 plies.
- **NFR-PERF-006:** The 10,000-game corpus is a stress workload, not a supported query size; supported queries are capped at 5,000 games, the opening horizon defaults to 30 and is capped at 40 plies, and graph structural budgets are enforced in the worker.

### Security and privacy

- **NFR-SEC-001:** The browser PubAPI client constructs only approved `https://api.chess.com/pub/*` URLs from validated segments, uses CORS with omitted credentials, and is constrained by CSP `connect-src`.
- **NFR-SEC-002:** PubAPI requests implement timeout, streamed size limits, serial/cross-tab coordination, bounded 429 recovery, safe errors, and local/redacted diagnostics. No public application proxy is deployed.
- **NFR-SEC-003:** Production uses supported dependency versions, a committed lockfile, scanning, and security headers.
- **NFR-SEC-004:** Stockfish and theory assets have pinned provenance, checksums, and license compliance.
- **NFR-SEC-005:** Upstream strings are rendered as text and export filenames/headers are sanitized.
- **NFR-SEC-006:** Raw PGNs and complete usernames are not sent to telemetry by default.

### Accessibility and compatibility

- **NFR-A11Y-001:** Primary flows target WCAG 2.2 AA and have no serious/critical axe violations.
- **NFR-A11Y-002:** Board history, tabs, tables, dialogs, controls, and analyzer navigation are keyboard accessible.
- **NFR-A11Y-003:** Information is not communicated by colour alone.
- **NFR-COMPAT-001:** Desktop Chromium, Firefox, and WebKit receive working ingestion/tree features.
- **NFR-COMPAT-002:** Engine fallback/unavailable states are supported without breaking the app.
- **NFR-COMPAT-003:** Phone, tablet, 200% zoom, and reduced-motion layouts are verified.

### Deployment and operations

- **NFR-OPS-001:** Use a currently supported Next.js Active LTS patch and compatible runtime.
- **NFR-OPS-002:** Local, preview, and production environments use the same immutable revision/lockfile.
- **NFR-OPS-003:** Preview and production smoke tests verify headers/CSP, direct PubAPI CORS connectivity, storage, graph worker, and WASM fallback.
- **NFR-OPS-004:** Hosting limits and terms are recorded; zero cost is not guaranteed.
- **NFR-OPS-005:** Release records include rollback target, engine hashes, schema version, test matrix, and audit results.

## 4. Explicit non-requirements

- Chess.com authentication or private account access.
- Application user accounts or server-side game database.
- Exact reproduction of Chess.com Game Review, accuracy, classifications, visuals, glyphs, or branded assets.
- Server-side Stockfish analysis.
- Unlimited batch analysis independent of device resources.
- Support for chess variants in version 1.

## 5. Traceability

| Requirement area      | Design section | Implementation phase |
| --------------------- | -------------- | -------------------- |
| Ingestion/API         | 4–5            | Phase 1              |
| PGN/position graph    | 6–7            | Phase 2              |
| Stockfish/accuracy    | 8              | Phase 3              |
| Application UX        | 10             | Phase 4              |
| Advanced metrics      | 9              | Phase 5              |
| Security/privacy      | 11             | Phases 1 and 5       |
| Reliability/testing   | 12–13          | Every phase          |
| Deployment/operations | 14–15          | Phases 1 and 5       |

## 6. Implementation status

| Requirement range | Status         | Notes                                                              |
| ----------------- | -------------- | ------------------------------------------------------------------ |
| FR-ING-001–011    | Implemented    | Remediation verified in the 2026-09-02 audit record.               |
| FR-GRAPH-001–008  | Implemented    | Includes enforced serialized snapshot budget.                      |
| FR-ENG-001–009    | Implemented    | Cache degradation remains non-fatal and visible.                   |
| FR-DATA-001–004   | Implemented    | Graph snapshot persistence remains optional.                       |
| FR-ADV-001–006    | Deferred       | Planned Phase 5 functionality; not present in the current release. |
| FR-ADV-007        | Governing rule | Applies when any advanced metric is implemented.                   |

## 7. Documentation map

- [Canonical architecture and technical decisions](superpowers/specs/2026-08-11-chesscom-game-analyzer-design.md)
- [Master implementation plan](superpowers/plans/master-implementation-plan.md)
- [Phase 1 — Foundation/direct ingestion/persistence](superpowers/plans/phase-1-direct-ingestion-persistence.md)
- [Phase 2 — Parsing/graph](superpowers/plans/phase-2-opening-tree-engine.md)
- [Phase 3 — Stockfish](superpowers/plans/phase-3-stockfish-wasm-engine.md)
- [Phase 4 — UI](superpowers/plans/phase-4-ui-workspace-components.md)
- [Phase 5 — Advanced/release audit](superpowers/plans/phase-5-advanced-features-verification.md)
