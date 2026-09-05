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
