# Phase 2: board presentation implementation plan

> For agentic workers: use `superpowers:executing-plans` when available. Execute tasks in order and track the checkboxes.

**Goal:** Give the board a coherent player surround and compact playback controls while preserving chess interaction.
**Architecture:** Restyle and reorganize the existing ChessboardView; preserve board props, position functions, move handlers, and variation engine.
**Tech stack:** Existing React, TypeScript, CSS, chess.js and piece SVG assets.
**Spec:** [Design contract](./00-design-contract.md).
**Prerequisite:** Phase 1 exit gate passed.
**Global constraints:** No new board renderer, asset downloads, evaluation math, board mechanics, or live sandbox evaluation.

## Task 2.1 — player strips and board frame

Files: modify `components/board/ChessboardView.tsx`, `app/globals.css`; create `components/board/PlayerStrip.tsx` and `tests/dom/components/PlayerStrip.test.tsx`.

```ts
export function PlayerStrip(props: {
  player: import('@/lib/api/contracts').PlayerMetadata;
  color: 'white' | 'black';
}): React.JSX.Element;
```

Strip height 40px, transparent background, 32px initials avatar, 8px gap, username 14px semibold, rating 12px muted. Color dot 8px with contrasting border and accessible text “White”/“Black”. Player above the board is Black when White is at bottom, White when Black is at bottom. Missing player metadata uses the design fallback. Do not render clocks or fabricated captured-piece counts.

- [ ] Run ChessboardView and orientation-invariant tests before editing.
- [ ] Test orientation reverses player placement; missing names/ratings and nonalphanumeric names use fixed fallbacks; long names retain full accessible text.
- [ ] Place top player strip, board/evaluation row, bottom player strip, playback row in that DOM order. Use 8px gaps. The move controls must no longer separate the board from its bottom player.
- [ ] Remove the decorative gradient/thick padded frame. Board frame has no padding, 4px radius, clipped square background but unclipped external keyboard focus ring, and no shadow. Apply exact square colors from the design contract.
- [ ] Keep existing piece SVGs, last-move highlights, legal-destination markers, coordinate labels, and selection indicators. Check they remain visible on both new square colors.

## Task 2.2 — playback and evaluation surround

Files: modify `components/board/MoveHistoryControls.tsx`, `components/board/EvaluationBar.tsx`, `components/board/ChessboardView.tsx`, `app/globals.css`; reuse AppIcon.

Preserve MoveHistoryControls' currentPly/totalPlies/onPlyChange API. Add optional `onFlipOrientation?: () => void` so the flip action can be inside the same toolbar. Toolbar order: First position, Previous move, position label, Next move, Last position, Flip board. All icons 20px in 44px controls. Label uses remaining flexible width and `min-width:0`; below 320px place the position label on a single line above the controls and allow horizontal scrolling of controls inside the toolbar. At >=320px the entire toolbar fits one 44px row, with no wrapping. Toolbar width uses the whole board group (including the reserved evaluation slot), not just the square grid.

Visible position label: **Start** at ply 0; otherwise `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'} / ${Math.ceil(totalPlies / 2)}`. Accessible label retains exact detail: “Position {ply} of {totalPlies}”. Do not rename accessible playback buttons. Flip is disabled/absent if no callback, and never navigates the game.

- [ ] Test first/previous disabled at 0; next/last disabled at end; callbacks receive clamped valid ply; odd and even ply labels differ; flip calls only its callback.
- [ ] Implement one toolbar and remove the detached Flip board button above the board.
- [ ] Style evaluation bar width 20px, radius 2px, aligned to square grid only (not player strips), with 8px gap. Keep existing evaluation formatting and white/black orientation behavior. Reserve the slot when no score exists; show no invented 0.0 score.
- [ ] Keep variation/unobserved-position notices compact. In desktop normal-height mode, additional notice content beyond the chrome budget must flow below the board group and may use document scroll; never shrink the board below its specified formula or hide the notice.
- [ ] Verify variation hides original-game evaluation/badge/arrow; preserve current game return position and orientation.

## Acceptance and checks

Run:

```powershell
npx vitest run tests/dom/components/ChessboardView.test.tsx tests/dom/components/InteractiveChessboard.test.tsx tests/dom/components/PromotionDialog.test.tsx tests/dom/components/PlayerStrip.test.tsx tests/dom/workspace/boardOrientationInvariants.test.tsx tests/unit/board
npx playwright test tests/e2e/workspace-responsive.spec.ts tests/e2e/workspace-accessibility.spec.ts --project=chromium
npm run verify
```

Add `tests/dom/components/MoveHistoryControls.test.tsx` for the specified controls and run it. Inspect board dimensions with bounding boxes at all required viewports; for desktop normal-height mode the square-side formula tolerance is 2px. Board width and height differ by at most 1px. Inspect promotion, keyboard selection, last-move and classification overlays in both orientations.

Exit gate: readable players, specified board/frame dimensions, compact playback, no board mechanics regression, no stale variation score, accessible keyboard/promotion flow, and phase verification passes. Log intentional board/player/toolbar snapshot changes.
