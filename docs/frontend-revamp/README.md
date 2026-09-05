# Frontend revamp: agent handoff

Status: ready for implementation; implementation has not started.
Prepared: 2026-09-05. Code inspected at commit `b1aff34`.

For a copy-pasteable implementation assignment, start with [Agent guideline and prompt](./agent%20guideline.md).

For resumed work, read [Progress checkpoint](./progress.md) first, then reconcile it with the current checkout using the guideline's resume procedure. A dedicated subagent maintains this checkpoint throughout implementation.

## Objective

Replace the current form-and-card presentation with a chess.com-inspired chess review workspace: compact navigation, a large board, and a focused contextual panel. This package fixes the design decisions; it is not an invitation to choose a different design.

## Read and execute in this order

1. [Design contract](./00-design-contract.md): binding requirements for every phase.
2. [Phase 1: shell and navigation](./01-shell-and-navigation.md).
3. [Phase 2: board presentation](./02-board-presentation.md).
4. [Phase 3: import and game library](./03-import-and-library.md).
5. [Phase 4: review and analysis](./04-review-and-analysis.md).
6. [Phase 5: opening explorer](./05-opening-explorer.md).
7. [Phase 6: release verification](./06-release-verification.md).

Execute phases sequentially. Each phase produces a working application, includes its own checks, and must pass its exit gate before the next phase starts. Phase 6 consolidates verification; it does not postpone accessibility, responsiveness, or testing from earlier phases.

Read the repository's current `AGENTS.md` before executing. These documents do not override it. The existing `frontend_review.md` is historical context and is not a specification. If the checkout has materially different types or behavior, document the discrepancy and reconcile the affected contract before implementing it. Do not silently weaken a requirement.

## Scope and approval

The user requested this documentation package. Creating it does not authorize this author to implement or commit the redesign. The receiving agent should implement when instructed to do so. No deployment, push, new service, account, paid resource, or external messaging is part of this package.

Use the `superpowers:executing-plans` skill when available. The user requires a dedicated progress-tracking subagent to maintain `progress.md`; follow the assignment, save cadence, acknowledgment, and fallback rules in the agent guideline. Keep implementation phases sequential; the tracker writes only the progress checkpoint, not application code.

## Universal execution procedure

1. Record `git status --short` and preserve pre-existing edits, including the existing `AGENTS.md` modification.
2. Inspect the listed source files and current tests. Read the relevant installed Next.js guides under `node_modules/next/dist/docs/` before changing Next.js code. Do not assume APIs from another version.
3. Run the phase's existing targeted tests before modifying production code. Investigate any failure independently and record whether it is a production defect, a test-contract defect, or an intentional visual-baseline change.
4. Add meaningful behavioral cases specified by the phase. Observe their failure before implementing the behavior. Pure styling changes require visual inspection, not assertions that merely repeat CSS values.
5. Implement tasks in numbered order. Keep presentation state in the client workspace and domain state in the existing controller.
6. Run targeted checks, inspect desktop/mobile output, and reconcile intentional test changes. Never update an expectation merely to turn a failing test green.
7. Run `npm run verify` and wait for its actual exit result before declaring a phase complete or committing. Fix every formatter, lint, type, coverage, build, and test failure. Do not lower thresholds or disable tests.
8. Record the phase handoff described below. Commit only when authorized and after verification passes. Do not push automatically.

Throughout these steps, send checkpoint updates to the progress subagent before tasks/long-running commands and after edit batches/test results, at least every five minutes during sustained work. Wait for each saved acknowledgment before the next code-edit batch. Flush the checkpoint before a phase transition or planned stop. `progress.md` is the current restart state; `implementation-log.md` is the detailed historical evidence.

## Phase handoff record

Maintain `docs/frontend-revamp/implementation-log.md` during implementation, with one section per phase. Record:

- Completed task IDs and requirements satisfied.
- Changed production files.
- Every changed test/assertion, its previous contract, new contract, and reason.
- Every changed snapshot filename and inspected visual difference.
- Commands run, actual exit results, and any environment limitation.
- Any unresolved item. Leave it pending; do not call the phase complete.

The log is created by the implementer, not pre-populated with imaginary results. Checkboxes in these plans remain unchecked until the corresponding implementation is verified.

## Completion definition

All six phase exit gates pass, every requirement in the design contract has evidence, and the full verification command passes. A screenshot that merely looks attractive is insufficient: importing, selecting, analysing, exploring variations/openings, cancellation, cached data, and keyboard operation must still work.
