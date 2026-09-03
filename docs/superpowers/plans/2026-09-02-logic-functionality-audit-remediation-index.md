# Logic and Functionality Audit Remediation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coordinate six independently reviewable plans that resolve every finding in the 2026-09-02 logic and functionality audit.

**Architecture:** The program fixes correctness at subsystem boundaries rather than through a broad rewrite. PGN validation and cancellation establish reliable ingestion results first; deletion then builds on deterministic cancellation, while graph budgeting, evaluation retention, and verification cleanup remain isolated deliverables.

**Tech Stack:** Next.js 16.3.0, React 19, TypeScript 5.7, chess.js 1.4, Web Workers, IndexedDB, Vitest 3.2, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-09-02-logic-functionality-audit-remediation-implementation-spec.md`

## Global Constraints

- Use test-driven development: add a failing regression test before changing production behavior.
- Preserve the current `GameQuery.maxGames` range of 1 through 5000.
- Never parse PGNs or build opening graphs on the UI thread.
- Keep diagnostics bounded to 100 detailed entries and 20 distinct codes at every worker/UI boundary.
- Preserve newest-month-first archive traversal and stable cross-month deduplication.
- Do not persist invalid PGNs or duplicate raw monthly payloads.
- Deletion must win over every operation that began before the user confirmed deletion.
- Graph byte-limit enforcement must be deterministic and must never split a game.
- Cache failures must not invalidate a successfully computed engine analysis.
- Do not add a new runtime dependency unless the existing platform and `chess.js` cannot implement the requirement.
- Follow the Next.js 16.3 guidance in `node_modules/next/dist/docs/` before changing Next-specific APIs or configuration.
- Do not regenerate visual baselines until the rendered change has been reviewed as intentional.

---

## Execution order

1. `2026-09-02-pgn-validation-and-diagnostics.md`
2. `2026-09-02-ingestion-cancellation-results.md`
3. `2026-09-02-local-data-deletion-quiescence.md`
4. `2026-09-02-serialized-graph-budget.md`
5. `2026-09-02-evaluation-cache-retention.md`
6. `2026-09-02-browser-verification-and-scope-status.md`

Plans 1 and 2 are sequential because both restructure monthly ingestion. Plan 3 consumes the deterministic cancellation behavior from Plan 2. Plans 4 and 5 may begin only after Plan 3 passes its deletion-race tests, avoiding simultaneous edits to workspace service contracts. Plan 6 runs last and owns the full verification matrix.

## Program completion gate

- [ ] Every checkbox in all six linked plans is complete.
- [ ] Each plan has passed its focused verification commands and received a review checkpoint.
- [ ] Run `npm run verify` from the repository root and record exact results.
- [ ] Run `git diff --check` and confirm the working tree contains only intended changes.
- [ ] Confirm the canonical requirements document marks `FR-ADV-001` through `FR-ADV-006` as deferred.
- [ ] Confirm no known audit finding remains open or undocumented.
