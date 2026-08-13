# Premium Board-First Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a premium dark, board-first workspace that preserves all Phase 4 functionality and accessibility while making the chessboard the primary desktop experience.

**Architecture:** Keep the existing workspace controller and service boundaries unchanged. Add small presentational shell, disclosure, drawer, and board-asset components, then recompose `ChessWorkspace` around a board focal region, utility rail, and contextual panel. Centralize visual tokens and responsive behavior in global CSS; preserve real status/data components and their existing public props.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict mode, CSS, Vitest + Testing Library, Playwright, axe-core/playwright.

## Global Constraints

- Before writing implementation code, read `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`, `05-server-and-client-components.md`, `11-css.md`, and `02-guides/lazy-loading.md`; heed current Next.js 16 deprecations.
- Do not alter ingestion APIs, IndexedDB formats, graph metrics, engine scoring, engine services, or workspace race-condition behavior.
- `app/page.tsx` remains a composition boundary; presentational components receive props/callbacks and do not instantiate domain services or parse data independently.
- Dark is the default visual language; retain functional system and light theme preferences with WCAG 2.2 AA contrast.
- Preserve WAI-ARIA tabs, board grid labels and keyboard navigation, live regions, error alerts, modal focus behavior, and reduced-motion support.
- Use repository-owned or compatibly licensed local SVG piece assets; do not depend on remote assets or copy Chess.com branding.
- Use TDD for every task. Do not commit changes unless the user explicitly asks; substitute the usual commit checkpoint with a clean status/diff review.

---

## File structure

- `components/workspace/AppTopBar.tsx`: compact identity, local-first indicator, and disclosure trigger.
- `components/workspace/ProductInformation.tsx`: accessible privacy/unaffiliated disclosure dialog.
- `components/workspace/UtilityRail.tsx`: shared desktop rail/mobile drawer container and focus management.
- `components/workspace/WorkspaceLayout.tsx`: board-first layout primitive that composes rail, board focal region, and contextual panel.
- `components/workspace/ChessWorkspace.tsx`: adapts existing controller state into the new shell without changing service ownership.
- `components/board/ChessPieceSvg.tsx`: maps a board piece to a local SVG asset while preserving its accessible label.
- `public/chess-pieces/*.svg`: six white and six black local chess-piece assets with verified compatible licensing attribution in `public/chess-pieces/LICENSE.md`.
- `components/board/ChessboardView.tsx`: coordinates, local pieces, and existing board behavior.
- `components/controls/GameQueryForm.tsx`: compact filter disclosure and semantic chip styling hooks.
- `components/analysis/GameSelector.tsx`: data table desktop and compact-card mobile presentation hooks.
- `app/page.tsx`, `app/layout.tsx`, `app/globals.css`: shell copy/metadata and complete token/layout styling.
- `tests/dom/components/{AppTopBar,ProductInformation,UtilityRail,GameQueryForm,ChessboardView}.test.tsx`: focused behavior and semantics.
- `tests/e2e/workspace-{responsive,accessibility,visual}.spec.ts`: multi-viewport behavior, axe states, and stable screenshots.

## Task 1: Establish the visual token system and application shell

**Files:**
- Modify: `app/globals.css`
- Modify: `app/page.tsx`
- Modify: `app/layout.tsx`
- Test: `tests/e2e/workspace-responsive.spec.ts`

**Interfaces:**
- Consumes: existing `.shell-container`, theme `data-theme`, and workspace mount point.
- Produces: semantic CSS tokens and `.app-shell`, `.app-topbar`, `.workspace-canvas`, `.surface`, and button-variant classes used by all later components.

- [ ] **Step 1: Read the required Next.js 16 documentation and capture constraints in the implementation notes.**

Read the four exact files listed in Global Constraints. Confirm that `app/page.tsx` can continue rendering the client workspace boundary and that global CSS import remains in `app/layout.tsx`.

- [ ] **Step 2: Write a failing responsive assertion for the new shell.**

In `tests/e2e/workspace-responsive.spec.ts`, assert the old permanent notice cards are absent from the main flow, the named application banner exists, and document width overflow remains at most one pixel.

```ts
await expect(page.getByRole('banner', { name: /local chess game reviewer/i })).toBeVisible();
await expect(page.getByTestId('unaffiliated-notice')).toBeHidden();
expect(await overflow(page)).toBeLessThanOrEqual(1);
```

- [ ] **Step 3: Run the focused test to verify it fails.**

Run: `npx playwright test tests/e2e/workspace-responsive.spec.ts --project=chromium`

Expected: FAIL because the current page has no application banner and displays the notice card inline.

- [ ] **Step 4: Implement the shell and semantic visual tokens.**

Replace the current broad `:root` palette with semantic variables for canvas, elevated/raised surfaces, primary/muted text, borders, gold primary accent, teal success, amber warning, red danger, shadow, radii, and spacing. Keep light/system overrides as complete semantic-token overrides. Add global typography, tabular-number utility, 44px minimum control sizing, visible focus styling, and reduced-motion overrides.

Change `app/page.tsx` to a minimal shell that renders a top-bar slot and `ClientWorkspaceLoader`; move disclosure content into the component created in Task 2. Update metadata title to “Local Chess Game Reviewer”. Do not remove current disclosure text—move it intact.

- [ ] **Step 5: Run format, lint, typecheck, and focused responsive test.**

Run: `npm run format:check && npm run lint && npm run typecheck && npx playwright test tests/e2e/workspace-responsive.spec.ts --project=chromium`

Expected: PASS.

- [ ] **Step 6: Review the staged diff without committing.**

Run: `git diff --check; git diff -- app/globals.css app/page.tsx app/layout.tsx tests/e2e/workspace-responsive.spec.ts; git status --short`

Expected: only intentional Task 1 changes; do not commit.

## Task 2: Add accessible top-bar disclosure and responsive utility rail

**Files:**
- Create: `components/workspace/AppTopBar.tsx`
- Create: `components/workspace/ProductInformation.tsx`
- Create: `components/workspace/UtilityRail.tsx`
- Create: `tests/dom/components/AppTopBar.test.tsx`
- Create: `tests/dom/components/UtilityRail.test.tsx`
- Modify: `components/workspace/ChessWorkspace.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces `AppTopBar({ onOpenFilters, children? })`, `ProductInformation({ open, onClose, returnFocusRef })`, and `UtilityRail({ title, open, onOpenChange, children })`.
- `ChessWorkspace` owns `filtersOpen: boolean`, passes its query/status children to `UtilityRail`, and does not move controller actions into the new components.

- [ ] **Step 1: Write failing DOM tests for disclosure and rail focus behavior.**

Test that the information trigger opens a labelled dialog containing both existing disclosure messages, Escape closes and restores trigger focus, the mobile filter trigger opens the rail, and the rail closes/restores focus.

```tsx
await user.click(screen.getByRole('button', { name: /about local data and affiliation/i }));
expect(screen.getByRole('dialog', { name: /about this app/i })).toHaveTextContent(/unaffiliated/i);
await user.keyboard('{Escape}');
expect(trigger).toHaveFocus();
```

- [ ] **Step 2: Run those tests and verify they fail.**

Run: `npx vitest run --project dom tests/dom/components/AppTopBar.test.tsx tests/dom/components/UtilityRail.test.tsx`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement the components with real modal semantics.**

Use a button plus `role="dialog"`, `aria-modal="true"`, labelled heading, Escape handler, focus-first-on-open, focus restoration, and background inertness for `ProductInformation`. Use the same modal pattern for mobile `UtilityRail`; on desktop render it as an `aside`. Ensure its close control has an explicit accessible name. Keep `data-testid="unaffiliated-notice"` and `data-testid="privacy-summary"` on the moved disclosure sections.

- [ ] **Step 4: Recompose query/progress/diagnostic/cache content into `UtilityRail`.**

In `ChessWorkspace`, retain `GameQueryForm`, `IngestionProgress`, `DiagnosticSummary`, and `OfflineCacheNotice` props/callbacks exactly. Open the rail initially before successful data exists; when ingestion transitions from loading to complete/partial/empty, close it only on desktop-capable layouts without trapping mobile users. Keep the existing loaded-region focus behavior.

- [ ] **Step 5: Style top bar, desktop rail, and mobile drawer.**

Use CSS grid at desktop and a fixed backdrop/drawer below the tablet breakpoint. Give the rail independent vertical scrolling and prevent body horizontal overflow. Style rail trigger as an icon/text action with a 44px target.

- [ ] **Step 6: Run focused tests and inspect the interaction manually.**

Run: `npx vitest run --project dom tests/dom/components/AppTopBar.test.tsx tests/dom/components/UtilityRail.test.tsx && npm run typecheck`

Expected: PASS. Then use `npm run dev` and test open/close with mouse and keyboard at desktop and mobile viewport.

- [ ] **Step 7: Review diff without committing.**

Run: `git diff --check; git status --short`

Expected: intentional Task 2 changes only; do not commit.

## Task 3: Recompose the workspace around a persistent board focal region

**Files:**
- Create: `components/workspace/WorkspaceLayout.tsx`
- Modify: `components/workspace/ChessWorkspace.tsx`
- Modify: `components/workspace/WorkspaceTabs.tsx`
- Modify: `components/board/EvaluationBar.tsx`
- Modify: `app/globals.css`
- Test: `tests/dom/components/WorkspaceTabs.test.tsx`
- Test: `tests/e2e/workspace.spec.ts`

**Interfaces:**
- Produces `WorkspaceLayout({ utility, board, tabs, panel }: { utility: ReactNode; board: ReactNode; tabs: ReactNode; panel: ReactNode })`.
- Board state continues to be calculated in `ChessWorkspace` through `boardFen`, selected game, graph navigation, and selection ply.

- [ ] **Step 1: Write failing tests proving panel switches do not replace the focal board.**

Extend the workspace flow after loading fixture games: select a game, capture the chess grid locator, switch Games → Opening → Analysis, and assert the same labelled grid remains visible while contextual headings change.

```ts
const board = page.getByRole('grid', { name: 'Chess board' });
await expect(board).toBeVisible();
await page.getByRole('tab', { name: 'Opening tree' }).click();
await expect(board).toBeVisible();
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run: `npx playwright test tests/e2e/workspace.spec.ts --project=chromium`

Expected: FAIL because current tab markup replaces the entire board workspace.

- [ ] **Step 3: Implement `WorkspaceLayout` and move board composition out of tab-specific branches.**

Calculate the board panel once in `ChessWorkspace`. Render it in the focal region when a valid game or opening position exists; render a designed recoverable empty state otherwise. Render `EvaluationBar` alongside the focal board whenever an analysis annotation is selected, independent of whether the Analysis tab is currently open. Keep the opening position board behavior and no-op opening-board ply change behavior intact.

- [ ] **Step 4: Keep contextual tabs semantically identical while refining presentation.**

Preserve `role="tablist"`, each tab’s `aria-selected`, `aria-controls`, roving `tabIndex`, and Arrow/Home/End behavior. Add an optional visual icon span marked `aria-hidden="true"`; do not make icons the sole label.

- [ ] **Step 5: Add height-aware board and panel CSS.**

At desktop define grid columns for rail, `minmax(20rem, 1fr)` board focal region, and bounded contextual panel. Set board frame inline size via `min(100%, calc(100dvh - var(--workspace-chrome-height)))` with a conservative min/max, and keep `aspect-ratio: 1`. At tablet and phone collapse to a single column and remove panel/rail fixed heights.

- [ ] **Step 6: Run behavior tests and manual viewport verification.**

Run: `npx vitest run --project dom tests/dom/components/WorkspaceTabs.test.tsx && npx playwright test tests/e2e/workspace.spec.ts tests/e2e/workspace-responsive.spec.ts --project=chromium`

Expected: PASS. Manually inspect 1366×768, 1024×768, and 390×844; the board is visually dominant at desktop and not clipped at smaller sizes.

- [ ] **Step 7: Review diff without committing.**

Run: `git diff --check; git status --short`

Expected: intentional Task 3 changes only; do not commit.

## Task 4: Upgrade the board with local piece assets, coordinates, and refined highlights

**Files:**
- Create: `public/chess-pieces/{w,b}{p,n,b,r,q,k}.svg`
- Create: `public/chess-pieces/LICENSE.md`
- Create: `components/board/ChessPieceSvg.tsx`
- Modify: `components/board/Piece.tsx`
- Modify: `components/board/ChessboardView.tsx`
- Modify: `app/globals.css`
- Modify: `tests/dom/components/ChessboardView.test.tsx`

**Interfaces:**
- `ChessPieceSvg({ piece, square }: { piece: BoardPiece; square: string }): JSX.Element` renders a local asset and preserves `aria-label="${color} ${type} on ${square}"`.
- `ChessboardView` retains all current props and keyboard/navigation behavior.

- [ ] **Step 1: Add failing tests for local asset rendering and coordinate labels.**

Assert a white pawn exposes its existing accessible label and has `src` ending in `/chess-pieces/wp.svg`; assert white orientation exposes files/ranks in the expected first/last visual rows and black orientation reverses them without changing the 64 gridcells.

```tsx
expect(screen.getByLabelText(/white pawn on a7/i)).toHaveAttribute('src', '/chess-pieces/wp.svg');
expect(screen.getByText('a', { selector: '.board-file-label' })).toBeInTheDocument();
```

- [ ] **Step 2: Run the focused test and verify it fails.**

Run: `npx vitest run --project dom tests/dom/components/ChessboardView.test.tsx`

Expected: FAIL because pieces are Unicode spans and no coordinate labels exist.

- [ ] **Step 3: Add compatible local assets and license record.**

Add twelve static SVG assets from a verified compatible source or author original simple silhouettes. `LICENSE.md` names the source/author, license, retrieval date, modifications, and license text/link. Confirm CSP allows same-origin image usage without changing `next.config.ts`.

- [ ] **Step 4: Replace glyph rendering and add non-interfering coordinates.**

Render `<img>` or inline local SVG through `ChessPieceSvg`; its accessible name must remain on exactly one element. Add `aria-hidden="true"` coordinate spans visually within edge squares. Do not alter square order, roles, FEN parsing, last-move selection, PV SVG, or keyboard handling.

- [ ] **Step 5: Apply premium board styling.**

Create muted slate/stone square tokens, board-frame elevation, coordinate contrast, gold translucent move highlight, focused selected-square ring, responsive piece sizing based on board width, and a visually integrated evaluation bar. Do not use undeclared container-query units.

- [ ] **Step 6: Run focused board tests and build.**

Run: `npx vitest run --project dom tests/dom/components/ChessboardView.test.tsx && npm run build`

Expected: PASS; build serves assets with no CSP/type failure.

- [ ] **Step 7: Review assets and diff without committing.**

Run: `git diff --check; git status --short`

Expected: all twelve assets and license record are present with intentional component/style/test changes; do not commit.

## Task 5: Refine query controls, contextual data panels, and state presentation

**Files:**
- Modify: `components/controls/GameQueryForm.tsx`
- Modify: `components/analysis/GameSelector.tsx`
- Modify: `components/tree/OpeningTreeTable.tsx`
- Modify: `components/analysis/AnalyzerWorkspace.tsx`
- Modify: `components/feedback/{IngestionProgress,DiagnosticSummary,OfflineCacheNotice}.tsx`
- Modify: `components/controls/LocalDataSettings.tsx`
- Modify: `app/globals.css`
- Modify: `tests/dom/components/{GameQueryForm,GameSelector,IngestionFeedback,AnalyzerWorkspace,LocalDataSettings}.test.tsx`

**Interfaces:**
- Preserve all existing component props and callbacks. Add only optional presentational props if absolutely necessary.
- `GameQueryForm` retains native checkbox inputs and the existing `validateGameQuery` submission path.

- [ ] **Step 1: Write failing semantic tests for compact filters and status layouts.**

Test that advanced filters can collapse/expand, checked time/color labels still contain native checked inputs, all existing validation IDs remain associated, and partial/offline/engine-unavailable statuses show text plus non-colour visible status labels.

```tsx
await user.click(screen.getByRole('button', { name: /game filters/i }));
expect(screen.getByRole('checkbox', { name: 'Rapid' })).toBeChecked();
expect(screen.getByText(/partial/i)).toBeVisible();
```

- [ ] **Step 2: Run focused component tests and verify they fail.**

Run: `npx vitest run --project dom tests/dom/components/GameQueryForm.test.tsx tests/dom/components/IngestionFeedback.test.tsx tests/dom/components/AnalyzerWorkspace.test.tsx`

Expected: FAIL because no filter disclosure/status-badge markup exists.

- [ ] **Step 3: Implement progressive query disclosure without changing validation.**

Leave username/date immediately visible. Put max games, time classes, colour, rated status, and opening horizon in a labelled `details`/button-controlled region whose current selected summary is visible when closed. Keep every native input in the DOM when required for reliable form state; use CSS/`hidden` only when semantics and test behavior remain correct. Apply chip classes to checkbox labels, not custom div controls.

- [ ] **Step 4: Apply contextual panel and status primitives.**

Style game table headings/rows, selected state, compact game cards, opening candidate table, analyzer sections, local-data confirmation, diagnostics, progress, offline cache, partial/failed states, and empty states using the shared surface/status classes. Retain the current wording that distinguishes partial data from complete data and preserve action callbacks.

- [ ] **Step 5: Test desktop and compact game presentation.**

Keep the existing compact-layout hook or replace it with a behaviorally equivalent media-query hook. Ensure screen-reader labels and stable game ID selection are unchanged; no accuracy estimate is fabricated before analysis.

- [ ] **Step 6: Run focused DOM suite.**

Run: `npx vitest run --project dom tests/dom/components/GameQueryForm.test.tsx tests/dom/components/GameSelector.test.tsx tests/dom/components/IngestionFeedback.test.tsx tests/dom/components/AnalyzerWorkspace.test.tsx tests/dom/components/LocalDataSettings.test.tsx`

Expected: PASS.

- [ ] **Step 7: Review diff without committing.**

Run: `git diff --check; git status --short`

Expected: intentional Task 5 changes only; do not commit.

## Task 6: Extend multi-viewport accessibility and visual-regression coverage

**Files:**
- Modify: `tests/e2e/workspace-responsive.spec.ts`
- Modify: `tests/e2e/workspace-accessibility.spec.ts`
- Modify: `tests/e2e/workspace.spec.ts`
- Create: `tests/e2e/workspace-visual.spec.ts`
- Modify: `playwright.config.ts` only if screenshot configuration is needed

**Interfaces:**
- Uses existing `installWorkspaceFixtures` and `loadFixtureGames` helpers.
- Produces stable screenshot baselines named `initial-query`, `loaded-board`, `opening-tree`, `analyzer-unavailable`, and `mobile-workspace`.

- [ ] **Step 1: Write viewport-flow tests before final CSS adjustments.**

Cover phone (390×844), tablet (768×1024), small laptop (1024×768), and desktop (1440×900). At each, load fixture games, select a game, assert no document overflow, and verify the board/controls remain visible. On phone/tablet open and close the filter drawer and assert focus restoration.

- [ ] **Step 2: Add axe states that the current suite misses.**

Run axe after initial query, loaded games, opening tree, analysis-unavailable, utility drawer, product information dialog, move-order dialog, and an error/partial fixture state. Continue filtering only `serious` and `critical` and assert an empty result.

- [ ] **Step 3: Add stable screenshot tests.**

Use fixture data only, wait for fonts/layout, and mask dynamic timestamps/progress where needed. Capture the five named states with deterministic viewport and theme. Do not screenshot a live Stockfish completion state.

```ts
await expect(page).toHaveScreenshot('loaded-board.png', { fullPage: true, animations: 'disabled' });
```

- [ ] **Step 4: Run new tests to expose layout/accessibility defects.**

Run: `npx playwright test tests/e2e/workspace-responsive.spec.ts tests/e2e/workspace-accessibility.spec.ts tests/e2e/workspace-visual.spec.ts --project=chromium`

Expected: initially fail until any focus, overflow, snapshot, or contrast defects are corrected.

- [ ] **Step 5: Correct only defects exposed by these tests.**

Make targeted component/CSS changes. Do not weaken assertions, exclude axe rules, or mask the board/primary controls to make a test pass.

- [ ] **Step 6: Run cross-browser and mobile verification.**

Run: `npx playwright test tests/e2e/workspace.spec.ts tests/e2e/workspace-responsive.spec.ts tests/e2e/workspace-accessibility.spec.ts --project=chromium --project=firefox --project=webkit --project=mobile-chromium --project=tablet-chromium`

Expected: PASS on supported non-engine paths; keep Chromium-only engine execution as already defined.

- [ ] **Step 7: Review test artifacts and diff without committing.**

Inspect Playwright report/screenshots, then run: `git diff --check; git status --short`

Expected: intentional baselines and test changes only; do not commit.

## Task 7: Full regression verification and delivery review

**Files:**
- Modify only if verification finds a concrete defect: files from Tasks 1–6.

**Interfaces:**
- Consumes the complete redesigned workspace and all existing Phase 4 services/tests.
- Produces verified evidence that visual changes did not regress product behavior.

- [ ] **Step 1: Run formatter, lint, typecheck, and all unit/DOM tests.**

Run: `npm run format:check && npm run lint && npm run typecheck && npm run test`

Expected: PASS.

- [ ] **Step 2: Run production build and complete end-to-end suite.**

Run: `npm run build && npm run test:e2e`

Expected: PASS, including existing query → graph → engine → local deletion flow.

- [ ] **Step 3: Perform manual acceptance walkthrough.**

At desktop, confirm the board is the largest persistent workspace element after data load and the utility rail collapses. At tablet/phone, confirm drawer, stacking, touch targets, and no horizontal page overflow. Keyboard-test all high-risk flows listed in the design spec. Toggle light/system/dark and reduced motion.

- [ ] **Step 4: Check implementation against every acceptance criterion.**

Create a short delivery note in the final response mapping each of the ten criteria in `docs/superpowers/specs/2026-08-13-premium-board-first-frontend-redesign-design.md` to component/test evidence. If any item lacks evidence, fix it before declaring completion.

- [ ] **Step 5: Final uncommitted change review.**

Run: `git diff --check; git status --short; git diff --stat`

Expected: clean whitespace checks and a reviewable set of uncommitted changes. Do not commit unless the user explicitly requests it.
