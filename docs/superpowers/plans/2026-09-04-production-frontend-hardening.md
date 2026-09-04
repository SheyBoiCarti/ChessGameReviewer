# Production Frontend Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the local chess reviewer reliable and polished enough for a public release.

**Architecture:** Keep the workspace controller and services intact, adding local preference/query persistence at the hook boundary and targeted presentation changes in existing components. The reducer selects the newest imported game; global CSS supplies a clear visual hierarchy and responsive layout.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, IndexedDB, browser local storage.

**Spec:** `docs/superpowers/specs/2026-09-04-production-frontend-hardening-design.md`

## Global Constraints

- Preserve local-only storage and existing ingestion, analysis, and board behavior.
- Do not add dependencies.
- The user requested no automated tests; use static checks and manual browser inspection.

---

### Task 1: Make import state dependable

**Files:**
- Modify: `components/controls/GameQueryForm.tsx`
- Modify: `features/workspace/reducer.ts`
- Modify: `features/workspace/useWorkspace.ts`
- Modify: `components/workspace/ChessWorkspace.tsx`

- [x] Render every validation diagnostic beside its field and validate the opening horizon before query submission.
- [x] Select the newest returned game after a non-empty ingestion result.
- [x] Persist valid preferences and the last submitted query in browser local storage.
- [x] Offer a previous-search action in the import rail without automatically fetching.

### Task 2: Make destructive and fallback states safe

**Files:**
- Modify: `components/controls/LocalDataSettings.tsx`
- Modify: `app/error.tsx`
- Create: `app/global-error.tsx`
- Delete: `app/phase-1-test-harness/page.tsx`
- Delete: `app/phase-2-test-harness/page.tsx`
- Delete: `app/phase-3-test-harness/page.tsx`

- [x] Use the established backdrop, focus, and inert-background pattern for local-data confirmation.
- [x] Apply a distinct destructive action treatment while retaining clear-all for orphaned records.
- [x] Provide a root-layout error fallback and remove non-production routes.

### Task 3: Recompose the review workspace

**Files:**
- Modify: `components/analysis/GameSelector.tsx`
- Modify: `components/workspace/WorkspaceTabs.tsx`
- Modify: `components/workspace/ChessWorkspace.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

- [x] Replace generic game-selection buttons with information-rich cards.
- [x] Remove the nested main landmark and simplify tab labels.
- [x] Reduce workspace chrome, refine empty/loading copy, and use primary, secondary, ghost, and danger button roles consistently.
- [x] Correct undefined CSS tokens and make every responsive width intentional.

### Task 4: Verify and ship

**Files:**
- Modify: `docs/superpowers/plans/2026-09-04-production-frontend-hardening.md`

- [x] Run formatting, lint, typecheck, and production build checks permitted by the user instructions.
- [x] Inspect the production browser manually for responsive layout, collapsed filters, saved-search resume, and browser errors.
- [x] Commit the completed work and push `main` to `origin`.
