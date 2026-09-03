# Browser Verification and Scope Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a repeatable 154-test browser matrix, review and update only the intentional loaded-board baseline, and document Phase 5 advanced analytics as deferred.

**Architecture:** Treat the Chromium mismatch as a reviewable baseline change, not a tolerance problem, and treat the isolated-pass Firefox timeout as suite-load flakiness with a pre-hook timeout. Finish by running every repository quality gate and recording auditable results.

**Tech Stack:** Playwright 1.62, axe-core, Next.js production server, Markdown verification records.

**Spec:** `docs/superpowers/specs/2026-09-02-logic-functionality-audit-remediation-implementation-spec.md`

## Global Constraints

- Do not increase screenshot mismatch tolerance.
- Do not remove or weaken an axe assertion.
- Do not reduce the browser/device matrix.
- Prefer a focused 60-second suite timeout over sleeps or global serial execution.
- Mark `FR-ADV-001` through `FR-ADV-006` deferred; do not implement them here.
- Complete only when `npm run verify` passes from a clean production build.

---

## File structure

- Modify `tests/e2e/workspace-accessibility.spec.ts`: apply timeout before hooks.
- Review and possibly update `tests/e2e/workspace-visual.spec.ts-snapshots/loaded-board-chromium-win32.png`.
- Modify `docs/Chess.com Game Analyzer & Opening Tree Technical Spec.md`: record current implementation status.
- Create `docs/verification/2026-09-02-logic-functionality-audit-remediation.md`: record final evidence.

### Task 1: Stabilize the Firefox accessibility scenario

**Files:**

- Modify: `tests/e2e/workspace-accessibility.spec.ts`

**Interfaces:**

- Consumes: existing accessibility scenarios and four-worker Playwright configuration.
- Produces: a timeout configured before `beforeEach`, with unchanged assertions.

- [ ] **Step 1: Reproduce the isolated and loaded behavior**

Run: `npx playwright test tests/e2e/workspace-accessibility.spec.ts --project=firefox --grep="opening-tree, analysis-unavailable" --repeat-each=3`

Expected before change: isolated runs generally pass; retain output as evidence that the audit failure was setup/load-related rather than an axe violation.

- [ ] **Step 2: Configure the timeout before hooks**

At the file or containing describe scope, add:

```ts
test.describe.configure({ timeout: 60_000 });
```

Remove any test-body timeout that attempts to protect setup after hooks have begun. Do not add `waitForTimeout`, retries, or `test.slow()`.

- [ ] **Step 3: Run all Firefox accessibility tests repeatedly**

Run: `npx playwright test tests/e2e/workspace-accessibility.spec.ts --project=firefox --repeat-each=3`

Expected: 15/15 pass with every existing axe call intact.

- [ ] **Step 4: Commit the timeout correction**

```powershell
git add tests/e2e/workspace-accessibility.spec.ts
git commit -m "test(e2e): stabilize Firefox accessibility setup"
```

### Task 2: Review and update the loaded-board baseline

**Files:**

- Review: `test-results/workspace-visual-workspace-visual-regression-loaded-board-chromium/loaded-board-actual.png`
- Review: `test-results/workspace-visual-workspace-visual-regression-loaded-board-chromium/loaded-board-diff.png`
- Modify: `tests/e2e/workspace-visual.spec.ts-snapshots/loaded-board-chromium-win32.png`

**Interfaces:**

- Consumes: approved player metadata and orientation behavior plus semantic board tests.
- Produces: one reviewed Windows Chromium baseline matching intentional layout.

- [ ] **Step 1: Generate fresh actual/diff artifacts without updating snapshots**

Run: `npx playwright test tests/e2e/workspace-visual.spec.ts --project=chromium --grep="loaded board"`

Expected before baseline update: FAIL with the known stable mismatch.

- [ ] **Step 2: Verify semantic invariants before accepting pixels**

Run: `npx vitest run tests/dom/components/ChessboardView.test.tsx tests/dom/workspace/boardOrientationInvariants.test.tsx tests/dom/components/GameSelector.test.tsx`

Expected: PASS. Inspect actual versus expected versus diff and confirm the differences are limited to the approved player metadata/orientation layout; reject and fix production code if pieces, coordinates, controls, text, clipping, or contrast are wrong.

- [ ] **Step 3: Update only the affected baseline after review**

Run: `npx playwright test tests/e2e/workspace-visual.spec.ts --project=chromium --grep="loaded board" --update-snapshots`

Expected: one modified file, `loaded-board-chromium-win32.png`. If any other snapshot changes, restore those unrelated generated changes before continuing.

- [ ] **Step 4: Re-run the complete Chromium visual file without update mode**

Run: `npx playwright test tests/e2e/workspace-visual.spec.ts --project=chromium`

Expected: 5/5 pass.

- [ ] **Step 5: Commit the reviewed baseline**

```powershell
git add tests/e2e/workspace-visual.spec.ts-snapshots/loaded-board-chromium-win32.png
git commit -m "test(visual): approve loaded board metadata layout"
```

### Task 3: Record Phase 5 as deferred

**Files:**

- Modify: `docs/Chess.com Game Analyzer & Opening Tree Technical Spec.md`

**Interfaces:**

- Consumes: approved functional requirements `FR-ADV-001` through `FR-ADV-007`.
- Produces: an implementation-status table that distinguishes delivered, governing, and deferred requirements.

- [ ] **Step 1: Add an implementation-status section without changing requirement text**

Add a table after Traceability:

```md
## 7. Implementation status

| Requirement range | Status | Notes |
| --- | --- | --- |
| FR-ING-001–011 | Implemented | Remediation verified in the 2026-09-02 audit record. |
| FR-GRAPH-001–008 | Implemented | Includes enforced serialized snapshot budget. |
| FR-ENG-001–009 | Implemented | Cache degradation remains non-fatal and visible. |
| FR-DATA-001–004 | Implemented | Graph snapshot persistence remains optional. |
| FR-ADV-001–006 | Deferred | Planned Phase 5 functionality; not present in the current release. |
| FR-ADV-007 | Governing rule | Applies when any advanced metric is implemented. |
```

- [ ] **Step 2: Check documentation formatting and wording**

Run: `npx prettier --check "docs/Chess.com Game Analyzer & Opening Tree Technical Spec.md"`

Expected: PASS. Confirm the table does not claim Phase 5 implementation.

- [ ] **Step 3: Commit requirements status**

```powershell
git add "docs/Chess.com Game Analyzer & Opening Tree Technical Spec.md"
git commit -m "docs: record deferred Phase 5 analytics"
```

### Task 4: Run final verification and write the audit record

**Files:**

- Create: `docs/verification/2026-09-02-logic-functionality-audit-remediation.md`

**Interfaces:**

- Consumes: all five preceding plans and Tasks 1 through 3.
- Produces: final command/test evidence and requirement mapping.

- [ ] **Step 1: Run formatting and static analysis**

Run: `npm run format:check`

Run: `npm run lint`

Run: `npm run typecheck`

Expected: each exits 0.

- [ ] **Step 2: Run all Vitest projects with coverage**

Run: `npm run test:coverage`

Expected: every test passes and all configured global/path coverage thresholds pass. Record exact file/test counts and coverage percentages.

- [ ] **Step 3: Build the production application**

Run: `npm run build`

Expected: exit 0 with all intended routes generated.

- [ ] **Step 4: Run the complete Playwright matrix**

Run: `npm run test:e2e`

Expected: 154/154 pass across Chromium, Firefox, WebKit, mobile Chromium, and tablet Chromium with no retries required locally.

- [ ] **Step 5: Run the aggregate gate once**

Run: `npm run verify`

Expected: exit 0. This repeats earlier commands intentionally and proves the repository's canonical gate passes end to end.

- [ ] **Step 6: Write the verification record with actual output, not planned values**

Create the document with heading `Logic and Functionality Audit Remediation Verification`. Record the output of `git rev-parse HEAD` as its revision and `2026-09-02` as its date. Add a Gate/Result/Evidence table with rows for formatting, lint, types, Vitest/coverage, production build, and Playwright; copy the concise observed counts and percentages from Steps 1 through 5. Add an `Audit finding closure` section mapping each of the five code findings, browser reliability, and deferred scope to implementing commits and regression tests. Do not save the document with generic or unmeasured values.

- [ ] **Step 7: Inspect final repository state**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; only the new verification record is uncommitted at this step.

- [ ] **Step 8: Commit the verification record**

```powershell
git add docs/verification/2026-09-02-logic-functionality-audit-remediation.md
git commit -m "docs: record logic audit remediation verification"
```

- [ ] **Step 9: Confirm program completion**

Run: `git status --short`

Expected: clean working tree. Reconcile every checkbox in `2026-09-02-logic-functionality-audit-remediation-index.md`; no item may remain in progress when reporting completion.
