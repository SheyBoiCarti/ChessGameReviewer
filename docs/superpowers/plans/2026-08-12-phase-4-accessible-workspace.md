# Phase 4 Accessible Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the complete production-MVP workspace for querying games, navigating real parsed games and opening transpositions, running local Stockfish analysis, managing cached data, and recovering accessibly from partial or failed operations.

**Architecture:** Keep `app/page.tsx` as a synchronous Server Component that renders a single lazy client workspace boundary. A stable `WorkspaceController` owns browser services and race tokens, pure reducers/selectors own serializable state, and focused controls/board/tree/analyzer components consume typed view models. Fixture-backed Playwright routes exercise the same production components without live Chess.com traffic.

**Tech Stack:** Next.js 16.3 App Router, React 19, strict TypeScript, chess.js, IndexedDB, Web Workers, Vitest/Testing Library, Playwright Chromium/Firefox/WebKit, axe-core.

## Global Constraints

- `app/page.tsx` composes feature containers only and contains no archive fetching, PGN parsing, graph mutation, UCI protocol, or analytical formulas.
- Query maximum defaults to 500 and is constrained to 1..5,000; graph horizon defaults to 30 and is constrained to 2..40 plies in UI and worker validation.
- Every long-running browser operation has a job ID, progress, cancellation, and a typed terminal state; stale results never replace current state.
- Opening-tree functionality remains usable when Stockfish is unavailable.
- Partial/limited/cancelled/offline states are visibly distinct from complete data.
- Board orientation, result perspective, and evaluation perspective remain independent.
- No fixed FEN, fixed centipawn value, empty placeholder annotations, disconnected filter, Chess.com parity claim, or copied branded asset may ship.
- Primary flows target WCAG 2.2 AA, keyboard operation, reduced motion, 200% zoom, and no serious/critical axe findings.
- Read installed Next.js 16.3 documentation before framework edits; keep interactive/browser APIs below narrow `'use client'` boundaries and lazy-load analyzer code.

---

### Task 1: Workspace State and Race-Safe Controller

**Files:**

- Create: `features/workspace/types.ts`
- Create: `features/workspace/reducer.ts`
- Create: `features/workspace/createWorkspaceController.ts`
- Create: `features/workspace/useWorkspace.ts`
- Test: `tests/unit/workspace/reducer.test.ts`
- Test: `tests/dom/workspace/workspaceController.test.ts`

**Interfaces:**

- Consumes: `IngestionService.start(query, options)`, `GraphWorkerClient.buildGraph(...)`, Phase 3 engine service, and IndexedDB repositories.
- Produces: `WorkspaceState`, `WorkspaceAction`, `WorkspaceServices`, and a stable controller with `submitQuery`, `cancelIngestion`, `selectGame`, `navigateGraph`, `startAnalysis`, `cancelAnalysis`, `deleteUserData`, `clearAllData`, and `dispose`.

- [ ] **Step 1: Write reducer transition tests**

```ts
it.each(['partial', 'cancelled', 'failed', 'complete'] as const)(
  'keeps %s distinct as an ingestion terminal state',
  (status) =>
    expect(reduceWorkspace(initialWorkspaceState, terminal(status)).ingestion.status).toBe(status)
);

it('resets graph and analysis selection when a new validated query starts', () => {
  const next = reduceWorkspace(loadedState, queryStarted({ token: 2, query }));
  expect(next.graph.snapshot).toBeNull();
  expect(next.selection.gameId).toBeNull();
});
```

- [ ] **Step 2: Run the reducer tests and verify RED**

Run: `npm test -- tests/unit/workspace/reducer.test.ts`
Expected: FAIL because workspace state and reducer modules do not exist.

- [ ] **Step 3: Implement the discriminated state model and pure reducer**

Use explicit `idle | loading | partial | cancelled | empty | failed | complete` ingestion states, `idle | building | limited | failed | complete` graph states, and `probing | unavailable | idle | running | partial | cancelled | failed | complete` engine states. Store only data, selections, preferences, and relevance tokens.

- [ ] **Step 4: Run reducer tests and verify GREEN**

Run: `npm test -- tests/unit/workspace/reducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Write controller race and disposal tests**

```ts
it('ignores a stale first query after a rapid second submission', async () => {
  const controller = createWorkspaceController(deferredServices);
  const first = controller.submitQuery(firstQuery);
  const second = controller.submitQuery(secondQuery);
  deferredServices.resolveIngestion(firstQuery, firstResult);
  deferredServices.resolveIngestion(secondQuery, secondResult);
  await Promise.all([first, second]);
  expect(controller.getState().query.active?.username).toBe(secondQuery.username);
});
```

- [ ] **Step 6: Run controller tests and verify RED**

Run: `npm test -- tests/dom/workspace/workspaceController.test.ts`
Expected: FAIL because the stable controller does not exist.

- [ ] **Step 7: Implement controller creation, subscriptions, race tokens, cancellation, and cleanup**

Create browser resources once inside the controller factory, reject irrelevant completions by token/job ID, abort superseded ingestion/graph/analysis work, and dispose every worker/subscription exactly once.

- [ ] **Step 8: Run Task 1 tests and commit**

Run: `npm test -- tests/unit/workspace/reducer.test.ts tests/dom/workspace/workspaceController.test.ts`
Expected: PASS.

Commit: `feat(workspace): add race-safe application controller`

### Task 2: Query, Progress, Diagnostics, and Local Data

**Files:**

- Create: `components/controls/GameQueryForm.tsx`
- Create: `components/feedback/IngestionProgress.tsx`
- Create: `components/feedback/DiagnosticSummary.tsx`
- Create: `components/feedback/OfflineCacheNotice.tsx`
- Create: `components/controls/LocalDataSettings.tsx`
- Test: `tests/dom/components/GameQueryForm.test.tsx`
- Test: `tests/dom/components/IngestionFeedback.test.tsx`
- Test: `tests/dom/components/LocalDataSettings.test.tsx`

**Interfaces:**

- Consumes: `validateGameQuery`, `GameQuery`, `IngestionProgress`, typed diagnostics, and workspace controller callbacks.
- Produces: an accessible form whose submitted value includes every `GameQuery` field and visible controls for retry/cancel/delete.

- [ ] **Step 1: Write user-event tests for all query properties and validation**

```tsx
await user.type(screen.getByLabelText(/username/i), '  Hikaru  ');
await user.clear(screen.getByLabelText(/maximum games/i));
await user.type(screen.getByLabelText(/maximum games/i), '1200');
await user.click(screen.getByRole('checkbox', { name: /daily/i }));
await user.click(screen.getByRole('button', { name: /load games/i }));
expect(onSubmit).toHaveBeenCalledWith(
  expect.objectContaining({ username: 'hikaru', maxGames: 1200 })
);
```

- [ ] **Step 2: Run component tests and verify RED**

Run: `npm test -- tests/dom/components/GameQueryForm.test.tsx tests/dom/components/IngestionFeedback.test.tsx tests/dom/components/LocalDataSettings.test.tsx`
Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement semantic controls and typed result guidance**

Associate every label/error with its input, state UTC inclusivity, enforce non-empty multi-selects, render progress in `role="status"`, terminal failures in `role="alert"`, and render failed months/retry guidance separately from complete counts.

- [ ] **Step 4: Implement confirmed per-user and clear-all deletion**

Use an explicit confirmation dialog, report counts/failure, and invoke the controller so affected snapshots and selections are invalidated after deletion.

- [ ] **Step 5: Run Task 2 tests and commit**

Run: `npm test -- tests/dom/components/GameQueryForm.test.tsx tests/dom/components/IngestionFeedback.test.tsx tests/dom/components/LocalDataSettings.test.tsx`
Expected: PASS.

Commit: `feat(workspace): add query and local data controls`

### Task 3: Real Game Selector and Accessible Chessboard

**Files:**

- Create: `features/board/position.ts`
- Create: `features/board/evaluationBar.ts`
- Create: `components/board/ChessboardView.tsx`
- Create: `components/board/EvaluationBar.tsx`
- Create: `components/board/MoveHistoryControls.tsx`
- Create: `components/board/Piece.tsx`
- Create: `components/analysis/GameSelector.tsx`
- Test: `tests/unit/board/position.test.ts`
- Test: `tests/unit/board/evaluationBar.test.ts`
- Test: `tests/dom/components/ChessboardView.test.tsx`
- Test: `tests/dom/components/GameSelector.test.tsx`

**Interfaces:**

- Consumes: stored `GameRecord`, `parseGamePgn`, complete FEN history, normalized White-perspective evaluations.
- Produces: immutable sorted game rows, `BoardPosition`, boundary-safe ply navigation, orientation-only square ordering, and cp/mate/unknown evaluation presentation.

- [ ] **Step 1: Write position/evaluation tests for FEN, promotions, both orientations, mate, unknown, and non-finite input**

```ts
expect(readBoard('7k/P7/8/8/8/8/8/K7 w - - 0 1').get('a7')).toEqual({ color: 'w', type: 'p' });
expect(normalizeEvaluationBar({ kind: 'cp', value: Number.POSITIVE_INFINITY })).toEqual({
  kind: 'unknown',
});
```

- [ ] **Step 2: Run unit tests and verify RED**

Run: `npm test -- tests/unit/board/position.test.ts tests/unit/board/evaluationBar.test.ts`
Expected: FAIL because board view-model helpers do not exist.

- [ ] **Step 3: Implement pure board and evaluation helpers**

Validate complete FEN with chess.js, derive 64 squares and highlights, map finite cp monotonically with a bounded logistic curve, preserve mate as text, and never emit NaN/Infinity.

- [ ] **Step 4: Write DOM tests for keyboard history, game selection, responsive markup, and accessible pieces**

```tsx
await user.keyboard('{ArrowRight}');
expect(onPlyChange).toHaveBeenCalledWith(1);
expect(screen.getByRole('grid', { name: /chess board/i })).toHaveAttribute(
  'data-orientation',
  'black'
);
await user.click(screen.getByRole('button', { name: /select game versus carlsen/i }));
expect(onSelect).toHaveBeenCalledWith(game.id);
```

- [ ] **Step 5: Run DOM tests and verify RED**

Run: `npm test -- tests/dom/components/ChessboardView.test.tsx tests/dom/components/GameSelector.test.tsx`
Expected: FAIL because board and selector components do not exist.

- [ ] **Step 6: Implement board, Unicode chess-glyph pieces, navigation, arrows, eval bar, and responsive selector**

Use semantic buttons and a labelled grid, accessible piece names, CSS `aspect-ratio`, stable game IDs, non-mutating sorting/filtering, keyboard selection, and analysis status instead of fabricated accuracy.

- [ ] **Step 7: Run Task 3 tests and commit**

Run: `npm test -- tests/unit/board tests/dom/components/ChessboardView.test.tsx tests/dom/components/GameSelector.test.tsx`
Expected: PASS.

Commit: `feat(board): add real game navigation workspace`

### Task 4: Opening Graph Navigation and Move Orders

**Files:**

- Create: `features/opening-tree/navigation.ts`
- Create: `components/tree/OpeningTreeTable.tsx`
- Create: `components/tree/PathBreadcrumbs.tsx`
- Create: `components/tree/MoveOrderDialog.tsx`
- Test: `tests/unit/opening-tree/navigation.test.ts`
- Test: `tests/dom/components/OpeningTreeTable.test.tsx`
- Test: `tests/dom/components/MoveOrderDialog.test.tsx`

**Interfaces:**

- Consumes: serialized graph snapshot, `selectCandidateMoves`, `selectPositionSummary`, `arrivalsByPath`, and path store entries.
- Produces: selected `positionKey/pathId`, stable sortable candidate rows, breadcrumb/root/back transitions, and independent arrival-path outcome rows.

- [ ] **Step 1: Write transposition navigation and perspective tests**

```ts
const state = navigateCandidate(transpositionFixture, rootSelection, candidate.targetKey);
expect(state.positionKey).toBe(candidate.targetKey);
expect(reconstructBreadcrumbs(transpositionFixture, state.pathId)).toHaveLength(4);
expect(candidateRows(node, 'user')[0]?.resultLabels).toEqual(['Win', 'Draw', 'Loss']);
```

- [ ] **Step 2: Run navigation tests and verify RED**

Run: `npm test -- tests/unit/opening-tree/navigation.test.ts`
Expected: FAIL because navigation helpers do not exist.

- [ ] **Step 3: Implement immutable graph navigation helpers**

Preserve position identity separately from selected path, use target keys for candidate moves, reconstruct breadcrumbs from the path store, and distinguish terminal/horizon/no-data/limited reasons.

- [ ] **Step 4: Write component and focus-management tests**

```tsx
await user.click(screen.getByRole('button', { name: /move orders/i }));
expect(screen.getByRole('dialog', { name: /move orders/i })).toHaveFocus();
await user.keyboard('{Escape}');
expect(trigger).toHaveFocus();
```

- [ ] **Step 5: Run component tests and verify RED**

Run: `npm test -- tests/dom/components/OpeningTreeTable.test.tsx tests/dom/components/MoveOrderDialog.test.tsx`
Expected: FAIL because tree components do not exist.

- [ ] **Step 6: Implement semantic table, breadcrumbs, persistent limited notice, and modal focus trap**

Announce sorting, include sample size, label perspective in text and colour, set background inert while open, trap Tab, close on Escape, and restore trigger focus.

- [ ] **Step 7: Run Task 4 tests and commit**

Run: `npm test -- tests/unit/opening-tree/navigation.test.ts tests/dom/components/OpeningTreeTable.test.tsx tests/dom/components/MoveOrderDialog.test.tsx`
Expected: PASS.

Commit: `feat(opening-tree): add transposition workspace navigation`

### Task 5: Lazy Stockfish Analyzer Workspace

**Files:**

- Create: `features/stockfish-analysis/presentation.ts`
- Create: `components/analysis/EngineStatus.tsx`
- Create: `components/analysis/AnalysisSettings.tsx`
- Create: `components/analysis/MoveAccuracyGraph.tsx`
- Create: `components/analysis/EngineAnnotationPanel.tsx`
- Create: `components/analysis/PrincipalVariationList.tsx`
- Create: `components/analysis/AnalyzerWorkspace.tsx`
- Test: `tests/unit/stockfish-analysis/presentation.test.ts`
- Test: `tests/dom/components/AnalyzerWorkspace.test.tsx`

**Interfaces:**

- Consumes: Phase 3 `EngineCapability`, `AnalysisResult`, exact/bound scores, annotations, PV UCI, settings, progress, and controller actions.
- Produces: safe strength presets, engine/build/resource status, coverage, pause/cancel/resume controls, discontinuous graph plus table, annotation navigation, and SAN-or-safe-UCI PV display.

- [ ] **Step 1: Write presentation tests for safe limits, mate/unknown/bounds, discontinuities, and PV conversion fallback**

```ts
expect(
  toGraphPoints([
    { ply: 1, evaluation: null },
    { ply: 2, evaluation: cp(32) },
  ])[0]?.value
).toBeNull();
expect(toQualityLabel(boundScore)).toBe('Indeterminate');
expect(convertPvToSan(startFen, ['e2e4', 'not-a-move']).diagnostic).toMatch(/uci/i);
```

- [ ] **Step 2: Run presentation tests and verify RED**

Run: `npm test -- tests/unit/stockfish-analysis/presentation.test.ts`
Expected: FAIL because analyzer presentation helpers do not exist.

- [ ] **Step 3: Implement safe analyzer presentation helpers**

Map named presets to validated engine limits, preserve gaps as null, format mate separately, refuse exact quality for bounds, convert each legal PV move from its line start FEN, and fall back to escaped text UCI with a diagnostic.

- [ ] **Step 4: Write analyzer interaction tests**

Cover threaded/single/unavailable capability, start/progress/cancel/resume/partial/cache-hit/crash UI, point/annotation navigation, and absence of affiliation/parity claims.

- [ ] **Step 5: Run interaction tests and verify RED**

Run: `npm test -- tests/dom/components/AnalyzerWorkspace.test.tsx`
Expected: FAIL because analyzer components do not exist.

- [ ] **Step 6: Implement analyzer components and lazy boundary**

Render build, mode, threads, limit, Multi-PV, heuristic, coverage, queue status, text alternatives, and user-visible failures. Export `AnalyzerWorkspace` for `next/dynamic` loading only when the analyzer tab is selected.

- [ ] **Step 7: Run Task 5 tests and commit**

Run: `npm test -- tests/unit/stockfish-analysis/presentation.test.ts tests/dom/components/AnalyzerWorkspace.test.tsx`
Expected: PASS.

Commit: `feat(analysis): add lazy Stockfish analyzer workspace`

### Task 6: Responsive Shell, Error Boundaries, and End-to-End Fixtures

**Files:**

- Create: `components/workspace/ChessWorkspace.tsx`
- Create: `components/workspace/WorkspaceTabs.tsx`
- Create: `app/error.tsx`
- Create: `app/loading.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Test: `tests/dom/components/WorkspaceTabs.test.tsx`
- Test: `tests/e2e/workspace.spec.ts`
- Test: `tests/e2e/workspace-accessibility.spec.ts`
- Test: `tests/e2e/workspace-responsive.spec.ts`

**Interfaces:**

- Consumes: stable workspace hook/controller and focused Phase 4 components.
- Produces: server composition page, client workspace, ordinary-navigation or WAI-ARIA tabs, app recovery UI, fixture-mode deterministic journeys, and multi-browser/viewport gates.

- [ ] **Step 1: Write shell/tab/error unit tests and verify RED**

Run: `npm test -- tests/dom/components/WorkspaceTabs.test.tsx`
Expected: FAIL because shell components do not exist.

- [ ] **Step 2: Implement the Server/Client composition boundary**

Keep static title/disclaimer/privacy copy in the Server Component, render the client workspace beneath it, add `error.tsx` using Next.js 16.3 stable `retry`, and add loading/status UI.

- [ ] **Step 3: Implement responsive CSS and accessible tabs/focus policy**

Use a board-plus-panel desktop grid and stacked mobile layout with `min-width: 0`, no horizontal page overflow, visible focus, 44px touch targets, AA colours, reduced-motion media query, and deliberate focus after completion/dialog/error transitions.

- [ ] **Step 4: Add Firefox/WebKit and axe dependencies/configuration**

Add `@axe-core/playwright`, configure desktop Chromium/Firefox/WebKit plus named mobile/tablet projects for targeted tests, and retain a production-build web server.

- [ ] **Step 5: Write deterministic fixture E2E flow and verify RED**

The committed flow must submit every filter, observe progress, select a game, reach one transposed graph node through two move orders, run non-empty real single-thread engine analysis in Chromium, cancel/resume from cache, force engine-unavailable state, and delete local data.

Run: `npx playwright test tests/e2e/workspace.spec.ts --project=chromium`
Expected: FAIL before the integrated fixture journey exists.

- [ ] **Step 6: Implement fixture-backed service injection without production hard-coded analytics**

Use a test-only query parameter or route-intercepted fixture transport to provide deterministic API responses while exercising production parsing, graph worker, persistence, and engine paths. Never branch analytical formulas or UI results on fixture mode.

- [ ] **Step 7: Add axe, keyboard, overflow, zoom, and viewport assertions**

Scan initial/tree/dialog/analyzer/error states; assert no serious/critical findings, no console errors/unhandled rejections, no horizontal overflow at phone/tablet/desktop and 200% zoom, and keyboard-only query-to-tree/game-to-analysis operation.

- [ ] **Step 8: Run Task 6 tests and commit**

Run: `npm test -- tests/dom/components/WorkspaceTabs.test.tsx && npx playwright test tests/e2e/workspace.spec.ts tests/e2e/workspace-accessibility.spec.ts tests/e2e/workspace-responsive.spec.ts`
Expected: PASS on the configured supported project matrix.

Commit: `feat(ui): compose accessible responsive analysis workspace`

### Task 7: Phase 4 Exit-Gate Audit and Verification Record

**Files:**

- Create: `docs/verification/phase-4-local-verification.md`
- Modify tests or production files only when a gate exposes a defect.

**Interfaces:**

- Consumes: authoritative Phase 4 plan sections 1–8 and global CI gates.
- Produces: requirement-by-requirement evidence, bundle sizes, tested revision, browser matrix, MCP disposition, and clean verification output.

- [ ] **Step 1: Audit prohibited placeholders and disconnected behavior**

Run: `rg -n "fixed FEN|fixed centipawn|placeholder annotation|Chess\.com accuracy|parity" app components features lib`
Expected: no prohibited production implementation.

- [ ] **Step 2: Run complete local quality gates**

Run: `npm run format:check && npm run lint && npm run typecheck && npm run test:coverage && npm run build && npm run test:e2e`
Expected: every command exits 0, coverage meets configured thresholds, and all supported browser projects pass.

- [ ] **Step 3: Inspect the production build interactively**

Run the built app and inspect phone, tablet, desktop, 200% zoom, keyboard/focus journeys, accessibility tree, browser console, failed network requests, real worker/WASM startup, cancellation, cache reuse, fallback UI, and data deletion. Record any unavailable Playwright MCP capability explicitly; automated gates remain mandatory.

- [ ] **Step 4: Record bundle sizes and gate evidence**

Copy the initial-route and lazy analyzer chunk sizes from the production build output, plus test counts and browser matrix, into `docs/verification/phase-4-local-verification.md`.

- [ ] **Step 5: Re-run full verification after any fixes and commit**

Run: `npm run verify`
Expected: exit 0 with no failed test, lint error, type error, build failure, serious/critical axe result, console error, or unexplained network error.

Commit: `docs: record phase 4 verification evidence`
