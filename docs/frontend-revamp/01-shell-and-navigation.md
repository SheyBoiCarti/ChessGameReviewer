# Phase 1: shell and navigation implementation plan

> For agentic workers: use `superpowers:executing-plans` when available. Execute tasks in order and track the checkboxes.

**Goal:** Replace the duplicated header and global tabs with responsive navigation and a two-column workspace.
**Architecture:** Keep `ChessWorkspace` and its controller mounted; change presentation composition only. Introduce stateless navigation/icons and make import a modal drawer.
**Tech stack:** Existing Next.js, React, TypeScript, plain CSS.
**Spec:** [Design contract](./00-design-contract.md), sections 1–6.
**Global constraints:** No new dependencies, routes, persistence, engine changes, or automatic analysis. Preserve system/light/dark, accessibility, and pre-existing edits.

## Task 1.1 — tokens and interface icons

Files: modify `app/globals.css`; create `components/ui/AppIcon.tsx`.

Interface:

```ts
export type AppIconName =
  | 'games'
  | 'review'
  | 'openings'
  | 'settings'
  | 'info'
  | 'menu'
  | 'close'
  | 'import'
  | 'first'
  | 'previous'
  | 'next'
  | 'last'
  | 'flip';
export function AppIcon(props: { name: AppIconName; className?: string }): React.JSX.Element;
```

Icons use `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, stroke width 2, rounded caps/joins, `aria-hidden="true"`, `focusable="false"`. Use familiar shapes: list for games, magnifier for review, branching lines for openings, gear for settings, circled i, three menu lines, X, downward arrow into tray, chevrons with end bars, opposing vertical arrows for flip. Parent controls supply accessible names. Icons are never clickable on their own.

- [ ] Apply the exact design token table and typography. Alias old gold tokens to semantic green tokens temporarily so existing controls remain usable during this phase.
- [ ] Add the icons. Replace toolbar/menu Unicode interface symbols only; retain chess-piece and classification assets.
- [ ] Inspect light/dark button, input, focus, and disabled states. Disabled controls use `opacity: .5` and native disabled behavior; do not change text to an unreadable color.

## Task 1.2 — navigation and compact header

Files: create `components/workspace/WorkspaceNavigation.tsx`; modify `app/page.tsx`, `components/workspace/AppTopBar.tsx`, `components/workspace/ChessWorkspace.tsx`, `components/workspace/WorkspaceTabs.tsx`, `app/globals.css`.

Interfaces:

```ts
// Retain WorkspaceTab = 'games' | 'opening' | 'analysis' | 'settings'.
export type ReviewMode = 'review' | 'analysis';
// WorkspaceNavigation: selected: WorkspaceTab; onSelect(tab: WorkspaceTab): void;
// onOpenAbout(): void. The shell owns drawer visibility.
// WorkspaceTabs: selected: ReviewMode; onSelect(mode: ReviewMode): void.
```

`AppTopBar` receives current view title, menu-open callback, import-open callback, and trigger refs needed for focus restoration. Preserve ProductInformation integration; remove its old children-wrapper responsibility if the new shell composes children directly. The single header is the banner named “Local Chess Game Reviewer”; view heading is its visible h1. ProductInformation keeps the full unaffiliated/local-data text and is opened by About.

- [ ] Run existing AppTopBar and WorkspaceTabs DOM tests and read actual failures before changes.
- [ ] Add navigation behavior cases: all four view labels map to existing tab values; active global view uses aria-current; global buttons are not tabs; Menu selection closes drawer and focuses h1.
- [ ] Replace duplicate header markup and add wide/collapsed/stacked navigation exactly at the design breakpoints.
- [ ] Move Settings outside board composition. Its existing preferences and data deletion controls must remain reachable.
- [ ] Introduce ReviewMode state in `ChessWorkspace`. For this phase both modes render the existing analyzer body, with a visible current mode heading; Phase 4 replaces the bodies. Mark this temporary composition explicitly in the implementation log. Do not duplicate engine mounts or calls. Apply the design contract's per-view board interaction rules now.
- [ ] Convert WorkspaceTabs to the two review modes and update its keyboard tests. Global navigation remains available during engine work.

## Task 1.3 — workspace grid and modal import

Files: modify `components/workspace/WorkspaceLayout.tsx`, `components/workspace/UtilityRail.tsx`, `components/workspace/ChessWorkspace.tsx`, `app/globals.css`; reuse `components/workspace/ProductInformation.tsx` focus utilities.

Keep WorkspaceLayout's board/panel composition; remove the permanent utility grid track. UtilityRail retains `open`, `onOpenChange`, `returnFocusRef`, and `children`; it always renders a modal when open. Drawer width `min(400px, 100vw)`, right aligned, height 100dvh, internal scroll, 16px padding, backdrop black at 45%. Accessible dialog name is **Import games**. Add backdrop dismissal only when the backdrop itself is the event target. Close button name **Close import games**.

- [ ] Run UtilityRail, workspace responsive, and accessibility tests before changes. Existing automatic mobile drawer expectations will intentionally change.
- [ ] Set initial modal state closed. Before any games have loaded, render the existing query form inline in the Games panel. Do not mount another form in a hidden drawer. When Import is opened, move the form into the drawer and show an inline “Import is open” status in its previous location.
- [ ] Implement the layout dimensions and short-window override in the design contract. This phase can use the existing board chrome; Phase 2 finalizes its 140px budget.
- [ ] Remove viewport-dependent import completion behavior. On complete/partial results with at least one game, close modal, navigate Games, and focus Games heading (`tabIndex=-1`). On empty/failed/cancelled keep the form visible and focus its result status. Inline completion follows the same destination rule without modal restoration.
- [ ] Preserve Escape/focus-trap/background-inert behavior and prevent simultaneous Menu/Import/About modals.
- [ ] Remove obsolete layout selectors only when their JSX consumers have been removed. Do not append contradictory overrides at the end of CSS.

## Acceptance and checks

Run:

```powershell
npx vitest run tests/dom/components/AppTopBar.test.tsx tests/dom/components/WorkspaceTabs.test.tsx tests/dom/components/UtilityRail.test.tsx tests/dom/workspace
npx playwright test tests/e2e/workspace-responsive.spec.ts tests/e2e/workspace-accessibility.spec.ts --project=chromium
npm run verify
```

Add `tests/dom/components/WorkspaceNavigation.test.tsx` and include it in targeted execution. Update E2E helpers in this phase only as necessary for new navigation/modal accessibility names; Phase 3 owns date-preset changes.

Exit gate: one banner, reachable navigation in all three width regimes, no permanent import column, no duplicate form IDs, correct focus after modal close/navigation/import, settings fully operational, and phase verification passes. Snapshot changes must show only shell/token/layout changes and be inspected/logged.
