# Analyzer Workspace Layout Implementation Spec

**Status:** Planning only  
**Source of truth:** `C:\Users\sheha\OneDrive\Desktop\report.md`, Issue 2  
**Cross-spec sequence:** Spec 2 of 4

## 1. Objective

Make the desktop analyzer a viewport-bounded contextual column with deliberate internal scrolling, while preserving natural document flow on mobile. Restructure move analysis so the UI renders a bounded move list and one selected-move detail instead of every large annotation panel simultaneously.

## 2. Current behavior

- `components/analysis/AnalyzerWorkspace.tsx` renders the review summary, accuracy graph, a full move table, and an `EngineAnnotationPanel` for every analyzed ply.
- `components/analysis/MoveAccuracyGraph.tsx` owns both the SVG graph and a complete annotation table.
- For the investigated 41-ply game, 41 full annotation panels are mounted below the other analyzer content.
- The desktop context grid column in `components/workspace/WorkspaceLayout.tsx` and `app/globals.css` has no viewport-relative block-size limit and no vertical scroll container.
- At 1920×958, the measured board was about 721 px tall while the analyzer reached about 19,158 px and the document about 19,502 px. Horizontal overflow was zero.
- Mobile currently uses the single-column breakpoint and natural page scrolling.

## 3. Root cause

This is vertical content expansion, not horizontal width overflow. The grid/flex widths, board size, margins, and padding are not the primary defect.

Two behaviors combine:

1. The desktop contextual column is unconstrained in the block direction, so it grows to fit all descendants.
2. `AnalyzerWorkspace` eagerly renders one large `EngineAnnotationPanel` per ply in addition to the graph's full annotation table.

CSS cannot create a useful scroll area without a bounded ancestor, and merely adding `overflow: hidden` would discard access to content. The fix requires both a desktop height boundary and a lower-cardinality analyzer composition.

## 4. Desired behavior

Desktop:

- The board and context column remain visually paired within the usable viewport height.
- The context column has an explicit maximum block size derived from the existing workspace chrome allowance and scrolls vertically when needed.
- The move list has its own bounded region and exposes every move through scrolling.
- Only the currently selected move's detailed annotation panel is rendered.
- Selecting a graph point or move-list row updates the existing selected ply and the detail panel.

Mobile/tablet at the existing single-column breakpoint:

- The context column returns to natural height and document scrolling.
- No nested full-column scroll trap is introduced.
- The move list remains bounded so long games do not create thousands of pixels of rows before the selected detail.
- No content is clipped or hidden.

## 5. Scope

- Desktop contextual-column block sizing and scrolling.
- Responsive reset at the existing `64rem` single-column breakpoint.
- Split the graph visualization from move-list presentation.
- Add a bounded move list with accessible selected state.
- Render exactly zero or one selected-move detail panel.
- Thread the existing selected ply into the analyzer component.
- Maintain selection synchronization between move navigation, graph, list, board, and detail.
- Add component, responsive end-to-end, and accessibility regression coverage.

## 6. Out of scope

- Hiding overflow, truncating analysis, or removing access to moves.
- Virtualization; the investigated game and expected game sizes do not justify its complexity yet.
- Redesigning engine annotations, changing analysis semantics, or changing move classifications.
- Player rows and the Flip board control from Spec 4.
- Changing the board's viewport sizing formula unless verification exposes a separate defect.
- Creating a new global workspace state model.

## 7. Affected files/components

Confirmed production boundaries:

- `components/analysis/AnalyzerWorkspace.tsx`
- `components/analysis/MoveAccuracyGraph.tsx`
- `components/analysis/EngineAnnotationPanel.tsx` (usage/cardinality; content changes are not required)
- `components/workspace/ChessWorkspace.tsx`
  - existing `state.selection.ply`
  - `LazyAnalyzerWorkspace` props
  - existing `onSelectPly` callback
- `components/workspace/WorkspaceLayout.tsx`
- `app/globals.css`
  - `.workspace-shell`
  - `.workspace-layout`
  - `.workspace-layout__context`
  - `.analyzer-workspace`
  - existing `max-width: 64rem` responsive rules

Recommended new focused component:

- `components/analysis/AnalysisMoveList.tsx`

Expected tests:

- existing analysis DOM tests, including `AnalyzerWorkspace.test.tsx` and `MoveAccuracyGraph` tests
- `tests/e2e/workspace-responsive.spec.ts`
- existing workspace accessibility and visual suites
- `tests/e2e/workspaceFixtures.ts` or the fixture module currently used by those tests

## 8. Data model/state changes

No persisted data or reducer schema changes are required.

Component contract change:

- Add `selectedPly: number` to `AnalyzerWorkspace` and its lazy wrapper.
- Keep `onSelectPly(ply)` as the only selection mutation path.
- Derive `selectedAnnotation` inside `AnalyzerWorkspace` from `annotations` and `selectedPly`.
- Pass the same selected ply and callback to both `MoveAccuracyGraph` and `AnalysisMoveList`.

The authoritative state remains `ChessWorkspace`'s existing `state.selection.ply`; do not add local analyzer selection state that could drift from the board or move navigation.

## 9. Detailed implementation approach

### Desktop context boundary

At a desktop-only min-width query immediately above the existing `64rem` breakpoint, make `.workspace-layout__context` a bounded scroll container:

```css
max-block-size: calc(100dvh - var(--workspace-chrome-height));
min-block-size: 0;
overflow-y: auto;
overscroll-behavior: contain;
scrollbar-gutter: stable;
```

Use the existing `--workspace-chrome-height` variable rather than introducing a second estimate for top-level chrome. Preserve horizontal sizing and do not set `overflow-x: hidden`.

**Design decision — sticky behavior:** Recommended: add `position: sticky; top: 1rem` to the desktop context column so it remains paired with the board while the outer document moves. This matches the existing desktop workspace pattern and makes the viewport boundary useful. Confirm in browser verification that the sticky offset plus calculated maximum does not exceed the viewport. If it does, incorporate the offset into the calculation rather than removing scrolling.

At `max-width: 64rem`, explicitly reset `position`, `top`, `max-block-size`, `overflow-y`, `overscroll-behavior`, and `scrollbar-gutter` so the single-column layout uses document flow.

### Analyzer composition

- Keep `MoveAccuracyGraph` responsible for the SVG and graph interaction only. Remove its full annotation table.
- Add `AnalysisMoveList`, rendering one compact interactive row per annotation with ply/move number, played SAN, evaluation label, and primary classification badge.
- Give the move-list viewport a named CSS class and a concrete responsive bound, recommended `max-block-size: clamp(12rem, 32dvh, 22rem); overflow-y: auto;`. This is deliberately smaller than the entire context so the selected detail remains reachable.
- Use buttons or the project's established interactive-row pattern. Mark the selected row with `aria-current="true"` or the equivalent listbox semantics used consistently throughout the component; do not mix incompatible patterns.
- Render a single `EngineAnnotationPanel` for the annotation whose `ply` equals `selectedPly`.
- If `selectedPly` is `0` or no annotation exists, show a compact instruction/empty state. Do not silently advance the chess position to the first analyzed move.
- When the selected ply changes outside the list, scroll the selected move row into view with `block: "nearest"`. Avoid forced smooth scrolling, which is disruptive during keyboard navigation.
- Keep graph and list selection callbacks routed through `onSelectPly`.

**Design decision — graph accessibility:** Recommended: make the compact move list the graph's accessible data representation and connect the graph to it with descriptive IDs. Avoid retaining an invisible duplicate table containing all moves, because that recreates redundant screen-reader content and test ambiguity.

## 10. Step-by-step implementation tasks

1. Add a long-game analyzer fixture with at least the investigated 41-ply scale.
2. Write a failing `AnalyzerWorkspace` test asserting 41 compact move rows but at most one `EngineAnnotationPanel`.
3. Write selection tests for ply `0`, a selected analyzed ply, and a selection triggered from the list.
4. Extract/add `AnalysisMoveList` and move the full annotation-table responsibility out of `MoveAccuracyGraph`.
5. Add the `selectedPly` prop through `LazyAnalyzerWorkspace` and `ChessWorkspace`.
6. Derive and render only the selected annotation detail.
7. Add move-list CSS with its bounded vertical viewport and selected/focus styles.
8. Add desktop-only context-column sizing, scrolling, and recommended sticky positioning.
9. Add the complete mobile responsive reset.
10. Update graph accessibility relationships and remove duplicate accessible data.
11. Extend responsive E2E tests at 1920×958 and representative mobile widths.
12. Run component, accessibility, responsive, visual, type, and full test verification.

## 11. Testing strategy

Component tests:

- Long analysis renders all compact move rows and no more than one detail panel.
- `selectedPly === 0` renders the instruction state and does not mutate selection.
- A valid selected ply renders its exact annotation.
- Clicking a move row calls `onSelectPly` with the expected ply.
- Changing selected ply updates the selected row and detail.
- Graph selection still calls the same callback.
- The graph no longer renders a second full move table.

Responsive E2E tests:

- At 1920×958, context `clientHeight` is no greater than the usable viewport boundary and `scrollHeight > clientHeight` for a long game.
- The context can be scrolled to the final move and selected detail without scrolling the document through ~19,000 px.
- The board remains visible and reasonably paired while the context scrolls.
- `document.documentElement.scrollWidth === clientWidth`; the vertical fix introduces no horizontal regression.
- At the existing mobile breakpoint, context overflow is `visible`/natural, its max block size is reset, and the document can reach all content.
- The bounded move list is independently scrollable at desktop and mobile.

Accessibility tests:

- Every row has an accessible move/classification name.
- Selected state is programmatically exposed.
- Keyboard users can enter, navigate/click, and leave the list without a scroll trap.
- The graph has a useful name/description and does not duplicate all annotations in the accessibility tree.
- Focus remains visible inside both scroll containers.

## 12. Regression cases

- No selected game, analysis not started, analysis in progress, completed analysis, and analysis error states.
- Ply `0`, first ply, middle ply, and final ply.
- Short games whose context content does not need scrolling.
- Long games with long SAN, mate evaluations, and long PV text.
- Browser zoom and increased default font size.
- Short desktop viewport, 1920×958 reference viewport, single-column tablet, and narrow phone.
- Keyboard move navigation updates the visible detail without requiring a list click.
- Variation mode/current move remains synchronized because selection authority is unchanged.
- No content is made unreachable by nested scrolling.

## 13. Migration/versioning considerations

There is no data migration, normalizer bump, engine cache bump, or reducer migration. This is component composition and responsive CSS only.

Snapshot and visual baselines will intentionally change because the analyzer no longer shows every detailed panel at once. Update baselines only after DOM and measurement assertions confirm the new layout, not as a substitute for those assertions.

## 14. Dependencies

- Can be implemented after Spec 1 without a code dependency.
- Must be completed before Spec 4 adds player rows and a board-adjacent control; otherwise the extra board chrome can obscure whether the overflow fix is correct.
- Spec 3 may change annotation labels and badges. This spec should keep its list row driven by the existing annotation type so later classification changes remain localized.
- Uses existing `state.selection.ply` and reducer behavior; no dependency on orientation work.

## 15. Risks and edge cases

- A viewport-bound context plus a bounded list creates nested vertical scroll regions. Keep the list visibly bounded and the outer context scrollable, use `overscroll-behavior` carefully, and verify keyboard/touch behavior.
- Sticky elements inside transformed or overflow ancestors can stop behaving as expected. Verify the actual `WorkspaceLayout` ancestor chain before finalizing sticky CSS.
- `100vh` is unreliable on mobile; the bound is desktop-only and uses `dvh`, while mobile resets to natural flow.
- Removing the graph's table can reduce accessibility if the replacement list is not properly associated and labeled.
- Auto-scrolling selected rows can fight user scrolling. Use `nearest` only when selection actually changes.
- Long PV strings must wrap inside the detail panel; do not add horizontal clipping to solve them.
- A hard-coded pixel height would age poorly. The proposed clamp is only for the inner move list; the contextual-column limit derives from the existing workspace variable.

## 16. Acceptance criteria

- The 1920×958 reproduction no longer produces an approximately 19,000 px analyzer/document solely from repeated annotation panels.
- Desktop context height is bounded to the usable viewport and vertically scrollable when its content exceeds that bound.
- Mobile uses natural page flow with no full-context scroll trap.
- All move annotations remain reachable through a bounded move list.
- At most one `EngineAnnotationPanel` is rendered, matching the selected ply.
- Graph, list, board navigation, and selected detail remain synchronized through the existing selection state.
- No horizontal overflow is introduced and no content is hidden.
- Responsive, component, accessibility, visual, and type checks pass.

## 17. Recommended implementation order

Within this spec: create the long-game regression first, restructure analyzer rendering, thread selection, then add the height/scroll CSS and verify responsive/accessibility behavior.

Across all specs: implement second, after the focused ingestion fix and before player rows/board controls. Spec 3 can follow independently after the UI and metadata sequence is stable.
