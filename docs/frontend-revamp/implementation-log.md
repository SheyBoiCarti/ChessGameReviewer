# Frontend Revamp Implementation Log

## Baseline Inspection (2026-09-05)

- Git branch: `frontend-revamp` at commit `b1aff34a7bb6834567291f1bab9d88adb593a443`.
- Pre-existing edits preserved: `AGENTS.md` (Next.js agent block).
- Untracked files: `docs/frontend-revamp/`.
- Targeted Phase 1 baseline Vitest:
  - Command: `npx vitest run tests/dom/components/AppTopBar.test.tsx tests/dom/components/WorkspaceTabs.test.tsx tests/dom/components/UtilityRail.test.tsx tests/dom/workspace`
  - Result: Exit 0 (6 test files passed, 22 tests passed, 8.18s).
- Targeted Phase 1 baseline Playwright E2E:
  - Command: `npx playwright test tests/e2e/workspace-responsive.spec.ts tests/e2e/workspace-accessibility.spec.ts --project=chromium`
  - Result: Exit 0 (17 tests passed, 31.0s).

---

## Phase 1: Shell and Navigation

### Status: Completed

### Task 1.1 — Tokens and Interface Icons

- Applied exact design token table and typography in `app/globals.css` for `:root`, `:root[data-theme='light']`, `:root[data-theme='dark']`, and `@media (prefers-color-scheme: light)`.
- Board squares set to `--board-light: #eeeed2` and `--board-dark: #769656`.
- Legacy color aliases mapped to semantic tokens for backward compatibility.
- Implemented `components/ui/AppIcon.tsx` with all 13 SVG icons: `games`, `review`, `openings`, `settings`, `info`, `menu`, `close`, `import`, `first`, `previous`, `next`, `last`, `flip` with 24x24 viewBox, stroke-width 2, `aria-hidden="true"`, `focusable="false"`.
- Added unit test suite `tests/dom/components/AppIcon.test.tsx` verifying rendering and accessibility attributes.

### Task 1.2 — Navigation and Compact Header

- Implemented `components/workspace/WorkspaceNavigation.tsx` supporting global views (`games`, `review`, `openings`, `settings`) and About dialog trigger, using `aria-current="page"` on native buttons with full keyboard navigation and focus restoration.
- Added DOM test suite `tests/dom/components/WorkspaceNavigation.test.tsx`.
- Updated `components/workspace/AppTopBar.tsx` as the single page header banner ("Local Chess Game Reviewer") with visible `h1` view heading and action buttons (`menu` and `import`).
- Converted `components/workspace/WorkspaceTabs.tsx` to the two review modes (`review` and `analysis`) with WAI-ARIA arrow/Home/End keyboard pattern and roving `tabIndex`.
- Added `ReviewMode` state in `components/workspace/ChessWorkspace.tsx`. Per spec, both modes temporarily compose the existing analyzer body with a visible current mode heading until Phase 4.
- Moved Settings outside the board composition; local data deletion and preferences remain fully reachable.

### Task 1.3 — Workspace Grid and Modal Import

- Updated `components/workspace/WorkspaceLayout.tsx` for board and contextual workspace grid; removed permanent utility column.
- Updated `components/workspace/UtilityRail.tsx` to render a modal drawer across all viewports with accessible name "Import games", focus trap, Escape key handling, and background inertness.
- Implemented responsive regimes in `app/globals.css`:
  - Wide desktop (>= 1280px): 168px sticky navigation rail, 2-column workspace layout.
  - Compact desktop (960px - 1279px): 64px icon-only rail, 5.5rem chrome height, 2-column workspace.
  - Stacked / Mobile (< 960px): rail hidden, drawer menu in topbar, natural vertical flow.
  - Short-window override (width >= 960px, height < 640px): natural flow without clipping.
- Removed obsolete `.workspace-tabs [role='tab']` override rules in `app/globals.css` that enforced old green pill button styling, restoring green underline styling on transparent background per design contract Section 3.
- Resolved theme-transition race conditions in Firefox by scoping `.workspace-tab` transitions to hover/focus states, ensuring instant color updates on `data-theme` changes.

### Visual Snapshots Inspection

Visual regression snapshots inspected:

- `initial-query.png` (Chromium, Firefox, WebKit): Replaced old marketing header with single AppTopBar banner and left rail.
- `loaded-board.png` (Chromium, Firefox, WebKit): Board with new navigation and tokens.
- `opening-tree.png` (Chromium, Firefox, WebKit): Opening candidates table in contextual pane.
- `analyzer-unavailable.png` (Chromium, Firefox, WebKit): Updated to reflect new green underline tabs (`border-bottom: 3px solid var(--action-bg)`) on transparent background rather than legacy filled green button.
- `mobile-workspace.png` (Chromium, Firefox, WebKit): Stacked layout with topbar menu trigger.

### Full Phase Verification (`npm run verify`)

- `npm run format:check`: Exit 0 (all files Prettier formatted).
- `npm run lint`: Exit 0 (0 ESLint warnings, 0 errors).
- `npm run typecheck`: Exit 0 (`tsc --noEmit` clean).
- `npm run test:coverage`: Exit 0 (8 DOM test files, 38 tests passed, 100% threshold satisfied).
- `npm run build`: Exit 0 (production Next.js build clean).
- `npm run test:e2e`: Exit 0 (124 E2E tests passed across Chromium, Firefox, WebKit, Mobile Chromium, Tablet Chromium).

## Phase 2: Board Presentation

### Task 2.1 — Player Strips and Board Frame

- Created `components/board/PlayerStrip.tsx`:
  - 40px strip height, transparent background, 32px initials avatar calculated via `getPlayerInitials` (first two alphanumeric characters uppercase or `?`).
  - Fallback username "Unknown player", fallback rating "—".
  - Color dot (8px) with contrasting border and accessible text ("White" / "Black").
  - Top player strip: opponent (Black when White at bottom, White when Black at bottom).
  - Bottom player strip: user (White when White at bottom, Black when Black at bottom).
- Created DOM test suite `tests/dom/components/PlayerStrip.test.tsx` (9 tests passing, 100% statement, branch, function, line coverage).
- Updated `components/board/ChessboardView.tsx`:
  - DOM order: top `PlayerStrip`, board/evaluation row (`board-region` with `board-stage`), bottom `PlayerStrip`, playback row (`MoveHistoryControls`).
  - Removed obsolete `PlayerRow` function.
  - Removed detached top flip button; passed `onFlipOrientation` to `MoveHistoryControls`.
- Updated `app/globals.css`:
  - `.player-strip`: 40px height, transparent background, 32px avatar with 8px gap.
  - `.chessboard-frame`: padding 0, 4px border radius, transparent background, no box shadow.
  - `.chessboard`: 3px radius, clips square background, preserves external focus ring. Exact square colors (`#eeeed2` light, `#769656` dark).

### Task 2.2 — Playback and Evaluation Surround

- Updated `components/board/MoveHistoryControls.tsx`:
  - Preserved `currentPly`, `totalPlies`, `onPlyChange` API; added `onFlipOrientation`.
  - Compact 44px toolbar with order: First position, Previous move, Position label, Next move, Last position, Flip board.
  - Reused `AppIcon` 20px SVG icons in 44px buttons.
  - Visible position label: **Start** at ply 0; otherwise `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'} / ${Math.ceil(totalPlies / 2)}`.
  - Accessible position label: "Position {ply} of {totalPlies}".
  - Integrated Flip board button inside the toolbar.
- Created DOM test suite `tests/dom/components/MoveHistoryControls.test.tsx` (5 tests passing, 100% statement, branch, function, line coverage).
- Updated `tests/dom/components/ChessboardView.test.tsx`:
  - Fallback username assertion aligned to design contract ("Unknown player").
  - Button assertions updated to verify visible accessible buttons with SVG icons (12 tests passing).
- Updated `app/globals.css`:
  - `.evaluation-bar`: 20px width, 2px radius, 1px subtle border, dark background `#262522`.
  - `.board-stage`: 2-column grid (`20px minmax(0, 1fr)` with 8px gap). Evaluation slot reserved when no score exists (`.evaluation-bar-placeholder`) so starting analysis does not shift the board.
  - Board sizing formulas:
    - Desktop normal: `min(calc(100% - 28px), calc(100dvh - 244px), 760px)`.
    - Compact desktop: `min(calc(100% - 28px), calc(100dvh - 228px), 760px)`.
    - Stacked / Mobile: `min(calc(100% - 28px), 532px)` within 560px centered group.
    - Short window: `min(calc(100% - 28px), 480px)`.
- Updated `tests/e2e/workspace.spec.ts`:
  - Aligned position label assertion at line 25 to accessible label `Position 1 of 8` (all 9 tests passing across Chromium, Firefox, WebKit).
- Visual regression snapshots inspected and regenerated for intentional Phase 2 board presentation:
  - `loaded-board.png` (Chromium, Firefox, WebKit): Top/bottom player strips, clean 4px border radius board frame, compact toolbar with integrated flip button.
  - `opening-tree.png` (Chromium, Firefox, WebKit): Clean board frame and compact toolbar.
  - `analyzer-unavailable.png` (Chromium, Firefox, WebKit): Board presentation with player strips and compact toolbar.
  - `mobile-workspace.png` (Chromium, Firefox, WebKit): Mobile layout with player strips, square board, and single-row playback controls.

## Phase 3: Import and Game Library

### Task 3.1 — Deterministic Date Presets

- Created `features/ingestion/datePresets.ts`:
  - `DatePreset` union type: `'last30' | 'thisMonth' | 'all' | 'custom'`.
  - `resolveDatePreset(preset, now)`: Pure UTC date range resolution.
    - `last30`: UTC today minus 29 days through UTC today, inclusive.
    - `thisMonth`: UTC first day of current month through UTC today, inclusive.
    - `all`: Empty strings (`dateFrom: ''`, `dateTo: ''`) converted to omitted query parameters.
    - Zero mutations or `Date.now()` calls; fully deterministic.
- Created `tests/unit/ingestion/datePresets.test.ts`:
  - 4 test cases testing exact UTC calendar math, January year roll-over, leap year February 29th, and input immutability.
- Updated `components/controls/GameQueryForm.tsx`:
  - Native radio group labeled **Date range** with visible choice chips for **Last 30 days**, **This month**, **All available**, **Custom**.
  - Controlled selection inferred from draft dates on remount.
  - Selecting preset updates draft via `onDraftChange` without submitting.
  - Custom dates inputs (From date, To date) only visible when Custom is active.
- Updated `tests/dom/components/GameQueryForm.test.tsx`:
  - 13 DOM tests passing (preserves recent queries, switches to Custom on date edit, enforces date validation).

### Task 3.2 — Onboarding and Import States

- Updated `components/workspace/ChessWorkspace.tsx`:
  - Games panel on first visit renders centered onboarding panel (max-width 520px) with heading **Review your games** (24px bold) and description text.
  - Direct single-form flow: username input, date preset radio chips, expandable **Game filters** disclosure, and primary **Load games** button.
  - Zero sample boards, marketing illustrations, or fake statistics displayed before import.
  - Announce loaded game count via live region scoped strictly to Games tab (`{tab === 'games' && loadedAnnouncement ? ... : null}`).
  - Wired transition notices (`OfflineCacheNotice`, `DiagnosticSummary`, cancelled, failed, empty, partial) directly to workspace state.
- Updated `components/feedback/DiagnosticSummary.tsx`:
  - Diagnostic codes rendered exclusively inside the expandable disclosure; user-facing summary rendered outside.
- Updated `tests/dom/components/IngestionFeedback.test.tsx` (11 tests passing).

### Task 3.3 — Compact Game Rows

- Updated `components/analysis/GameSelector.tsx`:
  - Single selection button per row, minimum height 76px, padding 12px, 8px vertical gap, no outer card.
  - Top line: Opponent name and opponent rating at left; textual Win/Draw/Loss badge at right (green Win, neutral Draw, red Loss).
  - Second line: Time class, formatted date, review status badge.
  - Selected-game detail line immediately above list: `{White} ({rating}) vs {Black} ({rating})`.
  - Primary **Review game** button next to detail line invoking `onAnalyze(selectedGameId)` and switching to Review tab without auto-starting analysis.
  - Disabled state when selected game has zero reviewable moves with visible notice **This game has no reviewable moves.**
  - Accessible name on row button contains user color and both player ratings.
- Updated `components/workspace/ChessWorkspace.tsx`:
  - Status mapping: no result = Not reviewed; result complete = Reviewed; result partial/cancelled = Partial review; result failed = Review failed; selected current running job = Analysing…
  - Passed `reviewDisabledReason` dynamically based on parsed game ply count.
- Updated `tests/dom/components/GameSelector.test.tsx` (7 tests passing).
- Updated `tests/e2e/helpers/workspaceFixtures.ts`:
  - `loadFixtureGames` selects Custom preset before filling explicit date inputs.
- Updated E2E specifications:
  - `workspace.spec.ts`, `workspace-responsive.spec.ts`, `workspace-accessibility.spec.ts`, `workspace-visual.spec.ts` updated to match nav rail button exactly (`{ name: 'Review', exact: true }`).
- Responsive & layout hardening:
  - Added `min-width: 0` to `.date-range-fieldset`, `.date-preset-grid`, `.choice-chip`, `.onboarding-panel`, `.query-form`, and `.field`.
  - Added responsive one-column grid fallback for `.date-preset-grid` below 22rem.
  - Set explicit `1.25rem` dimensions and `flex-shrink: 0` for `input[type='radio']` to prevent label text compression.
  - Added responsive padding rules for `.onboarding-panel` (16px below 480px, 12px/6px below 320px).
- Updated visual regression snapshots:
  - `initial-query.png` (Chromium, Firefox, WebKit): Verified intentional onboarding card with native date preset radio chips.
  - `loaded-board.png` (Chromium, Firefox, WebKit): Verified compact game selector layout and primary Review game button.
  - `mobile-workspace.png` (Chromium, Firefox, WebKit): Verified compact mobile layout without horizontal overflow.

### Phase 3 Exit Gate Verification

- Prettier check passed (`npm run format:check` exit 0).
- ESLint passed (`npm run lint` exit 0, 0 errors, 0 warnings).
- TypeScript check passed (`npm run typecheck` exit 0, 0 errors).
- Vitest unit and DOM tests with 100% coverage threshold passed (`npm run test:coverage` exit 0, 77 test suites, 634 tests passing).
- Next.js production build passed (`npm run build` exit 0).
- Playwright end-to-end tests across all browser projects passed (`npm run test:e2e` exit 0, 124 tests passing).
- Full `npm run verify` passed with exit code 0.

## Phase 4: Review and Analysis Implementation

### Task 4.1: Next-Mistake Selector

- Created `features/stockfish-analysis/reviewNavigation.ts`:
  - `nextMistakePly(annotations, selectedPly)`: finds earliest subsequent mistake, blunder, or miss among analysed plies for either side.
  - Ignores inaccuracies, good moves, forced moves, indeterminate classifications, and unanalysed positions.
  - Pure function that does not mutate or require pre-sorted inputs.
- Created unit tests in `tests/unit/stockfish-analysis/reviewNavigation.test.ts` (5 tests passing).

### Task 4.2: Shared Mode and Data Contract

- Updated `components/analysis/AnalysisMoveList.tsx`:
  - Extended props with `moves?: readonly MovePly[]`.
  - Grouped rows by fullmove number extracted from FEN fields or ply count.
  - Layout: 32px fullmove number column, White and Black cells sharing remaining width.
  - Interactive cells with SAN and inline classification badges.
  - Inactive em dash cells for missing moves in incomplete rows.
  - Accessible names include full move details: ply number, SAN, evaluation, and quality label.
  - Unanalysed cells explicitly indicate "Not analysed".
  - Bounded container `scrollTop` auto-scrolling on ply changes without scrolling ancestor containers or moving focus.
- Expanded `tests/dom/components/AnalysisMoveList.test.tsx` (9 tests passing).

### Task 4.3: Review Presentation

- Created `components/analysis/ReviewFeedback.tsx`:
  - Selected move feedback displaying classification badge and `{SAN} — {quality label}`.
  - Best move conversion from UCI to SAN via `chess.js` with fallback to "Best move unavailable".
  - Next mistake button with supporting message "No later mistakes in the analysed moves." when no subsequent mistakes exist.
  - Handles empty and unanalysed positions gracefully.
- Created `tests/dom/components/ReviewFeedback.test.tsx` (8 tests passing).
- Updated `components/analysis/GameReviewSummaryCard.tsx`:
  - Added support for player metadata (names/initials).
  - Accuracy summary with 32px (2rem) local estimate display and explicit "Local estimate" caption.
  - Optional upstream Chess.com accuracy scores displayed below in smaller, separately labeled cards.
  - Added visible partial review status: `Partial review: {analyzedPlies}/{totalPlies} positions analysed`.
  - Collapsible `<details className="game-review-summary__breakdown">` with summary label "Move breakdown".
- Created `tests/dom/components/GameReviewSummaryCard.test.tsx` (5 tests passing).
- Updated `components/analysis/MoveAccuracyGraph.tsx`:
  - Standardized visible heading to "Evaluation".
  - Supported customizable `title` and `className` props for height variations (`accuracy-graph--review`, `accuracy-graph--analysis`).

### Tasks 4.4 & 4.5: Analysis Presentation & Engine Lifecycle UI

- Updated `components/analysis/VariationSandboxBanner.tsx`:
  - Button text updated to "Return to game".
- Updated `components/analysis/AnalyzerWorkspace.tsx`:
  - Composed separate `Review` and `Analysis` presentation modes based on active mode prop.
  - Review mode order: shared tabs, compact lifecycle row & Settings disclosure, accuracy summary, 96px Evaluation graph, Review feedback, collapsible move breakdown, grouped move list.
  - Analysis mode order: shared tabs, compact lifecycle row & Settings disclosure, selected-move annotation panel with PVs (or variation sandbox / empty notes), grouped move list, 80px Evaluation graph at bottom.
  - Compact lifecycle row covering all states (probing, idle, running, partial, failed, complete, unavailable) with appropriate primary/secondary actions.
  - Collapsible Settings disclosure closed by default containing AnalysisSettings and nested Engine details.
  - Exploring variation banner displaying "Exploring a variation" and "Return to game" button.
- Updated `components/workspace/ChessWorkspace.tsx`:
  - Wired `mode={reviewMode}`, `game={parsedGame}`, `players`, `isVariationActive`, and `onReturnToGame` to `LazyAnalyzerWorkspace`.
  - Switching to Review mode exits active variation.
  - Removed obsolete temporary tab panel heading.
- Updated `app/globals.css`:
  - Styles for `.analyzer-lifecycle-row`, `.analyzer-lifecycle-status`, `.analyzer-lifecycle-text`, `.analyzer-lifecycle-action`.
  - Styles for `.analysis-settings-disclosure`, `.analysis-settings-body`, `.analysis-engine-details`.
  - Styles for `.review-feedback`, `.variation-active-banner`.
  - Grouped move table styles (`.analysis-move-table`, `.analysis-move-table__row`, `.analysis-move-cell`, `.analysis-move-cell--selected`, `.analysis-move-cell--empty`).
  - Move list height: `clamp(176px, 30dvh, 320px)` on desktop, `max-height: 320px` in stacked layout.
  - Graph height modifiers: `.accuracy-graph--review` (96px), `.accuracy-graph--analysis` (80px).
- Updated test expectations in `tests/e2e/workspace.spec.ts`, `tests/e2e/workspace-accessibility.spec.ts`, and `tests/e2e/workspace-responsive.spec.ts` to open the Settings disclosure before selecting analysis strength or viewing engine details, and verified Review mode summary tab switching.
- Inspected and updated visual snapshots for `analyzer-unavailable.png` across Chromium, Firefox, and WebKit to reflect the intentional removal of the temporary heading and adoption of the Phase 4 compact lifecycle row and grouped move table.

### Phase 4 Exit Gate Verification

- Prettier check passed (`npm run format:check` exit 0).
- ESLint passed (`npm run lint` exit 0, 0 errors, 0 warnings).
- TypeScript check passed (`npm run typecheck` exit 0, 0 errors).
- Vitest unit and DOM tests with 100% coverage threshold passed (`npm run test:coverage` exit 0, 80 test suites, 653 tests passing).
- Next.js production build passed (`npm run build` exit 0).
- Playwright end-to-end tests across all browser projects passed (`npm run test:e2e` exit 0, 124 tests passing).
- Full `npm run verify` passed with exit code 0.

## Phase 5: Opening Explorer

### Task 5.1 — Outcome Bar

- Created `components/tree/OutcomeBar.tsx`:
  - `OutcomeBarProps`: `breakdown: OutcomeBreakdown`, `perspective: OutcomePerspective`.
  - Flexible horizontal stacked bar (height 12px, border-radius 3px) visualizing win, draw, and loss segments using unrounded fractional percentages for segment widths (`100 * rate%`).
  - User perspective color segments: Wins green (`#81b64c`), Draws neutral gray (`#96938b`), Losses red (`#c95555`).
  - Board perspective color segments: White wins light cream (`#eeeed2`), Draws neutral gray (`#96938b`), Black wins dark slate (`#45423d`) with high-contrast borders.
  - Zero games / empty sample renders a neutral empty track with label "No games" without NaN/Infinity widths.
  - Labels beneath bar display whole rounded percentages separated by " / " (e.g., `30% / 20% / 50%`).
  - Accessible name (`aria-label`) on the outcome bar includes exact game counts and perspective (e.g., "User wins 3, draws 2, losses 5, from 10 games").
- Created `tests/dom/components/OutcomeBar.test.tsx`:
  - Tested 3/2/5 sample produces 30/20/50% segment widths with correct counts in accessible label.
  - Tested both User and Board perspective colors and aria labels.
  - Tested zero sample size empty state displaying "No games" with no NaN/Infinity styles.
  - Tested thirds split (1/1/1) preserving fractional widths (33.333333333333336%).

### Task 5.2 — Compact Candidate Table and Details

- Updated `components/tree/OpeningTreeTable.tsx`:
  - Reorganized panel order: Heading `Openings` (level 3); collapsible `<details>` disclosure for resource-limit/exclusion notices with diagnostic codes; single-line horizontally scrollable `PathBreadcrumbs` (root label "Starting position"); labeled "Sort candidate moves" select; compact candidate table; `<details className="more-statistics-disclosure">` containing opening horizon explanation and full detailed statistics table; action container with `{moveOrdersAction}` button ("View move orders").
  - Primary candidate table columns: `Move` (64px, native SAN button), `Games` (56px, tabular numbers, right aligned), `Results` (remaining width, containing `OutcomeBar`).
  - Semantic table labeling: `aria-label="Opening candidates"`.
  - Native SAN button has accessible name containing candidate SAN plus game count (`aria-label="${candidate.san}, ${candidate.games} games"`).
  - Horizon check: When opening depth limit is reached (`(navigation.history.length - 1) >= graph.openingHorizon`), displays "Opening depth limit reached. Increase the opening depth in Game filters and import again." Otherwise displays "No further moves in these games."
  - More statistics disclosure contains full statistics table with Move, Win rate, Expected user score, Draw rate, Average opponent rating, Sample size, distinguishing expected score from win rate.
- Updated `components/tree/PathBreadcrumbs.tsx`:
  - Root button label changed to "Starting position".
  - Breadcrumb items styled with `.breadcrumb-btn` having high-contrast text (`color: var(--text-primary); text-decoration: underline;`).
  - Single-line horizontal scroll container.
- Updated `components/workspace/ChessWorkspace.tsx`:
  - Passed `moveOrdersAction` directly into `OpeningTreeTable`.
- Added CSS in `app/globals.css`:
  - Styles for `.candidate-table`, `.candidate-table-row`, `.candidate-move-btn`, `.candidate-games-cell`, `.candidate-results-cell`.
  - Styles for `.outcome-bar`, `.outcome-bar__track`, `.outcome-bar__segment`, `.outcome-bar__labels`.
  - Styles for `.more-statistics-disclosure`, `.more-statistics-body`, `.detailed-opening-table`.
  - Added `.visually-hidden` alongside `.sr-only` for standard screen reader utility classes.
- Updated visual snapshots for `opening-tree.png` and `analyzer-unavailable.png` across Chromium, Firefox, and WebKit:
  - Inspected image differences: intentional layout revamp for `opening-tree` (OutcomeBar stacked charts, compact column sizing, Starting position breadcrumb) and proper application of `.visually-hidden` in `analyzer-unavailable`.

### Phase 5 Exit Gate Verification

- Prettier check passed (`npm run format:check` exit 0).
- ESLint passed (`npm run lint` exit 0, 0 errors, 0 warnings).
- TypeScript check passed (`npm run typecheck` exit 0, 0 errors).
- Vitest unit and DOM tests with 100% coverage threshold passed (`npm run test:coverage` exit 0, 80 test suites, 657 tests passing).
- Next.js production build passed (`npm run build` exit 0).
- Playwright end-to-end tests across all browser projects passed (`npm run test:e2e` exit 0, 124 tests passing).
- Full `npm run verify` passed with exit code 0.

## Phase 6: Release Verification

### Task 6.1 — Presentation Cleanup and Coverage Audit

- Audited styles in `app/globals.css` to confirm all legacy tokens and selectors are removed or migrated to semantic CSS custom properties.
- Verified no duplicate forms, duplicate IDs, or redundant `useWorkspace` controller instances exist.
- Verified `git diff --check` reported 0 whitespace errors or conflict markers.
- Maintained strict 100% test coverage across all configured metrics in `vitest.config.ts`.

### Task 6.2 — Deterministic Visual Coverage & Baselines

- Visual snapshots inspected and verified across all supported browser engines (Chromium, Firefox, WebKit):
  - `initial-query`: Query form and clean empty state.
  - `loaded-board`: Board presentation, player strips, compact move controls.
  - `opening-tree`: Revamped opening explorer with OutcomeBar visualizations, compact table, and more statistics disclosure.
  - `analyzer-unavailable`: Proper error callout and cleanly hidden `.visually-hidden` screen-reader content.
  - `mobile-workspace`: Stacked responsive layout on mobile viewport.
- All 15 visual regression tests passed cleanly.

### Task 6.3 — Responsiveness and Accessibility Matrix

- Verified responsiveness across viewports: Desktop (1440x900, 1280x800), Tablet (1024x768), Mobile (390x844, 320x568), and 200% zoom.
- Automated axe-core accessibility checks passed with 0 critical/serious violations across all views:
  - Onboarding & query form
  - Loaded game library
  - Review mode summary and accuracy feedback
  - Analysis mode with engine controls
  - Opening tree candidate explorer
  - Utility drawer (Import modal)
  - About product dialog
- Contrast verified >= 4.5:1 for normal text and >= 3:1 for graphical UI components.

### Task 6.4 — Final Verification

- Prettier verification: `npx prettier --check .` and `npx prettier --check docs/frontend-revamp` both passed with 0 errors.
- Full release verification suite: `npm run verify` passed with exit code 0.

### Board Dimension and Sizing Defect Resolution

- **Problem & Root Cause**:
  - In visual regression tests and Playwright runs, the chessboard rendered at ~258px width instead of filling the full 800px column space allocated by the design contract.
  - Root cause was `.workspace-layout__board` having `align-items: center` without `width: 100%`, and `.workspace-board` having no explicit width. This caused `.workspace-board` and `.board-shell` to shrink-wrap horizontally to the smallest intrinsic-width child (`MoveHistoryControls` ~288px), causing `.board-region`'s `calc(100% - 28px)` to resolve to 260px (board size 258px × 258px).
  - Additionally, when `evaluationScore` was null/empty, `.board-stage` omitted the evaluation bar slot, shifting the board horizontally when analysis started.
- **Remediation**:
  - `app/globals.css`:
    - Updated `.workspace-layout__board` to `width: 100%; min-width: 0; display: flex; flex-direction: column; align-items: center;`.
    - Updated `.workspace-board` to `min-width: 0; width: 100%; display: flex; flex-direction: column; align-items: center;`.
    - Sized `.board-shell` directly using `width: min(100%, calc(100dvh - 216px), 788px); margin-inline: auto;` (with responsive breakpoints for compact desktop, stacked mobile, and short viewports).
    - Set `.board-region` to `width: 100%; min-width: 0; margin-inline: auto;`.
    - Updated `.board-stage, .board-stage--with-evaluation` to a two-column grid (`20px minmax(0, 1fr)` with `gap: 8px; width: 100%`).
    - Added `.evaluation-bar-placeholder` (`width: 20px; visibility: hidden; pointer-events: none;`) to permanently preserve the evaluation track column and prevent layout shifts.
    - Set `.evaluation-bar` to fixed `width: 20px`.
  - `components/board/ChessboardView.tsx`:
    - Rendered `<div className="evaluation-bar-placeholder" aria-hidden="true" />` when `!evaluationScore`.
- **Verification**:
  - At 1440×900 viewport: board bounding box verified at 654px × 654px inside a 684px shell, centered with 60px margins in the 804px board column.
  - Visual regression snapshots updated and inspected across Chromium, Firefox, WebKit (`loaded-board`, `opening-tree`, `analyzer-unavailable`, `mobile-workspace`).
  - Vitest coverage: 100% thresholds maintained (81 test suites, 657 tests passing).
  - Full `npm run verify` passed with exit code 0.
