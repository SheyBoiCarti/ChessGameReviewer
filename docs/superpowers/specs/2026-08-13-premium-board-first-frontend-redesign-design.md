# Premium Board-First Frontend Redesign

**Status:** Approved design

## Goal

Redesign the Phase 4 Chess Game Reviewer interface as a premium, dark, board-first analysis cockpit. The redesign improves spatial hierarchy, desktop/tablet/mobile behavior, visual quality, and interaction polish while preserving all existing ingestion, opening-tree, Stockfish, local-data, accessibility, and error-recovery behavior.

This is a frontend presentation and composition project. It does not change the domain models, ingestion protocol, graph semantics, engine analysis semantics, IndexedDB records, or service concurrency rules.

## Product principles

- The board is the visual and spatial anchor after a query begins or games are available.
- Game query controls must remain reachable but must not permanently compete with analysis space.
- The interface must feel deliberate and calm: deep graphite surfaces, restrained accent colour, clear typographic hierarchy, and subtle motion.
- Existing real state must remain visible and distinguishable: loading, complete, partial, cancelled, offline-cache-only, engine unavailable, and failure must never collapse into a generic empty state.
- Keyboard, screen reader, touch, zoom, and reduced-motion journeys are first-class requirements.

## Information architecture and responsive layout

### Global shell

Replace the current vertically stacked marketing-style header, notice, privacy card, and workspace with a compact application shell.

- **Top bar:** product identity, a concise local-first indicator, an information trigger for unaffiliated/privacy details, and global preferences/actions. It remains compact on desktop and adapts to a mobile toolbar.
- **Disclosure content:** preserve the unaffiliated and local-storage messages in an accessible disclosure, popover, or drawer reachable from the top bar. Their content and test hooks remain available; they are no longer large permanent blocks ahead of the workspace.
- **Initial state:** show a focused query experience in the primary surface. Username and date controls are immediately visible. Advanced game filters and opening settings are grouped and collapsible without hiding their current values.

### Loaded desktop workspace

At large desktop widths, use a three-region layout:

```text
Top bar
┌────────────────┬────────────────────────────────┬────────────────────┐
│ Utility rail   │ Board focal region             │ Contextual panel   │
│ Query/filter   │ Board, evaluation, history,    │ Games, Opening,    │
│ status/cache   │ selected-game facts            │ Analysis, Settings │
└────────────────┴────────────────────────────────┴────────────────────┘
```

- **Utility rail:** contains query controls, ingestion progress, diagnostics, cache status, and selected lightweight controls. It can be expanded on demand and defaults to collapsed after a successful query; it must not become inaccessible when collapsed.
- **Board focal region:** owns the primary visual space. The board uses the smaller of available inline space and usable viewport height after top-bar, board metadata, and navigation controls are accounted for. It must retain an aspect ratio of 1:1 and be centered in its region.
- **Contextual panel:** contains the existing Games, Opening Tree, Analysis, and Settings content. Its content scrolls independently when necessary without hiding board controls. Its workspace selection is a visually refined, keyboard-accessible segmented tab control.
- **Context preserved:** switching a contextual panel must not reset selected game, board ply, graph navigation, analysis results, or query state.

### Tablet and mobile

- **Tablet:** below the desktop breakpoint, the utility rail becomes a modal/drawer panel. The board occupies the first major content region; the contextual panel flows below it. Do not simply allow desktop columns to compress.
- **Phone:** stack board, board controls, and contextual content vertically. Game data uses compact cards. Tables that cannot reasonably fit become equivalent card/list presentations; no essential action is hidden behind horizontal scrolling.
- **Breakpoints:** choose breakpoints from actual layout pressure and verify at representative phone, tablet, small-laptop, and wide-desktop widths. Do not use a breakpoint solely because it is conventional.
- **Zoom:** maintain no horizontal document overflow at 200% browser zoom. Internal scrolling is permitted only for intentionally scrollable data regions with clear affordance.

## Visual design system

### Theme

The default is a premium dark analysis environment, not an imitation of Chess.com.

- Base canvas: near-black blue graphite.
- Surface scale: at least three distinct but subtle elevations for app chrome, primary panels, and raised/floating controls.
- Borders: low-contrast cool-gray borders; use shadow, background separation, and spacing in addition to borders to communicate elevation.
- Accent system: warm gold for primary actions, selected/focused chess interaction, and high-value emphasis; restrained teal for ready/success states; amber and red only for warning and failure states.
- Theme preference: preserve the existing system/light/dark preference mechanism. Dark remains the intended default and light remains supported with equivalent semantic contrast.
- All semantic colours must meet WCAG 2.2 AA contrast for their rendered text/icon use; no state meaning relies on colour alone.

### Typography, spacing, and motion

- Use a robust modern sans-serif stack that renders without a remote dependency. Define display, heading, body, metadata, and numeric styles with deliberate size, weight, line-height, and tracking.
- Use tabular numerals for dates, ratings, scores, and analysis values to improve scanability.
- Introduce a spacing, radius, border, and shadow token scale shared by all workspace primitives.
- Motion is limited to short opacity and transform transitions for drawers, panels, selection, and status changes. Under `prefers-reduced-motion`, transitions and animation are removed or reduced to instant state changes.

### Panels and controls

- Introduce reusable presentational primitives for surfaces, section headings, status badges, empty-state/recovery layouts, and action hierarchy.
- Primary, secondary, quiet, destructive, and icon-only buttons receive distinct, consistent styles and hover, active, disabled, and `:focus-visible` states.
- Inputs, selects, date fields, and numeric fields use the same visual language and maintain native semantics.
- Time-class and colour checkboxes become compact selectable chips/toggles backed by real labelled checkbox inputs. Empty-invalid selection remains detectable and described to assistive technology.
- Loading, progress, empty, partial, offline, engine-unavailable, and error states have dedicated layout and recovery actions; existing messages and status semantics remain accurate.

## Board experience

- Replace Unicode chess glyph rendering with repository-owned or compatibly licensed local SVG-style chess pieces. Preserve each piece's accessible label and the board's current grid semantics.
- Use a refined muted board palette with sufficient distinction between light/dark squares, premium board frame treatment, coordinate labels, and polished last-move/selected-square highlights.
- Keep orientation, FEN validation/recovery, keyboard move history, first/previous/next/last controls, visual PV arrow, and textual PV-arrow equivalent unchanged in behavior.
- Style the evaluation bar as a coherent part of the board assembly and retain its current white-perspective, finite/unknown/mate handling and accessible text.
- Use an explicit board-local sizing strategy rather than relying on a fragile container-query unit without an established query container.

## Component and state boundaries

`app/page.tsx` remains a composition boundary. Existing workspace controllers and services continue to own query, ingestion, graph, analysis, persistence, and race-condition behavior.

The implementation may add focused presentational components such as:

- `AppTopBar` and `ProductInformation` disclosure;
- `UtilityRail` and `ResponsiveUtilityDrawer`;
- `WorkspacePanel` and refined `WorkspaceTabs` presentation;
- shared `Surface`, `SectionHeader`, `StatusBadge`, and `EmptyState` primitives;
- board asset/coordinate components;
- responsive table/card adapters for games and tree data where needed.

These components receive typed view state and callbacks. They do not fetch data, instantiate workers/services, mutate graph objects, parse PGN independently, or introduce a second source of application state.

## Accessibility requirements

- Preserve the existing WAI-ARIA tab pattern, keyboard navigation, board grid labels, keyboard board history, live progress reporting, error alerts, and modal focus handling.
- Utility drawer and product-information disclosure must have labelled controls, deliberate focus placement on open, Escape close where applicable, focus restoration on close, and background inertness for modal use.
- Maintain a visible, high-contrast `:focus-visible` treatment across the full new colour system.
- All primary interactive controls must have at least a 44 by 44 CSS-pixel target or equivalent spacing that meets WCAG target-size guidance.
- Status badges include text and, if an icon is used, a non-colour textual equivalent.
- The board, filters, tabs, drawers, dialogs, game selector, opening tree, settings, and analyzer remain usable with keyboard only and at 200% zoom.
- Ensure screen-reader announcements remain concise: query/engine progress is polite; terminal/failed states use appropriate alert semantics; presentation-only animation never produces duplicate announcements.

## Testing and verification

### Automated tests

- Update component tests for utility-rail/drawer state, disclosure behavior, chip-backed checkbox semantics, tab selection, refined status states, and board coordinate/piece accessibility.
- Preserve tests that prove the actual service/controller behavior and visual states are tied to genuine data, not placeholders.
- Add Playwright coverage at phone, tablet, small-laptop, and desktop viewports for initial query, loaded games, opening-tree navigation, analysis loading/ready/unavailable, settings/local-data, utility drawer, and product disclosure.
- Keep and extend 200% zoom/no-horizontal-overflow coverage.
- Run axe scans in initial, loaded-game, opening-tree, analysis, drawer/dialog, offline/partial, and error states. No serious or critical violations are acceptable.
- Capture stable visual regression screenshots for the initial query, loaded board-first workspace, opening tree, analyzer, and mobile workspace. Mask or stabilize inherently variable data.

### Manual verification

- Inspect actual board size and surrounding chrome at small-laptop and desktop dimensions; verify the board is visibly primary and does not feel constrained by the game list or filters.
- Perform keyboard-only flows: query to loaded games, open/close utility drawer, tab between contextual panels, navigate board history, open/close move-order dialog, start/cancel/resume analysis, and delete-data confirmation.
- Check contrast of all normal/hover/selected/disabled/focus states in dark and supported light theme.
- Check touch interactions on a phone-sized viewport and verify no control depends on hover.

## Acceptance criteria

1. After a successful query, the board is the largest persistent workspace element on desktop and is sized from usable viewport height as well as available width.
2. Query/filter controls are available in a collapsed utility rail/drawer after loading and do not permanently consume primary analysis space.
3. Desktop, tablet, and phone layouts intentionally reflow; desktop columns never merely compress into unusable widths.
4. The premium dark visual system is consistently applied to shell, board, panels, controls, tabs, status states, and dialogs; light/system preference remains functional.
5. Chess pieces are local licensed/repository assets rather than Unicode glyphs, while equivalent accessible names remain available.
6. All current real data workflows—querying, progress/cancel/retry, diagnostics, cache notices, game selection, opening-tree navigation, analysis, local-data deletion, and recovery from failures—remain intact.
7. Existing keyboard and screen-reader behavior is preserved or improved; drawers/dialogs meet focus-management requirements; no serious or critical axe findings occur in the specified states.
8. No horizontal page overflow occurs at defined phone/tablet/desktop viewports or 200% zoom.
9. Reduced-motion behavior is respected, and all interactive states provide clear hover/active/focus/disabled feedback.
10. The production build, lint, typecheck, component tests, end-to-end tests, and visual/accessibility checks pass for the redesigned revision.

## Out of scope

- Altering Chess.com ingestion APIs, cache formats, graph metrics, engine scoring, or analysis heuristics.
- Adding user accounts, cloud synchronization, collaboration, payments, or server-side persistence.
- Copying Chess.com branding, visual assets, or proprietary interface patterns.
- Redesigning non-workspace test-harness routes except where shared styling must be kept functional.
