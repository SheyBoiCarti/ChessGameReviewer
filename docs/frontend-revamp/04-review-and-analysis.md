# Phase 4: review and analysis implementation plan

> For agentic workers: use `superpowers:executing-plans` when available. Execute tasks in order and track the checkboxes.

**Goal:** Replace the long analyzer stack with separate summary-led Review and move-led Analysis experiences.
**Architecture:** Share existing results, selected ply, and move callbacks between two presentation modes. Add one pure navigation selector; do not change engine computation.
**Tech stack:** Existing React, TypeScript, CSS, local Stockfish pipeline.
**Spec:** [Design contract](./00-design-contract.md).
**Prerequisite:** Phase 3 exit gate passed.
**Global constraints:** No heuristic changes, invented coach explanations, duplicate analysis jobs, schema changes, or live evaluation of variations.

## Task 4.1 — next-mistake selector

Files: create `features/stockfish-analysis/reviewNavigation.ts`, `tests/unit/stockfish-analysis/reviewNavigation.test.ts`.

```ts
import type { GameAnnotation } from './analyzeGame';
export function nextMistakePly(
  annotations: readonly GameAnnotation[],
  selectedPly: number
): number | null {
  return annotations
    .filter(
      (a) =>
        a.ply > selectedPly &&
        a.accuracy.status === 'classified' &&
        ['mistake', 'blunder', 'miss'].includes(a.accuracy.quality)
    )
    .reduce<number | null>((next, a) => (next === null ? a.ply : Math.min(next, a.ply)), null);
}
```

Includes both players' moves. Excludes inaccuracies, forced moves, indeterminate classifications, and unanalysed plies. Does not wrap. Works with unsorted input without mutating it. Button label is **Next mistake**; after the last available mistake it is disabled and supporting text is **No later mistakes in the analysed moves.** Empty result has no button. This copy avoids claiming an incomplete game has no mistakes.

- [ ] Test unsorted eligible plies 9 and 3 from ply 0 -> 3; from 3 -> 9; from 9 -> null. Test inaccuracy and indeterminate exclusion, empty arrays, and input unchanged.
- [ ] Observe failure, implement the selector, then rerun tests.

## Task 4.2 — shared mode and data contract

Files: modify `components/analysis/AnalyzerWorkspace.tsx`, `components/workspace/ChessWorkspace.tsx`, `components/analysis/AnalysisMoveList.tsx`, `components/workspace/WorkspaceTabs.tsx`.

Extend AnalyzerWorkspaceProps:

```ts
mode: import('@/components/workspace/WorkspaceTabs').ReviewMode;
game: import('@/lib/chess/pgnParser').ParsedGame;
players: { white: import('@/lib/api/contracts').PlayerMetadata;
           black: import('@/lib/api/contracts').PlayerMetadata };
isVariationActive: boolean;
onReturnToGame(): void;
```

Keep all existing engine callbacks and result/progress props. Tabs are rendered once, by the contextual shell, not repeated inside the analyzer. Existing `onSelectPly` clears variations before changing game ply. `onReturnToGame` uses the existing variation exit behavior.

Extend AnalysisMoveListProps with `moves: ParsedGame['plies']`. Render all parsed game plies; annotations enrich rows by ply. Do not derive the entire move list from result.annotations, because users must navigate before analysis finishes. `MovePly` has no mover field: derive color from `parseFenSideToMove(move.fenBefore)` and displayed fullmove number from the sixth FEN field. Group rows by that fullmove number, with number column 32px then White/Black cells sharing remaining width. Keep `move.ply` as the callback/selection identity; it is sequential from 1 even for a nonstandard starting FEN. Missing color cell displays em dash and is not interactive. Cells show SAN and classification icon when available; expose evaluation in the accessible name/title rather than a third visible data column. Unanalysed cells say “Not analysed” in their accessible name and never show a zero evaluation. This supports black-to-move starts, non-1 fullmove starts, and odd final plies without changing the parser.

- [ ] Run existing analyzer/move-list tests and establish baseline.
- [ ] Add cases: full move list without result; partial annotations decorate only matching plies; black-to-move first cell; odd last move; clicking a cell passes its exact ply; selected row auto-scrolls inside the list without moving document or stealing focus.
- [ ] Implement the data extensions and single-controller mode composition. No conditional remount of `useWorkspace`.
- [ ] Replace `scrollIntoView` if it scrolls ancestors: calculate selected cell/list bounding rectangles and adjust only the move list's scrollTop. Do not auto-scroll on hover or unrelated progress updates.

## Task 4.3 — Review presentation

Files: create `components/analysis/ReviewFeedback.tsx`, `tests/dom/components/ReviewFeedback.test.tsx`; modify `GameReviewSummaryCard.tsx`, `AnalyzerWorkspace.tsx`, `MoveAccuracyGraph.tsx`, `app/globals.css`.

Review panel order:

1. Shared Review/Analysis tabs (44px high).
2. Compact status/action row; Settings disclosure closed by default.
3. Accuracy summary for White and Black (two equal columns, player initials/name, 32px local estimate, explicit **Local estimate** caption). Missing estimate = em dash plus accessible “Unavailable”. Preserve one decimal place. Optional upstream scores appear below as smaller, separately labeled **Chess.com accuracy** values; never replace local scores or invent an upstream value.
4. Evaluation graph, height 96px, click/keyboard selection preserved. Graph describes evaluations, not accuracy percentages; use visible heading **Evaluation** regardless of the existing component filename.
5. Selected-move feedback with quality badge, played SAN, best SAN, and **Next mistake**. At ply 0: **Select a move to review it.** At an unanalysed selected ply: **This move has not been analysed yet.** Neither state displays another ply's annotation.
6. **Move breakdown** disclosure closed by default. Contains the existing complete classification-count table in REVIEW_MOVE_QUALITIES order; keep all counts and labels.
7. Full grouped move list using remaining panel space; minimum height 176px. In stacked layout max-height 320px.

ReviewFeedback consumes `annotation: GameAnnotation | null`, `selectedPly: number`, `startFen?: string`, `nextMistake: number | null`, `onSelectPly(ply:number):void`, and `hasAnnotations:boolean`. Convert best move from annotation.before.bestMove using existing SAN conversion and the selected ply's fenBefore. If conversion fails, show “Best move unavailable”; raw UCI belongs in Engine details, not the user-facing best-move line. Feedback text for a classified move: **{SAN} — {quality label}**. For indeterminate accuracy: **Move quality unavailable**. Do not generate tactical explanations from evaluation differences.

Summary/feedback layout uses surface spacing and separators, not nested rounded cards. On desktop the contextual panel is a grid with tabs/status fixed and a vertically scrollable body. The move list height is `clamp(176px, 30dvh, 320px)`; on stacked layouts it is `min(320px, natural list height)`. Expanding breakdown scrolls the body without changing the list's height. No content is clipped or hidden to enforce the preferred panel height.

- [ ] Add feedback tests for selected annotation, null/missing annotation, indeterminate accuracy, SAN fallback, and next-mistake invocation/disabled state.
- [ ] Extend summary props with players; preserve upstream/local-label tests and partial-coverage text. Visible partial label: **Partial review: {analyzedPlies}/{totalPlies} positions analysed**.
- [ ] Implement ordered Review sections; no graph/summary shell containing fake values before annotations exist. Before results, show the idle state from Task 4.5 and full move list.
- [ ] Verify graph and move-list selections update the same board ply and feedback without launching analysis.

## Task 4.4 — Analysis presentation and variations

Files: modify `AnalyzerWorkspace.tsx`, `EngineAnnotationPanel.tsx`, `PrincipalVariationList.tsx`, `VariationSandboxBanner.tsx`, `ChessWorkspace.tsx`, `app/globals.css`.

Analysis panel order: tabs; status/action row and Settings disclosure; selected-move annotation with best move and existing principal variations; full move list occupying remaining height; Evaluation graph height 80px at bottom. No large accuracy summary or breakdown in Analysis mode.

Settings disclosure contains existing Quick/Balanced/Deep choices plus existing Engine details. Depth/build/heuristic identifiers stay in Engine details. Selected ply 0 has “Select a move to inspect its analysis.” Missing annotation has “This move has not been analysed yet.” Existing principal variation exploration uses correct associated FEN and UCI sequence, unchanged.

While variation active: show existing variation breadcrumb/step/return controls; replace original-game annotation area with **Exploring a variation** and **Return to game**. Hide original-game eval bar/arrow/classification badge, and visibly label the graph and list **Original game**. Clicking a game move/graph point returns to original game at that ply. Switching to Review exits variation; switching games clears it. Do not display fabricated sandbox evaluations or run additional engine jobs.

- [ ] Add cases for mode changes preserving ply/results, variation entry/exit, graph/list returning to game, and hidden stale evaluation overlays.
- [ ] Recompose existing annotation/PV controls in the specified order and collapse engine details by default.
- [ ] Verify selected-move and next-position arrows are not interchanged. The board at selected ply is fenAfter; the existing next-position suggestion uses annotation.after.pv. The feedback's best alternative to the played move uses annotation.before.bestMove and fenBefore. Do not draw a before-position best-move arrow on the after-position board.

## Task 4.5 — engine lifecycle UI

Use the existing status/result/capability values; introduce no parallel job state.

| Status                           | Action and presentation                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| probing or capability unresolved | “Checking analysis engine…”; Run review disabled                                                                                                       |
| idle and capability available    | “Ready to review”; primary Run review; use existing selected strength                                                                                  |
| running                          | “Analysing {done} of {total} positions”; Cancel analysis; disable strength changes; keep move navigation enabled                                       |
| partial or cancelled             | “Partial review”; Resume analysis; show available annotations and coverage                                                                             |
| failed                           | Existing error plus “Completed positions remain available.”; Retry analysis calls onStart(strength); preserve available result                         |
| complete                         | “Review complete”; secondary Run again; never automatically rerun                                                                                      |
| unavailable                      | Existing engine reason via EngineStatus; “Analysis is unavailable on this device.”; no enabled start/resume button; move navigation remains functional |

Capability unavailability wins over action enablement for every status. Complete/failed/partial results remain visible if the capability later becomes unavailable. Progress with total 0 is indeterminate. Cache write warnings remain visible with existing meaning. No new strength default; preserve the current preference and engine presets.

- [ ] Add/update analyzer tests covering every lifecycle row, action callback count/arguments, and missing capability.
- [ ] Implement compact lifecycle row and persistent partial/error/cache notices.
- [ ] Verify navigating modes or Settings during a running job never launches a second job. Preserve current controller behavior when selecting another game.

## Acceptance and checks

```powershell
npx vitest run tests/unit/stockfish-analysis tests/dom/components/AnalyzerWorkspace.test.tsx tests/dom/components/AnalysisMoveList.test.tsx tests/dom/components/ReviewFeedback.test.tsx tests/dom/components/VariationSandboxBanner.test.tsx tests/dom/workspace
npx playwright test tests/e2e/workspace.spec.ts tests/e2e/workspace-responsive.spec.ts tests/e2e/workspace-accessibility.spec.ts --project=chromium
npm run verify
```

Use existing DOM controller/service injection and fixture helpers to test lifecycle states deterministically. Add `tests/dom/components/GameReviewSummaryCard.test.tsx` for player/local/upstream/partial presentation. Do not add a public query parameter or production-only mock route for screenshots.

Exit gate: both modes have specified content/order; raw game moves are usable without analysis; exact ply synchronization works; next-mistake behavior is deterministic; partial/error/unavailable states are honest; variations show no stale score; existing engine/domain tests and full verification pass. Record every intentional move-list, status-copy, summary, and snapshot contract change.
