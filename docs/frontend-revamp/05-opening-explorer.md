# Phase 5: opening explorer implementation plan

> For agentic workers: use `superpowers:executing-plans` when available. Execute tasks in order and track the checkboxes.

**Goal:** Present opening choices as compact moves with game counts and outcome bars.
**Architecture:** Reuse graph navigation, aggregate outcomes, existing sorting, breadcrumbs, and move-order dialog. Change the table presentation without changing statistical meaning.
**Tech stack:** Existing React, TypeScript, CSS and opening graph selectors.
**Spec:** [Design contract](./00-design-contract.md).
**Prerequisite:** Phase 4 exit gate passed.
**Global constraints:** No new opening database, fabricated opening names, graph filters, aggregation changes, or schema changes.

## Task 5.1 — outcome bar

Files: create `components/tree/OutcomeBar.tsx`, `tests/dom/components/OutcomeBar.test.tsx`; modify `components/tree/OpeningTreeTable.tsx`, `app/globals.css`.

```ts
export function OutcomeBar(props: {
  breakdown: import('@/features/opening-tree/selectors').OutcomeBreakdown;
  perspective: import('@/features/opening-tree/selectors').OutcomePerspective;
}): React.JSX.Element;
```

Get aggregate for a candidate from `node.outgoing.get(candidate.uci)!.aggregate`; call existing `selectOutcomeBreakdown(aggregate, perspective)`. Do not recompute ratios from rounded display percentages or substitute expected score for win rate.

Bar height 12px, radius 3px, flex row, segment widths `100 * (rate ?? 0)%`. User perspective order: wins green `#81b64c`, draws gray `#96938b`, losses red `#c95555`. Board perspective order: White wins `#eeeed2`, draws gray, Black wins `#45423d`; outer strong border makes extreme colors visible. Labels under bar show rounded whole percentages separated by “ / ”. Accessible name includes exact counts and perspective: “User wins 3, draws 2, losses 5, from 10 games” or “White wins 3, draws 2, Black wins 5, from 10 games”. Segment visual percentages can round to a total other than 100; widths always use unrounded fractions. Sample size 0: empty neutral track, label **No games**, no NaN/Infinity widths.

- [ ] Test 3/2/5 produces 30/20/50% widths and correct counts; both perspectives; zero sample; a thirds split keeps fractional widths. Tests protect aggregate meaning, not arbitrary pixel styling.
- [ ] Implement OutcomeBar and wire the existing selector. Existing selector unit tests remain unchanged unless a real defect is discovered independently.

## Task 5.2 — compact candidate table and details

Files: modify `components/tree/OpeningTreeTable.tsx`, `components/tree/PathBreadcrumbs.tsx`, `components/tree/MoveOrderDialog.tsx`, `components/opening/UnobservedMoveNotice.tsx`, `app/globals.css`; update corresponding DOM/E2E tests.

Panel order: heading **Openings**; one-line breadcrumb; labeled Sort candidate moves select with existing three options; candidate table; **More statistics** disclosure; **View move orders** action. Resource-limit/exclusion notices appear immediately after heading if applicable, with diagnostic codes inside a Details disclosure. Put opening-horizon explanation in More statistics; do not delete it.

Primary table columns: **Move** (64px), **Games** (56px, right aligned), **Results** (remaining width). Each row minimum 56px, SAN button min-height 44px, counts tabular. Navigation is triggered only by native SAN button; do not make the entire table row a fake button. Accessible button name remains candidate SAN plus game count. Table is semantically labeled **Opening candidates**. Sticky header only in desktop scroll region. In stacked layout, natural height up to 12 rows, then max-height 672px with scroll and accessible region label **Opening candidate results**.

More statistics contains existing full statistical table with current win rate, expected score, draw rate, average opponent rating, and sample size. It uses the same sorted candidates and selected perspective. It may scroll horizontally inside a labeled **Detailed opening statistics** region; the document itself must not overflow. Distinguish expected score from win rate in headings and preserve sample size.

Breadcrumb root label **Starting position**. Each subsequent move retains existing navigation callback and SAN. Use a single horizontally scrollable line with selected position visible; keep ancestors reachable, not removed with an ellipsis. Do not create full opening names from move sequences.

Empty states: no graph follows the design contract; graph node with no candidates shows **No further moves in these games.** If graph horizon is reached, show **Opening depth limit reached. Increase the opening depth in Game filters and import again.** Determine horizon using existing navigation/path data; if the terminal reason cannot be distinguished from current data, use the generic no-further-moves message, not an invented limit diagnosis. Preserve unobserved-position notice and Return behavior when the user plays an absent move.

- [ ] Run existing opening table/dialog/unobserved tests before changes.
- [ ] Test candidate click navigates to correct position/path; sorting retains defined order; perspective changes bar counts/colors/accessible labels; More statistics preserves exact source metrics; root breadcrumb returns to root.
- [ ] Implement compact table, disclosures, breadcrumb, and exact labels. Preserve move-order dialog's existing sort and path semantics.
- [ ] Verify the View move orders button remains disabled during an unobserved board move, and dialog close restores its trigger.
- [ ] Check 20 candidate rows, long breadcrumb, one-sided outcome bars, resource-limited graph, excluded games, and both orientations.

## Acceptance and checks

```powershell
npx vitest run tests/unit/opening-tree tests/dom/components/OutcomeBar.test.tsx tests/dom/components/OpeningTreeTable.test.tsx tests/dom/components/MoveOrderDialog.test.tsx tests/dom/components/UnobservedMoveNotice.test.tsx tests/dom/workspace/boardOrientationInvariants.test.tsx
npx playwright test tests/e2e/workspace.spec.ts tests/e2e/workspace-responsive.spec.ts tests/e2e/workspace-accessibility.spec.ts --project=chromium
npm run verify
```

Exit gate: compact opening display fits 340px panel, result bars agree with aggregate counts for both perspectives, all original statistics remain accessible, board/path/move-order behavior works, and full verification passes. Log intentional table-label, column, breadcrumb, and opening snapshot changes.
