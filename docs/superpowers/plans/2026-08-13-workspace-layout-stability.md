# Workspace Layout Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chessboard cells and the evaluation meter geometrically stable, and contain games and opening candidates in fixed-height scroll viewports.

**Architecture:** `ChessboardView` will own a board stage containing the optional meter and framed 8×8 board, with move controls outside that stage. `GameSelector` and `OpeningTreeTable` will wrap only populated dynamic results in a shared bounded viewport, leaving their headings and controls stationary.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 5.7, global CSS, Vitest/Testing Library, Playwright.

## Global Constraints

- Preserve all chess navigation, game filtering and sorting, opening-tree navigation, accessibility semantics, themes, and responsive breakpoints.
- Do not add virtualization, pagination, new user settings, or dependencies.
- Read `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`, `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`, and `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md` before implementation.
- Preserve unrelated and pre-existing worktree changes; stage only files named by the active task.
- Use strict red-green TDD: run each new regression against the current production code and confirm the expected failure before editing production files.
- Result viewports use the exact accessible names `Game results` and `Opening candidate results`.
- Populated result viewports use the exact block size `clamp(16rem, 45dvh, 28rem)`.

---

## File Structure

- Modify `components/board/ChessboardView.tsx`: accept an optional evaluation and own the board-stage composition.
- Modify `components/board/EvaluationBar.tsx`: render one full-height fill track with overlaid meter text.
- Modify `components/workspace/ChessWorkspace.tsx`: pass the selected evaluation through `BoardPanel` instead of composing the meter around the whole board region.
- Modify `components/analysis/GameSelector.tsx`: add the labelled, focusable game-results viewport around the table/list only.
- Modify `components/tree/OpeningTreeTable.tsx`: add the labelled, focusable candidate-results viewport around the populated table only.
- Modify `app/globals.css`: define fixed 8×8 tracks, contained pieces, board-stage/meter alignment, bounded scrolling, and sticky table headers.
- Modify `tests/dom/components/ChessboardView.test.tsx`: protect board-stage ownership and meter/control placement.
- Modify `tests/dom/components/GameSelector.test.tsx`: protect the game viewport's accessibility and content boundary.
- Modify `tests/dom/components/OpeningTreeTable.test.tsx`: protect the candidate viewport's accessibility and empty-state behavior.
- Modify `tests/e2e/helpers/workspaceFixtures.ts`: supply a deterministic 20-game/20-opening-candidate overflow fixture while preserving the default two-game fixture.
- Modify `tests/e2e/workspace-responsive.spec.ts`: verify actual cell boxes, meter alignment/fill, and real scroll overflow.
- Update `tests/e2e/workspace-visual.spec.ts-snapshots/*.png` only after the functional browser assertions pass and the changed images are inspected.

---

### Task 1: Lock the Chessboard to Equal Square Tracks

**Files:**

- Modify: `tests/e2e/workspace-responsive.spec.ts`
- Modify: `app/globals.css:762-882`

**Interfaces:**

- Consumes: existing `[data-square]` grid cells and the Games workspace fixture.
- Produces: a board whose 64 cell boxes all have one equal width and height independent of piece occupancy.

- [ ] **Step 1: Add a failing browser regression for equal cells before and after a move**

Add this test and helper to `tests/e2e/workspace-responsive.spec.ts`:

```ts
test('keeps every board square equal before and after piece occupancy changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /select game versus opponent-two/i }).click();

  await expectUniformBoardSquares(page);
  await page.getByRole('button', { name: 'Next move' }).click();
  await expectUniformBoardSquares(page);
});

async function expectUniformBoardSquares(page: import('@playwright/test').Page) {
  const boxes = await page.locator('[data-square]').evaluateAll((squares) =>
    squares.map((square) => {
      const { width, height } = square.getBoundingClientRect();
      return { width, height };
    })
  );
  expect(boxes).toHaveLength(64);
  const first = boxes[0]!;
  expect(first.width).toBeGreaterThan(0);
  expect(Math.abs(first.width - first.height)).toBeLessThanOrEqual(1);
  for (const box of boxes) {
    expect(Math.abs(box.width - first.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.height - first.height)).toBeLessThanOrEqual(1);
  }
}
```

This catches removing the explicit row tracks or allowing intrinsic image size to determine a track.

- [ ] **Step 2: Run the regression and confirm the expected failure**

Run:

```powershell
npx playwright test tests/e2e/workspace-responsive.spec.ts --project=chromium --grep "keeps every board square equal"
```

Expected: FAIL because occupied and empty automatic grid rows have different heights.

- [ ] **Step 3: Define fixed rows and contain piece images**

Make the relevant rules in `app/globals.css` read:

```css
.chessboard {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  grid-template-rows: repeat(8, minmax(0, 1fr));
  gap: 1px;
  padding: 1px;
  width: 100%;
  aspect-ratio: 1;
  border: 0;
  border-radius: 0.35rem;
  background: #3f4e35;
  overflow: hidden;
}

.board-square {
  position: relative;
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  line-height: 1;
}

.chess-piece {
  z-index: 1;
  display: block;
  width: 74%;
  height: 74%;
  max-width: 4.25rem;
  max-height: 4.25rem;
  object-fit: contain;
  filter: drop-shadow(0 0.08rem 0.06rem rgb(15 23 42 / 24%));
  user-select: none;
}
```

- [ ] **Step 4: Run the focused browser regression**

Run the Step 2 command again.

Expected: PASS with 64 equal square cells both before and after advancing one ply.

- [ ] **Step 5: Run the board DOM suite and commit this isolated fix**

Run:

```powershell
npx vitest run tests/dom/components/ChessboardView.test.tsx
git diff --check -- app/globals.css tests/e2e/workspace-responsive.spec.ts
git add app/globals.css tests/e2e/workspace-responsive.spec.ts
git commit -m "fix: lock chessboard square dimensions"
```

Expected: Vitest PASS, diff check clean, and the commit contains only the two named files.

---

### Task 2: Align the Evaluation Meter with the Framed Board

**Files:**

- Modify: `tests/dom/components/ChessboardView.test.tsx`
- Modify: `tests/e2e/workspace-responsive.spec.ts`
- Modify: `components/board/ChessboardView.tsx`
- Modify: `components/board/EvaluationBar.tsx`
- Modify: `components/workspace/ChessWorkspace.tsx`
- Modify: `app/globals.css:668-678,783-815,1163-1166`

**Interfaces:**

- Consumes: `EvaluationScore | undefined` from the selected annotation's `after.score`.
- Produces: `ChessboardView` prop `evaluationScore?: EvaluationScore`; `.board-stage`; `.board-stage--with-evaluation`; a full-height `.evaluation-bar__white` fill.

- [ ] **Step 1: Add a failing DOM regression for component ownership**

Add the import and test below to `tests/dom/components/ChessboardView.test.tsx`:

```tsx
it('places the evaluation meter beside the framed board and above move controls', () => {
  render(
    <ChessboardView
      fen="8/8/8/8/8/8/4P3/K6k w - - 0 1"
      orientation="white"
      currentPly={0}
      totalPlies={1}
      onPlyChange={vi.fn()}
      evaluationScore={{ kind: 'cp', value: 0 }}
    />
  );

  const board = screen.getByRole('grid', { name: /chess board/i });
  const meter = screen.getByRole('meter', { name: /white-perspective evaluation/i });
  const next = screen.getByRole('button', { name: 'Next move' });
  const stage = board.closest('.board-stage');

  expect(stage).not.toBeNull();
  expect(stage).toContainElement(meter);
  expect(stage).not.toContainElement(next);
});
```

This catches moving the meter back to `ChessWorkspace` where it stretches beside the move controls.

- [ ] **Step 2: Run the DOM regression and confirm RED**

Run:

```powershell
npx vitest run tests/dom/components/ChessboardView.test.tsx -t "places the evaluation meter"
```

Expected: FAIL because `ChessboardView` has no `evaluationScore` prop and renders no meter.

- [ ] **Step 3: Add a failing real-browser meter geometry regression**

Add a Chromium-only test to `tests/e2e/workspace-responsive.spec.ts` that loads a fixture game, performs Quick analysis, selects ply 1, then measures the live meter:

```ts
test('aligns the evaluation meter to the framed board and uses its full track', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'One real Stockfish browser run covers meter geometry.');
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /select game versus opponent-two/i }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.getByRole('button', { name: 'Start analysis' })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByLabel('Analysis strength').selectOption('quick');
  await page.getByRole('button', { name: 'Start analysis' }).click();
  await expect(page.getByText('Analysis status: Complete', { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Select ply 1' }).click();

  const meter = page.getByRole('meter', { name: 'White-perspective evaluation' });
  const [meterBox, frameBox, controlsBox, fillBox, value] = await Promise.all([
    meter.boundingBox(),
    page.locator('.chessboard-frame').boundingBox(),
    page.locator('.move-history-controls').boundingBox(),
    meter.locator('.evaluation-bar__white').boundingBox(),
    meter.getAttribute('aria-valuenow'),
  ]);
  expect(meterBox).not.toBeNull();
  expect(frameBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(fillBox).not.toBeNull();
  expect(value).not.toBeNull();
  expect(Math.abs(meterBox!.y - frameBox!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(meterBox!.height - frameBox!.height)).toBeLessThanOrEqual(1);
  expect(controlsBox!.y).toBeGreaterThan(meterBox!.y + meterBox!.height);
  expect(fillBox!.height / meterBox!.height).toBeCloseTo(Number(value) / 100, 1);
});
```

This catches both the old meter placement beside the whole board region and a label row that shortens the fill track.

- [ ] **Step 4: Run both meter regressions and confirm RED**

Run:

```powershell
npx vitest run tests/dom/components/ChessboardView.test.tsx -t "places the evaluation meter"
npx playwright test tests/e2e/workspace-responsive.spec.ts --project=chromium --grep "aligns the evaluation meter"
```

Expected: the DOM test FAILs because `ChessboardView` has no `evaluationScore` prop; the browser test FAILs because the current meter is not owned and aligned by the board stage.

- [ ] **Step 5: Move the meter into `ChessboardView`**

In `components/board/ChessboardView.tsx`, import `EvaluationScore` and `EvaluationBar`, accept `evaluationScore?: EvaluationScore`, and replace the board-frame-only markup with:

```tsx
<div className={`board-stage${evaluationScore ? ' board-stage--with-evaluation' : ''}`}>
  {evaluationScore ? <EvaluationBar score={evaluationScore} /> : null}
  <div className="chessboard-frame">
    {/* existing chessboard and optional BoardArrow remain unchanged here */}
  </div>
</div>
```

Keep the screen-reader help and `MoveHistoryControls` after the closing `.board-stage` element.

In `components/workspace/ChessWorkspace.tsx`:

- Remove the direct `EvaluationBar` import.
- Replace the conditional `workspace-board--with-evaluation` wrapper and its meter child with `<div className="workspace-board">`.
- Pass `evaluationScore={selectedAnnotation?.after.score}` to `BoardPanel` only when a selected annotation exists.
- Add `evaluationScore?: EvaluationScore` to `BoardPanel` and forward it to `ChessboardView`.
- Import `EvaluationScore` from `@/lib/engine/evaluation` as a type.

- [ ] **Step 6: Make the meter use the whole board-stage height**

Change `components/board/EvaluationBar.tsx` to this internal structure:

```tsx
<div
  className="evaluation-bar"
  role="meter"
  aria-label="White-perspective evaluation"
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={Math.round(view.whitePercent)}
  aria-valuetext={view.text}
>
  <span
    className="evaluation-bar__white"
    style={{ height: `${view.whitePercent}%` }}
    aria-hidden="true"
  />
  <span className="evaluation-bar__text">{view.text}</span>
</div>
```

Replace the old workspace and meter rules in `app/globals.css` with:

```css
.workspace-board,
.board-stage {
  min-width: 0;
}

.board-stage--with-evaluation {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr);
  gap: 0.5rem;
  align-items: stretch;
}

.evaluation-bar {
  position: relative;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: #263241;
  color: var(--text-primary);
  box-shadow: 0 7px 18px rgb(2 8 23 / 20%);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}

.evaluation-bar__text {
  position: absolute;
  z-index: 1;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 0.35rem 0.2rem;
  text-align: center;
  writing-mode: vertical-rl;
}

.evaluation-bar__white {
  position: absolute;
  inset-inline: 0;
  bottom: 0;
  background: #e7e1d7;
  transition: height 160ms ease-out;
}

@media (max-width: 42rem) {
  .board-stage--with-evaluation {
    grid-template-columns: 1.75rem minmax(0, 1fr);
    gap: 0.35rem;
  }
}
```

Delete `.evaluation-bar__track` and the obsolete `.workspace-board--with-evaluation` rules.

- [ ] **Step 7: Run the DOM and browser regressions GREEN**

Run:

```powershell
npx vitest run tests/dom/components/ChessboardView.test.tsx
npx playwright test tests/e2e/workspace-responsive.spec.ts --project=chromium --grep "aligns the evaluation meter"
```

Expected: both commands PASS, including the new containment assertion, live meter geometry, and existing board semantics/navigation tests.

- [ ] **Step 8: Commit the verified meter fix**

Run:

```powershell
git diff --check -- components/board/ChessboardView.tsx components/board/EvaluationBar.tsx components/workspace/ChessWorkspace.tsx app/globals.css tests/dom/components/ChessboardView.test.tsx tests/e2e/workspace-responsive.spec.ts
git add components/board/ChessboardView.tsx components/board/EvaluationBar.tsx components/workspace/ChessWorkspace.tsx app/globals.css tests/dom/components/ChessboardView.test.tsx tests/e2e/workspace-responsive.spec.ts
git commit -m "fix: align evaluation meter with board"
```

Expected: the real engine test PASSes with the meter and frame aligned, and only the named files are committed.

---

### Task 3: Bound Games and Opening Candidates in Scroll Viewports

**Files:**

- Modify: `tests/dom/components/GameSelector.test.tsx`
- Modify: `tests/dom/components/OpeningTreeTable.test.tsx`
- Modify: `tests/e2e/helpers/workspaceFixtures.ts`
- Modify: `tests/e2e/workspace-responsive.spec.ts`
- Modify: `components/analysis/GameSelector.tsx`
- Modify: `components/tree/OpeningTreeTable.tsx`
- Modify: `app/globals.css:680-685,709-759`

**Interfaces:**

- Consumes: existing sorted game rows/cards and selected opening candidates.
- Produces: focusable `.result-viewport.game-results` labelled `Game results`; focusable `.result-viewport.opening-candidate-results` labelled `Opening candidate results`.

- [ ] **Step 1: Add failing DOM tests for the result viewport boundaries**

In `tests/dom/components/GameSelector.test.tsx`, add to the first test after render:

```tsx
const gameResults = screen.getByRole('region', { name: 'Game results' });
expect(gameResults).toHaveAttribute('tabindex', '0');
expect(gameResults).toContainElement(screen.getByRole('table', { name: 'Games' }));
expect(gameResults).not.toContainElement(screen.getByLabelText(/filter games/i));
```

In `tests/dom/components/OpeningTreeTable.test.tsx`, add to the first test after render:

```tsx
const candidateResults = screen.getByRole('region', { name: 'Opening candidate results' });
expect(candidateResults).toHaveAttribute('tabindex', '0');
expect(candidateResults).toContainElement(screen.getByRole('table'));
expect(candidateResults).not.toContainElement(screen.getByLabelText(/sort candidate moves/i));
```

Add a new empty-state test to `OpeningTreeTable.test.tsx` using navigation to the fixture's `transposed-target` terminal node and assert:

```tsx
expect(screen.getByText(/no candidate moves are available/i)).toBeVisible();
expect(screen.queryByRole('region', { name: 'Opening candidate results' })).not.toBeInTheDocument();
```

These tests catch accidentally scrolling headings/controls and allocating a blank fixed-height viewport for empty results.

- [ ] **Step 2: Run both DOM suites and confirm RED**

Run:

```powershell
npx vitest run tests/dom/components/GameSelector.test.tsx tests/dom/components/OpeningTreeTable.test.tsx
```

Expected: FAIL because neither labelled result region exists.

- [ ] **Step 3: Extend browser fixtures to create genuine overflow**

In `tests/e2e/helpers/workspaceFixtures.ts`:

- Keep the exported two-game `installWorkspaceFixtures(page)` behavior unchanged.
- Add `installOverflowWorkspaceFixtures(page)` that routes the same archive endpoints but returns 20 unique games.
- Generate the 20 games from the literal first-move list below, using unique IDs/end times and the valid PGN `1. ${firstMove} a6 1-0`:

```ts
const firstMoves = [
  'a3',
  'a4',
  'b3',
  'b4',
  'c3',
  'c4',
  'd3',
  'd4',
  'e3',
  'e4',
  'f3',
  'f4',
  'g3',
  'g4',
  'h3',
  'h4',
  'Na3',
  'Nc3',
  'Nf3',
  'Nh3',
] as const;
```

- Change `loadFixtureGames(page)` to `loadFixtureGames(page, maximumGames = 2)` and fill `String(maximumGames)` into the Maximum games field. Existing call sites retain two games.

The overflow fixture must use `fixture-user` as White in every game so all 20 legal first moves become root opening candidates.

- [ ] **Step 4: Add failing browser assertions for stable vertical overflow**

Add this test to `tests/e2e/workspace-responsive.spec.ts`:

```ts
test('contains games and opening candidates in fixed-height scroll viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installOverflowWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page, 20);

  const gameResults = page.getByRole('region', { name: 'Game results' });
  await expect(gameResults.getByRole('button', { name: /select game versus/i })).toHaveCount(20);
  const gameMetrics = await scrollMetrics(gameResults);
  expect(gameMetrics.clientHeight).toBeGreaterThanOrEqual(16 * 16 - 1);
  expect(gameMetrics.clientHeight).toBeLessThanOrEqual(28 * 16 + 1);
  expect(gameMetrics.scrollHeight).toBeGreaterThan(gameMetrics.clientHeight);
  await gameResults.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  expect((await scrollMetrics(gameResults)).scrollTop).toBeGreaterThan(0);

  await page.getByRole('tab', { name: 'Opening tree' }).click();
  const candidates = page.getByRole('region', { name: 'Opening candidate results' });
  await expect(candidates.getByRole('button', { name: /^Play / })).toHaveCount(20);
  const candidateMetrics = await scrollMetrics(candidates);
  expect(candidateMetrics.clientHeight).toBe(gameMetrics.clientHeight);
  expect(candidateMetrics.scrollHeight).toBeGreaterThan(candidateMetrics.clientHeight);

  const headingBefore = await candidates.getByRole('columnheader', { name: 'Move' }).boundingBox();
  await candidates.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  const headingAfter = await candidates.getByRole('columnheader', { name: 'Move' }).boundingBox();
  expect(headingBefore).not.toBeNull();
  expect(headingAfter).not.toBeNull();
  expect(Math.abs(headingAfter!.y - headingBefore!.y)).toBeLessThanOrEqual(1);
});

async function scrollMetrics(locator: import('@playwright/test').Locator) {
  return locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
}
```

Import `installOverflowWorkspaceFixtures` beside the existing fixture helpers.

- [ ] **Step 5: Run the DOM and browser regressions and confirm RED**

Run:

```powershell
npx vitest run tests/dom/components/GameSelector.test.tsx tests/dom/components/OpeningTreeTable.test.tsx
npx playwright test tests/e2e/workspace-responsive.spec.ts --project=chromium --grep "contains games and opening candidates"
```

Expected: DOM tests FAIL because neither labelled region exists; the browser test FAILs for the same missing regions and unbounded collection layout.

- [ ] **Step 6: Wrap only populated dynamic collections**

In `components/analysis/GameSelector.tsx`, wrap the existing compact-list/table conditional with:

```tsx
<div className="result-viewport game-results" role="region" aria-label="Game results" tabIndex={0}>
  {compact ? (
    /* existing compact list */
  ) : (
    /* existing Games table */
  )}
</div>
```

Render this region only when `rows.length > 0`; for zero filtered rows render `<p>No games match the current filter.</p>`.

In `components/tree/OpeningTreeTable.tsx`, keep the existing empty message unchanged and wrap only the populated candidate table with:

```tsx
<div
  className="result-viewport opening-candidate-results"
  role="region"
  aria-label="Opening candidate results"
  tabIndex={0}
>
  {/* existing opening candidate table */}
</div>
```

- [ ] **Step 7: Add the bounded viewport and sticky-header CSS**

In `app/globals.css`, replace vertical overflow responsibility on the outer panels with:

```css
.game-selector,
.opening-tree {
  display: grid;
  gap: 0.75rem;
}

.result-viewport {
  block-size: clamp(16rem, 45dvh, 28rem);
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.result-viewport .context-table th {
  position: sticky;
  z-index: 1;
  top: 0;
  background: var(--surface-raised);
}
```

Leave `.compact-game-list` as an ordinary internal grid; the new parent owns scrolling.

- [ ] **Step 8: Run DOM and browser regressions GREEN**

Run the two commands from Step 5 again.

Expected: both DOM suites PASS with controls outside their result regions and no candidate region for the terminal state; the browser test PASSes with genuine vertical overflow and a sticky candidate header.

- [ ] **Step 9: Commit the verified result viewport fix**

Run:

```powershell
git diff --check -- components/analysis/GameSelector.tsx components/tree/OpeningTreeTable.tsx app/globals.css tests/dom/components/GameSelector.test.tsx tests/dom/components/OpeningTreeTable.test.tsx tests/e2e/helpers/workspaceFixtures.ts tests/e2e/workspace-responsive.spec.ts
git add components/analysis/GameSelector.tsx components/tree/OpeningTreeTable.tsx app/globals.css tests/dom/components/GameSelector.test.tsx tests/dom/components/OpeningTreeTable.test.tsx tests/e2e/helpers/workspaceFixtures.ts tests/e2e/workspace-responsive.spec.ts
git commit -m "fix: contain workspace result lists"
```

Expected: browser test PASSes with 20 games and 20 candidates scrolling inside equal bounded heights, and only named files are committed.

---

### Task 4: Full Regression and Visual Verification

**Files:**

- Potentially update: `tests/e2e/workspace-visual.spec.ts-snapshots/loaded-board-*.png`
- Potentially update: `tests/e2e/workspace-visual.spec.ts-snapshots/opening-tree-*.png`
- Verify all files changed by Tasks 1-3.

**Interfaces:**

- Consumes: completed board, meter, and result viewport fixes.
- Produces: fresh evidence that every acceptance criterion holds across automated and rendered checks.

- [ ] **Step 1: Run focused DOM and unit suites**

Run:

```powershell
npx vitest run tests/dom/components/ChessboardView.test.tsx tests/dom/components/GameSelector.test.tsx tests/dom/components/OpeningTreeTable.test.tsx tests/unit/board/evaluationBar.test.ts
```

Expected: all tests PASS with no warnings or unhandled errors.

- [ ] **Step 2: Run the full responsive browser suite across configured projects**

Run:

```powershell
npx playwright test tests/e2e/workspace-responsive.spec.ts
```

Expected: all applicable Chromium, Firefox, WebKit, mobile, and tablet tests PASS; the real Stockfish meter test runs only in Chromium by its explicit skip condition.

- [ ] **Step 3: Run visual regression tests without updating snapshots**

Run:

```powershell
npx playwright test tests/e2e/workspace-visual.spec.ts
```

Expected: either PASS or screenshot diffs limited to the intended equal-square board geometry and bounded result region. Any unrelated diff must be investigated before snapshot updates.

- [ ] **Step 4: Inspect and update only intentional snapshots**

Open each Playwright actual/diff image for a failed snapshot with the local image viewer. Confirm all board squares are equal, no piece is clipped, controls remain visible, and result regions have usable scroll affordance. Then run:

```powershell
npx playwright test tests/e2e/workspace-visual.spec.ts --update-snapshots
npx playwright test tests/e2e/workspace-visual.spec.ts
```

Expected: snapshot update followed by a clean PASS. Do not update snapshots if inspection exposes another layout defect.

- [ ] **Step 5: Run static checks and the production build**

Run:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run build
```

Expected: every command exits 0. The production build is required because Next.js can order and chunk CSS differently from development.

- [ ] **Step 6: Run the complete automated test suite**

Run:

```powershell
npm test
npm run test:e2e
```

Expected: Vitest and every configured Playwright project report zero failures.

- [ ] **Step 7: Audit each acceptance criterion against fresh evidence**

Record the evidence in the final handoff:

1. Equal-square test passes before and after navigation.
2. The same test and explicit row CSS prove pieces cannot change tracks.
3. Live Stockfish meter geometry test proves board-only alignment and full-height fill.
4. Twenty-game test proves cards/rows scroll while controls remain outside the region.
5. Twenty-candidate test proves candidate scrolling and sticky headers.
6. Both viewports have bounded `clientHeight` and larger `scrollHeight`, proving item counts no longer add their full height to the document.
7. DOM/accessibility, responsive, visual, lint, typecheck, full test, and production-build commands prove preserved behavior.

- [ ] **Step 8: Commit verified snapshots or final cleanup**

If snapshots changed:

```powershell
git add tests/e2e/workspace-visual.spec.ts-snapshots
git commit -m "test: update stable workspace snapshots"
```

Then run `git status --short`, verify no task-owned file remains unintentionally unstaged, and preserve all unrelated user changes.
