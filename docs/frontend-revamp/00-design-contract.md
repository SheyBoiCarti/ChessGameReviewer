# Frontend revamp design contract

This is the binding product and visual specification. Phase documents specify implementation order. Dimensions are CSS pixels at a 16px root font size; implement fixed UI dimensions in rem and let browser zoom/reflow work. Breakpoints are CSS viewport widths.

## 1. Product direction and limits

Build a warm charcoal chess workspace with green actions, a dominant board, compact navigation, and a single contextual surface. Preserve the product name **Local Chess Game Reviewer**. Use original inline SVG interface icons and the existing chess-piece assets. No chess.com logos, copied illustrations, remote avatars, external fonts, gradients, glass effects, new UI libraries, or ornamental animation.

The chess.com references inform structure: left navigation, board adjacent to a right-side panel, prominent results, and move feedback near the active review. They are not pixel specifications and must not override this document:

- [Game Review design reference](https://www.chess.com/news/view/game-review-design-update).
- [Analysis board reference](https://support.chess.com/en/articles/8583825-how-do-i-use-the-analysis-board).

Keep Next.js 16.3.0, React 19, TypeScript, plain CSS, chess.js, current workers, database, Stockfish engine, and testing tools. Do not add dependencies or change lockfiles. Do not change API requests, engine presets, score normalization, accuracy heuristics, graph aggregation, cache keys, persistence schemas, worker protocols, CSP, or isolation headers. No cloud coach, invented explanations, live engine evaluation of sandbox positions, PGN import feature, multiplayer, autoplay, or opening-name database.

## 2. Layout and navigation

### Wide desktop: width >= 1280

- Fixed left rail: 168px wide, full viewport height, 12px padding. Brand at top; **Games**, **Review**, **Openings** in that order; **Settings**, **About** at bottom. Each item is at least 44px high, icon 20px, label 14px semibold, 8px gap. Active item has selected background and a 3px green left indicator.
- Main area starts after the rail. Header height 56px; one line with current view title on left and **Import games** on right. Remove the old marketing header, subtitle, and second local-first toolbar. Full product name remains the accessible banner name and About title.
- Content has 24px outer padding, 20px column gap, and maximum width 1440px centered inside the remaining area.
- Board column gets remaining space; contextual panel width is 400px. Board is centered inside its column. No permanently visible third import/filter column.
- For selected games or an opening graph, board and panel share the same top edge. Panel height is `calc(100dvh - 104px)`. Its internal contents scroll as specified by each phase.
- Board square side = `min(available board-column width - 28px, 100dvh - 244px, 760px)`. The 28px allowance is a 20px evaluation bar and 8px gap. Reserve this allowance when the bar is hidden so analysis does not shift the board.
- Board chrome total is at most 140px (player strips, playback, gaps, notices). At viewport heights below 640px switch to the short-window rules below.

### Compact desktop: 960 <= width < 1280

- Rail width 64px, centered 20px icons, visually hidden labels with accessible names and hover/focus tooltips. Brand uses an original chess-piece symbol; its accessible name is the product name.
- Header 56px. Content padding 16px, gap 16px, contextual panel width 340px.
- Board square side = `min(available board-column width - 28px, 100dvh - 228px, 760px)`.
- Panel height `calc(100dvh - 88px)`. Keep the same two-column order.

### Stacked: width < 960

- No desktop rail. Header height 56px with **Menu**, current view title, and **Import games**; icon-only controls are allowed below 480px with unchanged accessible names.
- Menu opens a modal drawer containing the same navigation items. Selecting an item closes it and focuses the new view heading. Escape/backdrop dismisses and restores the Menu trigger. Import and Menu drawers cannot be open simultaneously.
- Content padding 12px; at width < 480 use 8px. Board then panel, with 16px gap. Board group maximum width 560px and centered. Square side uses width only: `min(available content width - 28px, 532px)`.
- Normal document scrolling. Panel has no fixed height or sticky positioning; avoid inner scroll areas except the move list, capped at 320px. Tabs are one horizontal row and never wrap into a two-by-two grid.
- Playback remains one row at widths >=320px. No fixed bottom bar and no sticky board that can hide feedback. Below 320px put the position label above the controls and allow horizontal scrolling inside the playback toolbar, preserving 44px targets; no document horizontal overflow down to 200px.

### Short-window override

At width >= 960 and height < 640, keep rail and two columns but use document scrolling, unset panel fixed height, and use board square side `min(available board-column width - 28px, 480px)`. Never allow a viewport-height formula to produce a tiny or negative board.

### Views and transitions

Use existing `WorkspaceTab` values internally: `games`, `analysis`, `opening`, `settings`. Labels map to Games, Review, Openings, Settings. Do not add routes or persist new presentation state.

Within `analysis`, introduce `ReviewMode = 'review' | 'analysis'`, default `review`. The right panel has exactly two tabs: **Review**, **Analysis**. Openings is reached from navigation, not a duplicate third tab. This resolves the exploratory three-tab suggestion from the initial report.

| Action                           | Result                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Fresh visit without loaded games | Games view with inline import form; no automatic modal and no empty board placeholder                                        |
| Click game row                   | Select game using existing controller; stay in Games; show board preview                                                     |
| Click Review game                | Select chosen game; navigate to `analysis`, mode `review`; do not start engine automatically                                 |
| Click rail Review                | Navigate to `analysis`; preserve selected game and current review mode                                                       |
| Select a different game          | Existing controller selection reset applies; clear variation; reset review mode to `review`                                  |
| Switch Review/Analysis           | Preserve selected ply and computed results; leaving Analysis clears active variation                                         |
| Click Openings                   | Navigate to `opening`; use current graph navigation or initialized root; clear variation                                     |
| Click Settings                   | Show settings as a full content surface, no board; retain game selection                                                     |
| Return to Games/Review           | Restore selected game and existing controller ply; do not reload games                                                       |
| No selected game in Review       | Centered heading “Choose a game to review”, body “Open your games and select Review game.” and Go to games button            |
| No graph in Openings             | Heading “Explore your openings”, body “Import games to see which moves you play and how they score.” and Import games button |

Drawer state and review mode belong to `ChessWorkspace`, not the domain reducer. One `useWorkspace` instance must remain mounted across every view. Existing cancellation/token behavior on game changes is preserved; shell navigation must not create additional analysis jobs.

Board interaction by view: Games and Review allow playback and orientation but no piece moves; Analysis allows current game moves and variations through existing handlers; Openings allows existing graph moves. Restrict the existing `tab === 'analysis'` piece-interaction checks to `tab === 'analysis' && reviewMode === 'analysis'`. A selected game without parseable moves displays “This game has no reviewable moves.” in the board region; with no selection the board region is absent. Settings and empty Review/Openings use the full available main-content width, max-width 960px for Settings and 520px for empty states. Once the game library is loaded but no game is selected, its centered panel has max-width 800px; do not allocate an empty board column.

## 3. Visual tokens

Define semantic tokens in `app/globals.css`. Existing aliases may temporarily point to these values, but final product selectors must use semantic names. Remove misleading gold-specific token names by Phase 6 after migrating their consumers.

| Token                | Dark      | Light     |
| -------------------- | --------- | --------- |
| `--canvas`           | `#262522` | `#f2f1ed` |
| `--surface-elevated` | `#302e2b` | `#ffffff` |
| `--surface-raised`   | `#3a3834` | `#e9e7e1` |
| `--surface-hover`    | `#45423d` | `#dfddd5` |
| `--text-primary`     | `#f5f4f0` | `#25241f` |
| `--text-muted`       | `#c2bfb7` | `#59574f` |
| `--border-subtle`    | `#514e47` | `#d0cdc3` |
| `--border-strong`    | `#8b877c` | `#777367` |
| `--action-bg`        | `#81b64c` | `#81b64c` |
| `--action-hover`     | `#95c660` | `#95c660` |
| `--action-text`      | `#17220c` | `#17220c` |
| `--accent-text`      | `#a8d875` | `#386219` |
| `--selected-bg`      | `#3b4930` | `#e3efd8` |
| `--focus-ring`       | `#b9e58b` | `#386219` |

Board light squares `#eeeed2`, dark squares `#769656` in both themes. Keep existing move-quality color semantics and icons; verify their text contrast on the new surfaces. Do not use red/green alone to communicate outcomes: show Win/Draw/Loss text, quality labels, and symbols.

- Font stack: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`; no download. Body 14px/1.5, page title 20px/1.25 weight 700, section title 16px/1.4 weight 700, metadata 12px/1.5, accuracy 32px/1.1 weight 750. Tabular numerals for ratings, counts, scores, and evaluation.
- Spacing scale: 4, 8, 12, 16, 24, 32px. Container radius 8px; inputs/buttons 6px; avatar radius 6px. Flat surfaces, no shadow except dialogs (`0 12px 32px rgb(0 0 0 / 28%)`).
- Inputs/buttons minimum height 44px. Table/move cells minimum 44px touch target. Focus ring 3px, offset 2px, never clipped. Text selection is not disabled globally.
- Primary button green; secondary raised surface and strong border; tertiary transparent. Only the current primary action receives green fill. Selected tabs use green underline, not filled green buttons.
- Hover/focus color transitions 120ms ease-out; evaluation height transition 160ms. Disable transitions under reduced motion. No entrance, bounce, piece-travel, or celebration animations in scope.
- Preserve system/light/dark preference. System must respond to media changes. Light theme receives the same complete component styling, not a token-only approximation.

## 4. Component and state ownership

| File                                                    | Responsibility after redesign                                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `app/page.tsx`                                          | Server entry; mounts loader, no duplicated marketing header                                              |
| `components/workspace/ChessWorkspace.tsx`               | Existing controller integration, selected game/graph/variation, presentation navigation and drawer state |
| `components/workspace/WorkspaceLayout.tsx`              | Main board/context grid only                                                                             |
| `components/workspace/WorkspaceNavigation.tsx` (new)    | Rail and reusable navigation content; no data fetching                                                   |
| `components/workspace/AppTopBar.tsx`                    | Single compact page header and existing About dialog integration                                         |
| `components/workspace/WorkspaceTabs.tsx`                | Review/Analysis tab semantics; exports original WorkspaceTab type for compatibility                      |
| `components/workspace/UtilityRail.tsx`                  | Import modal drawer at every viewport; no desktop permanent panel                                        |
| `components/ui/AppIcon.tsx` (new)                       | Original, stateless 24x24 inline SVG interface icons                                                     |
| `components/board/ChessboardView.tsx`                   | Existing board mechanics and player/toolbar composition                                                  |
| `components/analysis/AnalyzerWorkspace.tsx`             | Review/Analysis composition and engine status/actions                                                    |
| `components/analysis/ReviewFeedback.tsx` (new)          | Selected move feedback and next-mistake action; no score calculation                                     |
| `features/stockfish-analysis/reviewNavigation.ts` (new) | Pure next-mistake selection                                                                              |
| `features/ingestion/datePresets.ts` (new)               | Pure UTC date-preset calculations                                                                        |

Retain existing props unless a phase explicitly extends them. Reuse `GameReviewSummaryCard`, `AnalysisMoveList`, `MoveAccuracyGraph`, `EngineAnnotationPanel`, `PrincipalVariationList`, `OpeningTreeTable`, existing dialogs, and feedback components. Do not replace board event handling or install another board renderer.

## 5. Non-negotiable behavior and accessibility

- Preserve drag/drop, click-to-move, keyboard board navigation, promotion dialog, board orientation, selected-ply synchronization, evaluation perspective, move-order navigation, and variation return behavior.
- A variation position must not display the original game's evaluation, move-quality badge, or annotation as if it describes that variation. Hide those overlays while a variation is active; display the existing variation banner.
- Preserve local-data deletion and confirmation behavior. Keep local estimates explicitly distinct from upstream Chess.com accuracy; neither number substitutes for the other.
- All navigation uses native buttons with accessible names. Rail selections use `aria-current="page"`; review tabs use tablist/tab/tabpanel semantics with ArrowLeft/Right, Home/End and roving tabIndex. Do not make two nested tablists for global navigation.
- All modal drawers/dialogs trap focus, make background inert, close on Escape, and restore focus except successful navigation/import, which focuses the destination heading. No nested modals: close Menu before Import; close Import before About.
- Long usernames truncate visually with full text available via accessible name and `title`. Missing username = “Unknown player”; missing rating = em dash; initials = first two alphanumeric username characters uppercase, or `?` when none. No remote profile lookup.
- Errors remain actionable and inline with `role="alert"`; progress uses polite status. Do not repeatedly announce selected move from multiple regions.
- Board, game list, openings, and settings remain usable when the engine is unavailable. No false completion state for partial/cancelled analysis. Cached data and offline notices remain reachable.

## 6. Required evidence

Inspect dark and light layouts at 1440x900, 1024x768, 768x1024, 390x844, and 320x568; inspect short-window mode at 1024x600. Verify boundary widths 959/960 and 1279/1280. Verify 200% browser zoom/reflow and 200px viewport width for no horizontal document overflow. Pixel dimensions in this document are design targets at default zoom, not reasons to defeat user font scaling.

Retain all existing coverage thresholds. Existing visual baselines are evidence of the old layout, not proof that the new layout is wrong. Replace them only after an intentional change is implemented and visually inspected. Phase 6 defines exact release gates.
