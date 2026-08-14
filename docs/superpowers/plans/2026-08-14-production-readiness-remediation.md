# Production Readiness Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all architectural, test, coverage, layout, and type-safety issues identified in the production-readiness review and achieve 100% passing status on all CI quality gates and Playwright E2E suites across all browsers.

**Architecture:**

1. Fix the responsive drawer layout breakpoint mismatch between `UtilityRail.tsx` and `ChessWorkspace.tsx`, ensuring desktop viewports render an inline rail without modal inertness while compact/mobile screens properly auto-close the drawer on query completion.
2. Remove engine exclusions from `vitest.config.ts` coverage collector and verify full coverage compliance.
3. Protect debug test harness routes in `app/` from being exposed in production environments.
4. Replace `any` casts with type guards in `lib/db/repositories.ts` and `features/ingestion/retryPolicy.ts`.
5. Add `chess.isDraw()` check in `analyzeGame.ts` terminal evaluation and increase WebKit benchmark test timeout.
6. Format code and execute the complete verification suite (`format:check`, `lint`, `typecheck`, `test:coverage`, `build`, `test:e2e`).

**Tech Stack:** Next.js 16.3.0, React 19, TypeScript, Vitest, Playwright, Tailwind-free Vanilla CSS.

---

## File Structure

- Modify `components/workspace/UtilityRail.tsx`: Adjust `mobileQuery` breakpoint and align desktop rendering.
- Modify `components/workspace/ChessWorkspace.tsx`: Align `desktopLayout` check to `(min-width: 64.0625rem)` (or consistent threshold) and auto-close drawer on ingestion completion.
- Modify `vitest.config.ts`: Remove engine exclusions from coverage.
- Modify `app/phase-1-test-harness/page.tsx`: Restrict in production.
- Modify `app/phase-2-test-harness/page.tsx`: Restrict in production.
- Modify `app/phase-3-test-harness/page.tsx`: Restrict in production.
- Modify `lib/db/repositories.ts`: Eliminate `as any` in `getArchiveListMeta`.
- Modify `features/ingestion/retryPolicy.ts`: Eliminate `as any` in `retryDelayMs`.
- Modify `features/stockfish-analysis/analyzeGame.ts`: Include `chess.isDraw()` in `terminalPositionEvaluation`.
- Modify `tests/e2e/opening-worker.spec.ts`: Set timeout to 60s for WebKit worker execution.
- Format modified files and markdown docs with Prettier.

---

### Task 1: Fix Responsive Drawer Breakpoint & Inert Backdrop Lockout

**Files:**

- Modify: `components/workspace/UtilityRail.tsx`
- Modify: `components/workspace/ChessWorkspace.tsx`
- Test: `tests/e2e/workspace.spec.ts`

- [ ] **Step 1: Update `mobileQuery` in `UtilityRail.tsx` and `desktopLayout` in `ChessWorkspace.tsx`**
- [ ] **Step 2: Run DOM and E2E workspace tests to verify fix**
- [ ] **Step 3: Commit Task 1 changes**

---

### Task 2: Re-enable Vitest Coverage for Engine & Analysis Modules

**Files:**

- Modify: `vitest.config.ts`
- Test: `npm run test:coverage`

- [ ] **Step 1: Remove `'lib/engine/**'`and`'features/stockfish-analysis/**'`exclusions in`vitest.config.ts`**
- [ ] **Step 2: Run `npm run test:coverage` to verify all thresholds pass (>=90% branches in lib & features)**
- [ ] **Step 3: Commit Task 2 changes**

---

### Task 3: Protect Production Routes (Test Harnesses)

**Files:**

- Modify: `app/phase-1-test-harness/page.tsx`
- Modify: `app/phase-2-test-harness/page.tsx`
- Modify: `app/phase-3-test-harness/page.tsx`

- [ ] **Step 1: Add environment gating (`notFound()` if `process.env.NODE_ENV === 'production'`) to test harness routes**
- [ ] **Step 2: Run `npm run build` to verify clean build**
- [ ] **Step 3: Commit Task 3 changes**

---

### Task 4: Eliminate `any` Type Casts in Persistence & Ingestion

**Files:**

- Modify: `lib/db/repositories.ts`
- Modify: `features/ingestion/retryPolicy.ts`

- [ ] **Step 1: Replace `meta.value as any` with runtime type guard in `getArchiveListMeta`**
- [ ] **Step 2: Replace `(error as any).retryAfterMs` with type-safe property extraction in `retryPolicy.ts`**
- [ ] **Step 3: Run `npm run typecheck` and `npm run test`**
- [ ] **Step 4: Commit Task 4 changes**

---

### Task 5: 50-Move Draw Rule in Terminal Evaluation & WebKit Test Timeout

**Files:**

- Modify: `features/stockfish-analysis/analyzeGame.ts`
- Modify: `tests/e2e/opening-worker.spec.ts`

- [ ] **Step 1: Add `chess.isDraw()` to `terminalPositionEvaluation` in `analyzeGame.ts`**
- [ ] **Step 2: Set `test.setTimeout(60_000)` in `tests/e2e/opening-worker.spec.ts`**
- [ ] **Step 3: Run unit tests and opening-worker E2E test**
- [ ] **Step 4: Commit Task 5 changes**

---

### Task 6: Formatting and End-to-End Verification

**Files:**

- Modify: `docs/superpowers/plans/2026-08-13-ingestion-status-card.md`
- Modify: `docs/superpowers/plans/2026-08-13-premium-board-first-frontend-redesign.md`
- Modify: `tests/e2e/smoke.spec.ts`
- Modify: `tests/e2e/workspace-accessibility.spec.ts`

- [ ] **Step 1: Run `npx prettier --write .`**
- [ ] **Step 2: Run `npm run verify`**
- [ ] **Step 3: Confirm all Playwright tests pass (Chromium, Firefox, WebKit, Mobile, Tablet)**
- [ ] **Step 4: Commit final remediation changes**
