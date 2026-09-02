# Ingestion Cancellation Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return games and diagnostics from fully completed archive months when ingestion is cancelled, without exposing records from an incomplete transaction.

**Architecture:** Replace scattered counters with one ingestion accumulator and stage each network month's accepted matches until its IndexedDB transaction commits. Handle aborts where the accumulator is available, returning one truthful cancelled terminal result.

**Tech Stack:** TypeScript, AbortController, IndexedDB, Vitest, React.

**Spec:** `docs/superpowers/specs/2026-09-02-logic-functionality-audit-remediation-implementation-spec.md`

## Global Constraints

- Use test-driven development.
- Never publish a network month's games before its atomic persistence succeeds.
- Retain matches from every fully completed cached or network month.
- Emit exactly one terminal result and no progress after cancellation.
- Do not classify the aborted month as a failed month.
- Preserve the existing partial/failure rules for non-abort upstream errors.

---

## File structure

- Modify `features/ingestion/ingestionService.ts`: own accumulator, stage month results, and terminate cancellation locally.
- Modify `components/feedback/DiagnosticSummary.tsx`: render truthful zero/non-zero cancellation guidance.
- Modify `tests/dom/ingestion/ingestionService.test.ts`: cover each cancellation boundary.
- Modify `tests/dom/components/IngestionFeedback.test.tsx`: cover retained-result copy.
- Modify `components/Phase1TestHarness.tsx` and `tests/e2e/ingestion-fixtures.spec.ts`: demonstrate retained cancelled data in a browser fixture.

### Task 1: Introduce the accumulator and commit boundary

**Files:**

- Modify: `features/ingestion/ingestionService.ts`
- Test: `tests/dom/ingestion/ingestionService.test.ts`

**Interfaces:**

- Consumes: Workstream 1's PGN-valid monthly records.
- Produces: private `IngestionAccumulator`, `emitProgress(accumulator, ...)`, and `terminalFromAccumulator(...)` helpers.

- [ ] **Step 1: Add failing tests for cancellation after a completed cached month and during the next network month**

```ts
expect(result).toMatchObject({
  status: 'cancelled',
  games: [expect.objectContaining({ id: 'completed-month-game' })],
  failedMonths: [],
});
expect(progress.at(-1)?.recordsAccepted).toBe(1);
```

Use deferred validation or persistence for the second month, abort it, and assert its staged game is absent.

- [ ] **Step 2: Add a failing test proving progress does not accept before commit**

Hold `persistMonth` on a deferred promise after validation returns. Assert every emitted progress event still reports the prior committed accepted count. Resolve persistence and assert the next event includes the committed month.

- [ ] **Step 3: Run focused ingestion tests and verify both failures**

Run: `npx vitest run --project dom tests/dom/ingestion/ingestionService.test.ts`

Expected: FAIL because the outer handler returns empty arrays and current code mutates `games` before persistence.

- [ ] **Step 4: Introduce a single accumulator**

```ts
interface IngestionAccumulator {
  games: GameRecord[];
  seen: Set<string>;
  failedMonths: FailedMonth[];
  diagnostics: Diagnostic[];
  monthsPlanned: number;
  monthsCompleted: number;
  recordsFetched: number;
  recordsExcluded: number;
  recordsFailed: number;
  offlineCacheOnly: boolean;
}
```

Replace local counter captures with reads/writes through this object. Keep it private to the module.

- [ ] **Step 5: Stage network matches until persistence commits**

```ts
const stagedMatches = validMonthGames.filter(
  (game) => matchesQuery(game, query) && !accumulator.seen.has(game.id)
);

await runtime.deps.persistMonth(validMonthGames, marker, runtime.signal);
for (const game of stagedMatches) {
  if (accumulator.games.length === query.maxGames) break;
  accumulator.seen.add(game.id);
  accumulator.games.push(game);
}
accumulator.monthsCompleted += 1;
```

Do not mutate the global `seen` set for staged records before commit. Cached reads are already complete operations and may merge immediately after validation.

- [ ] **Step 6: Catch aborts inside `executeIngestion`**

Wrap planning and the month loop so an abort returns `terminalFromAccumulator(runtime, fingerprint, 'cancelled', accumulator)`. Leave the outer `runIngestion` abort branch only as a defensive fallback for cancellation before accumulator construction.

- [ ] **Step 7: Run all ingestion tests until they pass**

Run: `npx vitest run --project dom tests/dom/ingestion/ingestionService.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit accumulator semantics**

```powershell
git add features/ingestion/ingestionService.ts tests/dom/ingestion/ingestionService.test.ts
git commit -m "fix(ingestion): retain committed games on cancellation"
```

### Task 2: Make cancellation feedback truthful

**Files:**

- Modify: `components/feedback/DiagnosticSummary.tsx`
- Modify: `components/Phase1TestHarness.tsx`
- Test: `tests/dom/components/IngestionFeedback.test.tsx`
- Test: `tests/e2e/ingestion-fixtures.spec.ts`

**Interfaces:**

- Consumes: cancelled `IngestionResult.games` from Task 1.
- Produces: different guidance for zero retained games and one-or-more retained games.

- [ ] **Step 1: Add failing component tests for both cancellation messages**

```ts
expect(screen.getByText('No completed games were retained. Start a new query.')).toBeVisible();
expect(
  screen.getByText('2 games from completed archive months were retained and remain available.')
).toBeVisible();
```

- [ ] **Step 2: Run the component test and verify current generic copy fails**

Run: `npx vitest run --project dom tests/dom/components/IngestionFeedback.test.tsx`

Expected: FAIL on cancellation guidance.

- [ ] **Step 3: Implement count-sensitive copy**

```ts
case 'cancelled':
  return result.games.length === 0
    ? 'No completed games were retained. Start a new query.'
    : `${result.games.length} games from completed archive months were retained and remain available.`;
```

- [ ] **Step 4: Extend the cancelled browser fixture**

Make the fixture complete one cached or fetched month, block the next month, then cancel. Assert the retained game is selectable and the cancellation status remains visible.

- [ ] **Step 5: Run component and Chromium fixture tests**

Run: `npx vitest run --project dom tests/dom/components/IngestionFeedback.test.tsx`

Run: `npx playwright test tests/e2e/ingestion-fixtures.spec.ts --project=chromium --grep=cancelled`

Expected: PASS.

- [ ] **Step 6: Commit cancellation presentation**

```powershell
git add components/feedback/DiagnosticSummary.tsx components/Phase1TestHarness.tsx tests/dom/components/IngestionFeedback.test.tsx tests/e2e/ingestion-fixtures.spec.ts
git commit -m "fix(ingestion): show retained cancelled results"
```

### Task 3: Verify cancellation invariants

**Files:**

- Verify only: Tasks 1 and 2 changes.

**Interfaces:**

- Consumes: complete cancellation implementation.
- Produces: evidence required before deletion quiescence begins.

- [ ] **Step 1: Run ingestion, persistence-abort, and manager-supersession tests**

Run: `npx vitest run --project dom tests/dom/ingestion/ingestionService.test.ts tests/dom/db/repositories.test.ts`

Expected: PASS, including atomic transaction abort and stale progress tests.

- [ ] **Step 2: Run static checks**

Run: `npm run lint && npm run typecheck && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 3: Review the terminal-outcome invariant**

Confirm each abort boundary has a test, completed matches are retained, incomplete-month matches are absent, and no test observes progress after the cancelled result.
