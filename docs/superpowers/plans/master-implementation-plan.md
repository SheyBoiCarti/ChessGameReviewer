# Master Implementation Plan — Chess.com Game Analyzer

**Version:** 2.2  
**Date:** 2026-08-11  
**Status:** Ready for implementation  
**Authority:** The [production design specification](../specs/2026-08-11-chesscom-game-analyzer-design.md) is authoritative. Phase plans may add implementation detail but may not override it.

## 1. Delivery strategy

Implementation proceeds through five independently verifiable phases. Each phase must leave the project buildable, tested, and deployable to a preview environment. A phase is complete only when its exit gate passes; checking off file creation is not sufficient.

### Phase documents

1. [Phase 1 — Foundation, direct PubAPI ingestion, and persistence](phase-1-direct-ingestion-persistence.md)
2. [Phase 2 — PGN parsing, position graph, and path aggregation](phase-2-opening-tree-engine.md)
3. [Phase 3 — Stockfish WASM and accuracy analysis](phase-3-stockfish-wasm-engine.md)
4. [Phase 4 — Accessible application workspace](phase-4-ui-workspace-components.md)
5. [Phase 5 — Advanced metrics and production verification](phase-5-advanced-features-verification.md)

## 2. Release slices

### Production MVP — Phases 1–4

- validated Chess.com query and resilient public-data ingestion;
- local IndexedDB cache with migration and deletion controls;
- correct, worker-built opening graph with transposition paths;
- responsive tree and selected-game workspaces;
- local Stockfish analysis with a single-thread fallback;
- visible progress, cancellation, partial-result, empty, and failure states;
- preview deployment with CI and browser smoke tests.

### Advanced release — Phase 5

- statistically qualified repertoire and move-order metrics;
- pragmatic engine/human comparison;
- analysed-coverage-aware error heatmaps;
- licensed theory or imported-repertoire departure detection;
- rating-tier comparison;
- full security, performance, accessibility, license, and production audit.

## 3. Global implementation rules

1. Use the current supported Next.js Active LTS patch and compatible Node/React versions. Commit the generated lockfile. Do not use the obsolete Next.js 14.1.0 snippets from superseded documents.
2. Use TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` unless a documented compatibility issue prevents it.
3. Validate data at every trust boundary: query/URL segments, upstream JSON, IndexedDB records after migration, PGN input, and worker messages.
4. Keep React free of bulk parsing, graph construction, and UCI protocol logic.
5. Do not use `any` in production code. Narrow `unknown` through runtime schemas or type guards.
6. All long-running browser operations require job IDs, progress, cancellation, and explicit terminal status.
7. No analytical function may return hard-coded sample output.
8. Do not claim parity with Chess.com Game Review. Use project-specific names and include an unaffiliated-product disclaimer.
9. Every third-party binary or data asset requires pinned provenance, checksum, license, and corresponding-source information where applicable.
10. Tests must be deterministic. Live external APIs are excluded from normal pull-request CI.
11. Never log raw PGNs or complete usernames in production diagnostics.
12. Every phase ends with type check, lint, tests, production build, and a preview smoke test appropriate to the implemented scope.
13. Do not create an unauthenticated Chess.com proxy. PubAPI ingestion uses fixed direct browser CORS requests with omitted credentials, serial scheduling, and CSP restriction.
14. Store each PGN once in IndexedDB; archive sync records contain metadata and game IDs only.
15. Enforce the 40-ply graph horizon and fixed graph structural limits inside the worker, not only in UI validation.
16. Use the installed Playwright MCP for interactive verification of running local and preview builds after browser-visible changes. Treat it as a supplement: reproducible acceptance and regression checks remain committed Playwright/Vitest tests, and CI must not depend on MCP session state.

## 4. Planned repository structure

```text
app/
├── layout.tsx
├── page.tsx
└── globals.css
components/
├── analysis/
├── board/
├── controls/
├── feedback/
├── tree/
└── ui/
features/
├── game-query/
├── ingestion/
├── opening-tree/
└── stockfish-analysis/
lib/
├── api/                 # browser PubAPI client, URL builder, schemas
├── chess/
├── db/
├── engine/
├── metrics/
└── validation/
workers/
├── analysis-data.worker.ts
├── stockfish.worker.ts
└── protocol.ts
public/stockfish/
tests/
├── api/                 # mocked PubAPI client contracts; no live PR calls
├── browser/
├── chess/
├── db/
├── engine/
├── fixtures/
├── metrics/
└── workers/
```

Feature folders may expose React hooks and view models; deterministic domain code remains in `lib/`.

## 5. Cross-phase interfaces

The following contracts must be established in Phase 1 and extended compatibly:

- `GameQuery`, `IngestionProgress`, `IngestionResult`, and structured diagnostics;
- normalized PubAPI data/error results and safe URL-construction contracts;
- versioned IndexedDB repositories;
- worker request/progress/result/error envelopes;
- stable game identity and normalized Chess.com result mapping.

Phase 2 owns:

- `MovePly`, `ParsedGame`, `PositionNode`, `MoveEdge`, `PathNode`, and graph invariants;
- graph worker messages and immutable graph snapshots.

Phase 3 owns:

- engine capability, job, UCI line, evaluation, cache-key, and annotation contracts;
- evaluation perspective and accuracy heuristic versioning.

Phase 4 consumes those contracts through feature controllers. It must not reach directly into IndexedDB object stores or worker implementation details.

## 6. CI pipeline

Every pull request runs:

1. clean, lockfile-enforced dependency install;
2. formatting check;
3. lint;
4. TypeScript check;
5. unit, property, repository, PubAPI-client contract, and worker tests;
6. coverage thresholds;
7. production build;
8. dependency and license audit;
9. Playwright Chromium smoke test once Phase 4 begins.

Main-branch previews additionally run Firefox/WebKit fallback coverage, deployed-header verification, WASM loading, and axe accessibility checks.

During implementation and release preparation, Playwright MCP is used against the same built revision to explore primary journeys, inspect console/network failures, validate responsive and accessibility behavior, and diagnose failed automated tests. Material findings are converted into committed tests. Record the tested revision/URL and outcome in phase or release verification notes; an MCP screenshot or successful manual journey is not a substitute for CI.

The scheduled pipeline runs the optional Chess.com live-contract test and production dependency audit. A live-contract failure opens an alert but does not rewrite cached data automatically.

## 7. Change and decision control

- Material architecture changes require a short ADR in `docs/adr/` and updates to the canonical design before code diverges.
- Requirement changes update this master plan and the affected phase plan in the same change.
- Do not copy complete implementation files back into the plans. Tests and source code become the executable truth once implementation starts.
- Deferred items remain explicit backlog entries; they must not be represented by empty UI or fabricated values.

## 8. Final release gate

Production promotion is allowed only when all phase exit gates pass and the definition of production-ready in the canonical design is satisfied. The release owner records:

- deployed revision and dependency lockfile hash;
- Stockfish build/network hashes and license verification;
- database schema version;
- browser and device test matrix;
- Playwright MCP verification notes for the tested preview revision, including material findings and resulting regression tests;
- performance baseline report;
- security and accessibility audit results;
- hosting limits, budget owner, rollback target, and post-deploy smoke result.
