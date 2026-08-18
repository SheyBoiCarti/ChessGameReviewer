# Spec 2: Analyzer Workspace Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the desktop analyzer workspace into a viewport-bounded, sticky, vertically-scrolling contextual column with a dedicated bounded move list and single selected-move detail panel, preventing document height explosion while preserving natural mobile scrolling.

**Architecture:** 
- Extract move-table responsibilities out of `MoveAccuracyGraph` into a new, focused `AnalysisMoveList` component with bounded internal scrolling and accessible selection.
- Thread `selectedPly` from `ChessWorkspace` (`state.selection.ply`) into `AnalyzerWorkspace` so only the currently selected move's `EngineAnnotationPanel` is rendered (or an instruction prompt when ply is 0).
- Update `app/globals.css` with desktop context block-size constraints, sticky positioning, move-list viewport bounds, and clean responsive resets at the 64rem breakpoint.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Vitest, Testing Library, Playwright, Vanilla CSS.

## Global Constraints

- Source spec: `docs/superpowers/specs/2026-08-17-spec-2-analyzer-workspace-layout-implementation-spec.md`
- No data migrations or reducer schema changes; use existing `state.selection.ply` and `onSelectPly`.
- No horizontal scroll clipping or `overflow-x: hidden` fixes.
- Desktop context column bounded by `calc(100dvh - var(--workspace-chrome-height))` and sticky at `top: 1rem`.
- Mobile at `<= 64rem` resets to natural document flow with no full-column scroll trap.
- Single `EngineAnnotationPanel` rendered at any time for the active `selectedPly`.
- Accessible SVG graph linked to the move list; no duplicate full tables.

---

### Task 1: Long-Game Test Fixture & Failing DOM Tests for Analyzer Workspace & AnalysisMoveList

**Files:**
- Create: `tests/fixtures/longAnalysisFixture.ts`
- Create: `tests/dom/components/AnalysisMoveList.test.tsx`
- Modify: `tests/dom/components/AnalyzerWorkspace.test.tsx:1-189`

**Interfaces:**
- Produces: `createLongGameAnalysisResult(plyCount?: number): GameAnalysisResult`
- Consumes: `GameAnalysisResult`, `GameAnnotation` from `@/features/stockfish-analysis/analyzeGame`

- [ ] **Step 1: Create long-game analysis test fixture**

Create `tests/fixtures/longAnalysisFixture.ts` with a helper generating 41+ realistic analyzed plies:

```typescript
import type { GameAnalysisResult, GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import type { MoveQuality } from '@/lib/engine/accuracy';

const SAMPLE_MOVES = [
  'e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6',
  'Be3', 'e5', 'Nb3', 'Be6', 'f3', 'Be7', 'Qd2', 'O-O', 'O-O-O', 'Nbd7',
  'g4', 'b5', 'g5', 'b4', 'Ne2', 'Ne8', 'f4', 'a5', 'f5', 'a4',
  'Nbd4', 'exd4', 'Nxd4', 'b3', 'Kb1', 'bxc2+', 'Nxc2', 'Bb3', 'axb3', 'axb3', 'Na3'
];

export function createLongGameAnalysisResult(plyCount = 41): GameAnalysisResult {
  const annotations: GameAnnotation[] = [];
  for (let ply = 1; ply <= plyCount; ply++) {
    const san = SAMPLE_MOVES[(ply - 1) % SAMPLE_MOVES.length]!;
    const isWhite = ply % 2 === 1;
    const quality: MoveQuality = ply % 7 === 0 ? 'blunder' : ply % 5 === 0 ? 'mistake' : ply % 3 === 0 ? 'good' : 'excellent';
    annotations.push({
      ply,
      san,
      uci: `${san.toLowerCase().replace(/[^a-h1-8]/g, '').padEnd(4, '1')}`,
      mover: isWhite ? 'white' : 'black',
      before: {
        score: { kind: 'cp', value: 20 },
        depth: 14,
        pv: [san],
        bestMove: san,
        candidates: [],
      },
      after: {
        score: { kind: 'cp', value: isWhite ? 25 : -25 },
        depth: 14,
        pv: [san],
        bestMove: san,
        candidates: [],
      },
      accuracy: {
        status: 'classified',
        quality,
        probabilityLoss: 0.02,
        accuracyEstimate: 95,
        heuristicVersion: 'analyzer-accuracy-v2',
      },
      settings: {
        engineBuild: 'Stockfish 18',
        networkHash: '9067e33176e',
        limit: { depth: 14 },
        multiPv: 2,
        threads: 4,
        hashMb: 64,
        analysisVersion: 'analyzer-accuracy-v1',
        normalizationVersion: 'white-perspective-v1',
      },
    });
  }

  return {
    status: 'complete',
    annotations,
    analyzedPlies: plyCount,
    totalPlies: plyCount,
    summary: {
      white: {
        accuracyEstimate: 92.4,
        eligibleMoves: Math.ceil(plyCount / 2),
        excludedMoves: 0,
        breakdown: {
          brilliant: 0, great: 0, best: 0, excellent: Math.ceil(plyCount / 2),
          good: 0, book: 0, inaccuracy: 0, mistake: 0, blunder: 0, miss: 0, forced: 0,
        },
      },
      black: {
        accuracyEstimate: 89.1,
        eligibleMoves: Math.floor(plyCount / 2),
        excludedMoves: 0,
        breakdown: {
          brilliant: 0, great: 0, best: 0, excellent: Math.floor(plyCount / 2),
          good: 0, book: 0, inaccuracy: 0, mistake: 0, blunder: 0, miss: 0, forced: 0,
        },
      },
    },
  };
}
```

- [ ] **Step 2: Write failing unit/DOM tests for `AnalysisMoveList`**

Create `tests/dom/components/AnalysisMoveList.test.tsx` asserting:
- Renders all 41 move items with move number, SAN, evaluation score, and classification badge.
- Marks the active row with `aria-current="true"`.
- Calls `onSelectPly` when a row button is clicked.
- Does not crash when `selectedPly` is 0 or unselected.

- [ ] **Step 3: Update `tests/dom/components/AnalyzerWorkspace.test.tsx` with single-panel and selection tests**

Add tests to `AnalyzerWorkspace.test.tsx`:
- With 41 analyzed plies and `selectedPly: 1`: renders exactly 1 `EngineAnnotationPanel` (for ply 1), 41 move list items, and does not render 41 panels.
- With `selectedPly: 0`: renders instruction prompt ("Select a move to view annotations") and 0 `EngineAnnotationPanel`s.
- With `selectedPly: 15`: renders the panel for ply 15 with its specific SAN and quality.
- Interacting with move list invokes `onSelectPly`.

- [ ] **Step 4: Run tests to verify failure**

Run: `npx vitest run tests/dom/components/AnalyzerWorkspace.test.tsx tests/dom/components/AnalysisMoveList.test.tsx`
Expected: FAIL (AnalysisMoveList not found / AnalyzerWorkspace still rendering all panels).

- [ ] **Step 5: Commit test fixtures and failing tests**

```bash
git add tests/fixtures/longAnalysisFixture.ts tests/dom/components/AnalysisMoveList.test.tsx tests/dom/components/AnalyzerWorkspace.test.tsx
git commit -m "test: add long-game analyzer fixture and failing component tests for bounded layout"
```

---

### Task 2: Implement `AnalysisMoveList` and Streamline `MoveAccuracyGraph`

**Files:**
- Create: `components/analysis/AnalysisMoveList.tsx`
- Modify: `components/analysis/MoveAccuracyGraph.tsx:1-78`

**Interfaces:**
- Produces: `AnalysisMoveList` React component:
  ```typescript
  export interface AnalysisMoveListProps {
    annotations: readonly GameAnnotation[];
    selectedPly: number;
    onSelectPly(ply: number): void;
    id?: string;
  }
  ```
- Consumes: `GameAnnotation` from `@/features/stockfish-analysis/analyzeGame`, `toGraphPoints` and `qualityLabel` from `@/features/stockfish-analysis/presentation`, `MoveClassificationBadge` from `@/components/board/MoveClassificationBadge`.

- [ ] **Step 1: Implement `AnalysisMoveList.tsx`**

Build `components/analysis/AnalysisMoveList.tsx`:
- List container with `className="analysis-move-list"` and `role="list"` or `tabIndex={0}`.
- For each annotation, render an interactive row button:
  - Accessible label including move number, SAN, evaluation score, and move quality.
  - Formatted move label: e.g., `${Math.floor((annotation.ply - 1) / 2) + 1}${annotation.mover === 'white' ? '.' : '...'}` and `annotation.san`.
  - Inline `MoveClassificationBadge` if classified.
  - Evaluation label from `toGraphPoints`.
  - `aria-current={selectedPly === annotation.ply ? 'true' : undefined}`.
  - `data-selected={selectedPly === annotation.ply ? 'true' : undefined}`.
- Use a `useRef` array or callback ref with `useEffect` to call `element.scrollIntoView({ block: 'nearest' })` when `selectedPly === annotation.ply`.

- [ ] **Step 2: Update `MoveAccuracyGraph.tsx`**

In `components/analysis/MoveAccuracyGraph.tsx`:
- Remove the full `<table>` text alternative element.
- Add `aria-describedby="analysis-move-list"` or a descriptive caption referencing the move list.
- Keep SVG visualization and polyline calculation intact.
- Accept optional `selectedPly?: number` and `id?: string`.

- [ ] **Step 3: Run component tests to verify `AnalysisMoveList` and `MoveAccuracyGraph`**

Run: `npx vitest run tests/dom/components/AnalysisMoveList.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit `AnalysisMoveList` and `MoveAccuracyGraph` changes**

```bash
git add components/analysis/AnalysisMoveList.tsx components/analysis/MoveAccuracyGraph.tsx
git commit -m "feat: implement AnalysisMoveList and remove duplicate table from MoveAccuracyGraph"
```

---

### Task 3: Thread `selectedPly` in `AnalyzerWorkspace`, `LazyAnalyzerWorkspace`, and `ChessWorkspace`

**Files:**
- Modify: `components/analysis/AnalyzerWorkspace.tsx:1-145`
- Modify: `components/workspace/ChessWorkspace.tsx:430-455`

**Interfaces:**
- Consumes: `selectedPly: number` from `AnalyzerWorkspaceProps`
- Produces: Updated `AnalyzerWorkspaceProps` with `selectedPly: number`

- [ ] **Step 1: Update `AnalyzerWorkspace.tsx`**

In `components/analysis/AnalyzerWorkspace.tsx`:
- Add `selectedPly: number` to `AnalyzerWorkspaceProps`.
- Derive `selectedAnnotation = result?.annotations.find((a) => a.ply === selectedPly) ?? null`.
- Replace the `.map((annotation) => <EngineAnnotationPanel ... />)` with:
  ```tsx
  {result && result.annotations.length > 0 ? (
    <>
      <GameReviewSummaryCard result={result} />
      <MoveAccuracyGraph
        annotations={result.annotations}
        onSelectPly={onSelectPly}
      />
      <AnalysisMoveList
        id="analysis-move-list"
        annotations={result.annotations}
        selectedPly={selectedPly}
        onSelectPly={onSelectPly}
      />
      {selectedAnnotation ? (
        <EngineAnnotationPanel
          annotation={selectedAnnotation}
          startFen={fenByPly[selectedAnnotation.ply]}
          onSelectPly={onSelectPly}
        />
      ) : (
        <div className="annotation-panel-empty" role="note">
          <p>Select a move from the graph or move list to view detailed engine analysis.</p>
        </div>
      )}
    </>
  ) : null}
  ```

- [ ] **Step 2: Update `ChessWorkspace.tsx`**

In `components/workspace/ChessWorkspace.tsx`:
- Pass `selectedPly={state.selection.ply}` to `<LazyAnalyzerWorkspace ... />`.

- [ ] **Step 3: Run DOM tests for `AnalyzerWorkspace`**

Run: `npx vitest run tests/dom/components/AnalyzerWorkspace.test.tsx`
Expected: PASS (all tests pass, asserting 1 panel for selected ply and 0 for ply 0).

- [ ] **Step 4: Run full test suite to check for regressions**

Run: `npm test`
Expected: All 67+ test suites pass.

- [ ] **Step 5: Commit workspace integration**

```bash
git add components/analysis/AnalyzerWorkspace.tsx components/workspace/ChessWorkspace.tsx
git commit -m "feat: thread selectedPly and render single EngineAnnotationPanel in AnalyzerWorkspace"
```

---

### Task 4: CSS Layout, Desktop Boundary, Sticky Context, and Mobile Resets

**Files:**
- Modify: `app/globals.css:400-470, 1200-1300, 1510-1560`

- [ ] **Step 1: Add desktop context column block bounds and sticky behavior**

In `app/globals.css`:
Update `.workspace-layout__context`:
```css
.workspace-layout__context {
  min-width: 0;
  container-type: inline-size;
  max-block-size: calc(100dvh - var(--workspace-chrome-height));
  min-block-size: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  position: sticky;
  top: 1rem;
}
```

- [ ] **Step 2: Add `AnalysisMoveList` and empty annotation styling**

In `app/globals.css`:
```css
.analysis-move-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-block-size: clamp(12rem, 32dvh, 22rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  padding: var(--space-2);
}

.analysis-move-row {
  display: grid;
  grid-template-columns: 3.5rem minmax(3rem, 1fr) auto auto;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  font-size: 0.875rem;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.analysis-move-row:hover {
  background: var(--surface-hover);
}

.analysis-move-row[aria-current='true'],
.analysis-move-row[data-selected='true'] {
  background: var(--selected-bg);
  border-color: var(--accent-gold);
  font-weight: 600;
}

.analysis-move-row:focus-visible {
  outline: 2px solid var(--accent-gold);
  outline-offset: 1px;
}

.annotation-panel-empty {
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  padding: var(--space-4);
  text-align: center;
  color: var(--text-muted);
}
```

- [ ] **Step 3: Add responsive reset at `@media (max-width: 64rem)`**

In `app/globals.css` inside `@media (max-width: 64rem)`:
```css
  .workspace-layout__context {
    min-height: auto;
    position: static;
    top: auto;
    max-block-size: none;
    overflow-y: visible;
    overscroll-behavior: auto;
    scrollbar-gutter: auto;
  }
```

- [ ] **Step 4: Verify CSS with DOM tests and build**

Run: `npx vitest run tests/dom/components/`
Expected: PASS.

- [ ] **Step 5: Commit CSS changes**

```bash
git add app/globals.css
git commit -m "style: add bounded scrolling context, AnalysisMoveList styles, and mobile responsive reset"
```

---

### Task 5: End-to-End Tests for 1920×958 Desktop Height & Mobile Responsiveness

**Files:**
- Modify: `tests/e2e/helpers/workspaceFixtures.ts:1-117`
- Modify: `tests/e2e/workspace-responsive.spec.ts:1-380`
- Modify: `tests/e2e/workspace-accessibility.spec.ts:1-100`

- [ ] **Step 1: Add long game fixture to `workspaceFixtures.ts`**

Add a 41-ply game to `workspaceFixtures.ts`:
```typescript
export const longFixtureGame = game({
  id: 'fixture-game-long-41',
  url: 'https://www.chess.com/game/live/410000041',
  white: 'fixture-user',
  black: 'opponent-long',
  result: '1-0',
  moves: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 12. g5 b4 13. Ne2 Ne8 14. f4 a5 15. f5 a4 16. Nbd4 exd4 17. Nxd4 b3 18. Kb1 bxc2+ 19. Nxc2 Bb3 20. axb3 axb3 21. Na3 1-0',
  endTime: 1705500000,
});
```

- [ ] **Step 2: Add responsive E2E test for 1920×958 Analyzer Workspace height in `workspace-responsive.spec.ts`**

Add test:
- Set viewport to 1920×958.
- Load fixture games and select long game.
- Navigate to Analysis tab.
- Assert context element `clientHeight` <= `window.innerHeight - 14 * fontSize`.
- Assert document total height is not ~19,000px (e.g. document height is < 1500px).
- Assert horizontal overflow is 0 (`document.documentElement.scrollWidth === document.documentElement.clientWidth`).
- Select a move from move list, verify board and single detail panel update.

- [ ] **Step 3: Add mobile E2E test for natural document flow in `workspace-responsive.spec.ts`**

Add test:
- Set viewport to 390×844 (phone) and 768×1024 (tablet).
- In Analysis tab, verify `.workspace-layout__context` has `overflow-y: visible` (or natural document height).
- Verify move list remains bounded and scrollable.

- [ ] **Step 4: Verify axe accessibility in `workspace-accessibility.spec.ts`**

Add test checking accessibility on Analysis tab with analysis loaded.

- [ ] **Step 5: Run Playwright E2E tests**

Run: `npx playwright test tests/e2e/workspace-responsive.spec.ts tests/e2e/workspace-accessibility.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit E2E test updates**

```bash
git add tests/e2e/helpers/workspaceFixtures.ts tests/e2e/workspace-responsive.spec.ts tests/e2e/workspace-accessibility.spec.ts
git commit -m "test(e2e): add desktop 1920x958 analyzer height bounds and mobile responsive e2e tests"
```

---

### Task 6: Comprehensive Verification and Validation

**Files:**
- None (Verification step)

- [ ] **Step 1: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 2: Run all unit and DOM tests**

Run: `npm test`
Expected: All test suites pass.

- [ ] **Step 3: Run all Playwright E2E tests**

Run: `npx playwright test`
Expected: All E2E tests pass.

- [ ] **Step 4: Check git status and branch sanity**

Run: `git status`
Expected: Clean working tree on `feat/spec-2-analyzer-workspace-layout`.
