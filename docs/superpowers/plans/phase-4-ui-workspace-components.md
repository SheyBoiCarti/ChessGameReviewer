# Phase 4 — Accessible Application Workspace

**Status:** Ready for implementation  
**Depends on:** Phase 1 ingestion, Phase 2 graph worker, Phase 3 engine service  
**Produces:** The complete production-MVP user experience with real data wiring, responsive navigation, accessibility, and recoverable states.

## 1. Phase outcomes

At completion, a user can submit a validated query, monitor/cancel ingestion, inspect diagnostics, select games, navigate a real transposition graph, analyse a selected game with Stockfish, inspect PVs and annotations, reuse offline cache, and delete local data.

`app/page.tsx` is a composition boundary only. It must not fetch archive months, parse PGNs, mutate graph classes, speak UCI, or contain analytical formulas.

## 2. Task 4.1 — Feature controllers and application state

### Files

- Create feature controllers/hooks for game query, ingestion, opening tree, and Stockfish analysis.
- Create small stores or reducers for preferences and view selections.
- Create application-level error boundary and status components.
- Create controller/race-condition tests.

### State boundaries

- Query draft is separate from the validated active query.
- Ingestion state owns its job ID, abort controller, progress, result, and diagnostics.
- Graph state owns an immutable versioned snapshot and selected position/path.
- Game-analysis state owns selected game, settings, engine capability, job status, coverage, and annotations.
- Preferences own board orientation, result perspective, theme, opening horizon (default 30; constrained to 2..40), and analysis strength.

Do not store active workers, database handles, mutable graph maps, or unresolved promises in a serializable UI store. Services own those resources and expose typed subscriptions/actions.

### Concurrency rules

- Starting a new query cancels and supersedes the prior ingestion and graph jobs.
- Results are accepted only when their job/relevance token matches current state.
- Selecting a new game cancels irrelevant interactive/batch engine work.
- Unmounting the workspace disposes subscriptions and optionally pauses services without deleting caches.

### Tests first

- State transition tables for initial/loading/partial/cancelled/failed/empty/complete.
- Rapid query submission cannot allow stale results to win.
- Graph snapshot and selected position reset appropriately on query change.
- Engine capability failure does not break opening-tree use.
- Error boundary provides reset/recovery actions.

### Acceptance

- No domain service is recreated on every React render.
- No stale async result can replace current state.
- All service failures appear as typed UI states rather than console-only errors.

## 3. Task 4.2 — Query, progress, diagnostics, and local-data controls

### Files

- Create `GameQueryForm`, date range, maximum games, time-class, colour, and rated controls.
- Create `IngestionProgress`, `DiagnosticSummary`, `OfflineCacheNotice`, and `LocalDataSettings`.
- Create component and browser-flow tests.

### Query UX

- Username input is trimmed and validated on submit.
- Date fields state UTC inclusivity.
- Maximum game count defaults to 500 and is constrained to 1..5,000; the opening horizon defaults to 30 and is constrained to 2..40 plies in both UI and worker validation.
- Time-class and colour controls allow multiple selections and prevent empty invalid sets.
- Submitting shows a progress region and a cancel action.
- Disable only actions that would conflict; navigation and already-loaded data remain usable where safe.

### Result states

- `complete`: show accepted/excluded counts and cache use.
- `partial`: prominently identify failed months and allow retry.
- `cancelled`: retain explicitly completed local work and offer resume/new query.
- `empty`: distinguish no games from all games excluded by filters.
- `failed`: map invalid player, rate limit, offline, upstream unavailable, storage unavailable, and internal failure to specific guidance.
- graph `limited`: identify the exact node/edge/path resource cap and included/remaining games; retain navigation for the completed portion and never display it as complete.
- snapshot persistence warning: a complete or limited graph over 64 MiB remains usable for the session but is explicitly reported as unavailable offline.

### Local data

- Show approximate stored data by username where available.
- Support per-username deletion and clear-all with confirmation.
- Explain that games and analysis remain on device.
- Deletion reports success/failure and invalidates affected in-memory snapshots.

### Accessibility/tests

- Labels and error descriptions are programmatically associated.
- Progress uses a polite live region; urgent terminal failures use an appropriate alert.
- Keyboard-only form submission and cancellation work.
- Component tests use user events, not direct store mutation as the only evidence.

### Acceptance

- Every `GameQuery` property is represented and demonstrably affects the ingestion service call.
- Partial data can never look identical to complete data.

## 4. Task 4.3 — Game selector and board navigation

### Files

- Create `GameSelectorTable` with responsive compact view.
- Create `ChessboardView`, piece renderer/assets, move-history controls, arrow overlay, and evaluation bar.
- Create game/board component and E2E tests.

### Game selector

- Display opponent, user colour, result, ratings, end date, time class, rated status, and analysis state.
- Sort/filter without mutating the underlying ingestion result.
- Use stable game ID as the row key.
- Support keyboard row selection and a non-table compact layout on narrow screens.
- Show analysis coverage/status instead of a fabricated accuracy value before analysis.

### Board

- Render accessible chess pieces from repository-owned or compatibly licensed assets; letter placeholders are not production output.
- Derive the displayed position from selected game/graph navigation, not a fixed FEN.
- Provide first/previous/next/last controls and keyboard shortcuts with documented focus behaviour.
- Orientation changes visual order only; it does not change data filtering or evaluation perspective.
- Show last-move and selected-move highlights and optional PV arrows.
- Invalid FEN is caught before render and displayed as a recoverable error.
- Size using CSS aspect ratio and available viewport width; no fixed 480 px dependency.

### Evaluation bar

- Accept normalized White-perspective cp/mate/unknown state.
- Use a documented monotonic mapping and orient White advantage consistently.
- Display mate separately and never render NaN/Infinity.
- Provide a textual accessible equivalent.

### Tests first

- Real FEN piece placement, both orientations, promotions, invalid FEN, and responsive sizing.
- Navigation boundaries and keyboard operation.
- Eval sign/mate/unknown and accessible text.
- Game selection updates board and analysis context.

### Acceptance

- Board/game interactions use real parsed game data.
- No fixed evaluation value or static initial board remains after data is loaded.

## 5. Task 4.4 — Opening graph workspace

### Files

- Create `OpeningTreeTable`.
- Create `MoveOrderDialog`.
- Create path breadcrumbs/navigation and position summary.
- Create selector-driven tests and E2E transposition flow.

### Candidate move table

- Display SAN, games, selected result perspective, expected score, draw rate, average opponent rating, and sample size.
- Select a candidate move to navigate to its `targetKey` and update the board.
- Provide back/root navigation and breadcrumbs based on the chosen path while preserving the graph position identity.
- Sorting is stable and announced accessibly.
- Empty candidate positions show terminal/horizon/no-data reason where known.
- When the graph is resource-limited, keep a persistent status notice in the workspace and include the configured 40-ply maximum in horizon help text.

### Move-order dialog

- Read `arrivalsByPath` from the selected target position, reconstruct paths through the path store, and show frequency plus user outcomes.
- Sort by frequency by default and allow outcome sorting only when samples exist.
- Use semantic dialog behavior: labelled title, focus trap, Escape close, focus restoration, and background inertness.
- Do not describe an outgoing move as if all paths to its target were stored on that edge.

### Perspective

- “User results” displays user win/draw/loss.
- “Board results” displays White/draw/Black.
- Board orientation is a separate preference.
- Labels and colours update together; never rely on colour alone.

### Tests first

- Candidate navigation changes node and board FEN.
- Root/back/breadcrumb navigation through a transposition.
- Two paths reaching one node appear in the dialog with correct independent outcomes.
- User and board result perspectives differ correctly for mixed-colour fixtures.
- Modal keyboard/focus behavior.

### Acceptance

- The primary opening-tree workflow works end-to-end from fetched fixture to transposed target position.
- Statistical labels are unambiguous and include sample sizes.

## 6. Task 4.5 — Stockfish analyzer workspace

### Files

- Create `EngineStatus`, `AnalysisSettings`, `MoveAccuracyGraph`, `EngineAnnotationPanel`, and `PrincipalVariationList`.
- Create analyzer controller integration and browser tests with fake and real engine modes.

### Requirements

- Display engine build, mode, threads, analysis limit, Multi-PV, heuristic version, and active/queued job status.
- Permit analysis strength choices mapped to documented safe limits; do not expose arbitrary resource values without validation.
- Start, pause/cancel, and resume selected-game analysis.
- Show analysed/eligible ply coverage and partial status.
- Navigate board position by selecting a graph point or annotation.
- Display cp or mate evaluation, quality, played move, best move, and PV where available.
- Convert PV UCI moves to legal SAN using the line’s start FEN; if conversion fails, show safe UCI and a diagnostic.
- Do not classify bound or otherwise indeterminate scores as exact move qualities.
- Keep opening-tree functionality usable when the engine is unavailable.

### Accuracy graph

- Represent discontinuities/unknown values explicitly rather than connecting them as zero.
- Orient evaluation consistently and label whose perspective is shown.
- Provide a tabular/text alternative for keyboard and screen-reader users.
- Avoid rendering every point synchronously for extremely long games without memoization/virtualization.

### Tests first

- Capability threaded/single/unavailable states.
- Start, progress, cancel, resume, partial completion, cache hit, and engine crash.
- Selecting a move updates board and PV.
- Mate and unknown values.
- No Chess.com-affiliation or parity claim appears in copy.

### Acceptance

- A real browser fixture produces non-empty engine annotations and PVs.
- Cancelling analysis leaves the UI responsive and all completed cached work reusable.

## 7. Task 4.6 — Responsive shell and accessibility

### Files

- Compose feature containers in `app/page.tsx`.
- Add navigation/tabs and responsive layout primitives.
- Add global error/loading boundaries where appropriate.
- Add axe and multi-viewport Playwright tests.

### Requirements

- Desktop may use board plus side panel; mobile stacks controls, board, and selected workspace without horizontal page overflow.
- Tabs follow WAI-ARIA keyboard patterns or use ordinary navigation semantics.
- Focus moves deliberately after query completion, modal open/close, and terminal analysis errors.
- Status badges include text/icons, not colour alone.
- Respect reduced motion and zoom to 200%.
- Maintain WCAG 2.2 AA target contrast and touch target sizes.
- Lazy-load Stockfish artifacts and analyzer UI so opening-tree users do not pay the full engine startup cost.
- Use Playwright MCP during implementation to inspect the running UI across phone, tablet, desktop, and 200% zoom; exercise keyboard/focus journeys; inspect the accessibility tree, console, and failed network requests; and turn stable defects into committed tests.

### Tests first

- Primary flows at phone, tablet, and desktop viewports.
- Keyboard-only query-to-tree and game-to-analysis flows.
- Axe scan for initial, loaded tree, dialog, loaded analyzer, and error states.
- No serious/critical axe violations, console errors, or unhandled rejections.
- Record Playwright MCP verification against the tested local/preview revision. MCP inspection supplements the committed multi-browser suite and does not replace Firefox/WebKit or axe gates.

### Acceptance

- `app/page.tsx` contains composition and feature callbacks only.
- Fixed-size board and inaccessible modal patterns are absent.
- Production build has documented initial and lazy-loaded bundle sizes.

## 8. Phase 4 exit gate

- A deterministic Playwright flow covers query, ingestion progress, game selection, graph transposition navigation, engine analysis, cancellation, cache reuse, and local-data deletion.
- Real WASM single-thread analysis passes in Chromium; forced fallback/unavailable states pass.
- Firefox and WebKit cover non-engine or supported fallback paths.
- Mobile/desktop layouts pass without horizontal overflow.
- Axe has no serious or critical findings on primary states.
- Playwright MCP primary-journey verification has no unexplained console/page/network error, and every material defect found has a committed regression test or documented disposition.
- No fixed FEN, fixed centipawn value, empty placeholder annotation array, or disconnected filter remains.
- Production MVP preview is deployable and all global CI gates pass.
