# Agent prompt: execute the frontend refactor

Use this document as the implementing agent's task prompt. Paths below are relative to the repository root unless linked relative to this file.

## Your assignment

Implement the frontend redesign of **Local Chess Game Reviewer** described in `docs/frontend-revamp`. Deliver the complete, tested redesign through the six specified phases. This is an implementation assignment: inspect the code, make the changes, verify them, and produce an evidence-backed handoff.

The intended result is a chess.com-inspired workspace with warm charcoal surfaces, green actions, compact navigation, a dominant chessboard, and focused Review/Analysis panels. The design decisions have already been made. Follow the design contract; do not restart brainstorming, propose alternative designs, or stop after producing another plan.

Reading this file during an unrelated task does not authorize implementation. When the user assigns this prompt, proceed through the authorized phases without asking for permission again at each routine step. Do not commit, push, deploy, or contact external parties unless separately authorized.

## 1. Establish the source of truth

Read these before editing:

1. The current repository `AGENTS.md` and applicable instructions in parent/nested directories.
2. [Package overview](./README.md).
3. [Design contract](./00-design-contract.md), in full.
4. All six phase documents once, to understand dependencies; then reread the active phase before executing it.

Repository instructions and the user's current instructions govern execution. The design contract governs product behavior and appearance; phase plans govern order and implementation details. `frontend_review.md` and the earlier exploratory suggestions are historical material, not requirements. In particular, implement the contract's two Review/Analysis tabs and separate Openings navigation.

Use `superpowers:executing-plans` if that skill is available. A dedicated progress-tracking subagent is required by the user; its role is defined in Section 7. Implementation phases still run sequentially. Do not assume that a skill or tool exists; use the explicit fallback below if subagent tools are unavailable.

If specifications conflict with each other, identify the exact conflicting passages. Resolve a technical mismatch without changing the product contract when possible, and record the resolution. If resolution requires a product decision or changes scope, ask one focused question and continue independent work. Do not silently select a different behavior.

## 2. Inspect and establish a baseline

1. Run `git status --short` and record pre-existing edits. Preserve them throughout the task. At documentation time, `AGENTS.md` was already modified; recheck current status rather than assuming ownership.
2. Inspect `package.json`, `playwright.config.ts`, and `vitest.config.ts`. Use installed dependencies and existing commands. Do not upgrade packages, install a component library, or alter lockfiles.
3. Read the relevant installed Next.js guides in `node_modules/next/dist/docs/` before changing Next.js code. This repository uses a version whose APIs must be checked locally.
4. Trace the existing path from `app/page.tsx` through `ChessWorkspace`, `useWorkspace`, the controller, and the rendered panels. Identify who owns selection, ingestion, engine jobs, graph navigation, and variation state.
5. Inspect current browser output and existing screenshots. Examine both the initial state and a loaded game; screenshots alone do not establish current runtime behavior.
6. Run the active phase's existing targeted tests before modifying code. Read the complete output. Investigate pre-existing failures separately from the redesign.
7. Read `docs/frontend-revamp/progress.md` before choosing the starting task, and start the progress-tracking subagent before the first implementation edit. Reconcile the checkpoint with the actual checkout as specified in Section 7. Create or resume `docs/frontend-revamp/implementation-log.md` as the detailed phase record. Never pre-fill successful test results or completed tasks.

Use an isolated checkout/worktree only when needed to protect unrelated work. Do not discard changes, reset the branch, or move the user's files to obtain a clean baseline.

## 3. Execute in this exact order

| Order | Specification                                        | Deliverable before advancing                                                                                                                   |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | [Shell and navigation](./01-shell-and-navigation.md) | Semantic theme tokens, original interface icons, single header, responsive navigation, two-column layout, modal import, correct focus behavior |
| 2     | [Board presentation](./02-board-presentation.md)     | Player strips, simplified frame, specified board sizing, compact playback, correct evaluation/variation presentation                           |
| 3     | [Import and library](./03-import-and-library.md)     | UTC date presets, clear onboarding, complete ingestion states, compact game rows, explicit Review game action                                  |
| 4     | [Review and analysis](./04-review-and-analysis.md)   | Distinct Review/Analysis modes, full move navigation before analysis, summary/feedback, next-mistake navigation, complete engine lifecycle UI  |
| 5     | [Opening explorer](./05-opening-explorer.md)         | Compact candidate table, truthful outcome bars, preserved detailed metrics, breadcrumbs and move-order behavior                                |
| 6     | [Release verification](./06-release-verification.md) | Removed transitional presentation code, inspected baselines, complete accessibility/responsive coverage, final verification and handoff        |

Within each phase, execute numbered tasks in order. Read its file list and interfaces before creating components. Implement the smallest cohesive change that satisfies the task; reuse the named components. Do not implement a later phase early simply because you are already editing the same file.

The temporary shared analyzer body in Phase 1 is explicitly allowed only until Phase 4. Record it in the log and remove it when Phase 4 lands. Do not introduce additional temporary mock features or dead controls.

After a task, run the targeted checks and inspect the changed behavior. After a phase, satisfy its complete exit gate and run `npm run verify`, waiting for the actual result. Advance only after failures are resolved. Phase 6 does not excuse postponing visual inspection, responsiveness, accessibility, or tests.

## 4. Preserve these boundaries

- Keep one mounted `useWorkspace` instance and the existing controller as the authority for domain state. Presentation navigation and drawer state belong in the client workspace.
- Preserve existing game-selection, cancellation, relevance-token, cache, and worker behavior. Switching tabs or opening Settings must not create duplicate engine jobs.
- Do not modify Stockfish presets, evaluation normalization, accuracy heuristics, graph aggregation, API contracts, cache keys, database schemas, worker protocols, CSP, or isolation headers to make presentation easier.
- Preserve the current board renderer and chess interaction handlers. Do not replace drag/drop, keyboard navigation, promotion, or variation logic with a new board library.
- Do not add routes, accounts, remote fonts/avatars, cloud analysis, generated coaching explanations, new import formats, or other features outside the contract.
- Reuse existing assets and create only the specified original interface icons. The reference product's branding and illustrations are not assets for this project.
- Keep CSS changes coherent: update or remove obsolete rules at their source. Avoid accumulating contradictory overrides, arbitrary one-off spacing, and broad selectors that affect unrelated dialogs or controls.

## 5. Pay particular attention to these failure modes

### Chess state and move identity

- `MovePly` has no `mover` field. Derive mover from `fenBefore`; derive displayed fullmove number from its sixth FEN field. Keep sequential `ply` as selection identity.
- Populate the move list from parsed game moves, not only engine annotations. Missing annotations mean “Not analysed”, not zero evaluation or an absent move.
- Distinguish the position before a played move from the position after it. Best alternative feedback uses `annotation.before` and `fenBefore`; the board's next-position suggestion uses `annotation.after` at the selected after-position.
- Keep board orientation independent from score perspective. Flipping the board must not change the game, selected ply, accuracy, or outcome statistics.
- During a variation, hide original-game evaluation, arrow, and classification overlays. Original-game graph/list content must be labeled accordingly. Returning to the game must restore the defined position.
- Apply the specified interaction restrictions: Games/Review allow playback, Analysis allows variations, and Openings uses graph navigation.

### Honest results and lifecycle states

- Never conflate local accuracy estimates with Chess.com-provided accuracy. Preserve separate labels and missing-value states.
- Partial, cancelled, failed, unavailable, and complete are distinct states. A cached result does not automatically mean Reviewed.
- Do not auto-start analysis on row selection, navigation, remount, or mode change. Only explicit analysis actions start/resume work.
- Next mistake includes only the specified classifications, searches later plies, and never wraps. It must not claim a partial review found no mistakes in the entire game.
- Outcome bars must use existing aggregate counts and unrounded ratios. Expected score is not win rate. Preserve user/board perspective and sample-size meaning.

### Import and modal behavior

- Dates use UTC calendar boundaries and inclusive ranges. Preserve existing draft/recent-query values according to Phase 3; do not let a preset overwrite a user's edits during remount.
- Mount only one import form. Do not leave duplicate IDs or hidden interactive copies in the page and drawer.
- Preserve drafts on close, keep errors actionable, and distinguish empty results from failures. Do not hide partial/offline notices when the drawer closes.
- Menu, Import, and About must not become nested modals. Focus trapping, background inertness, dismissal, and destination focus must match the contract.

### Responsive layout and accessibility

- Use the specified 960px/1280px breakpoints, dimensions, and short-window override. Do not design only for a wide desktop screenshot.
- Reserve evaluation-bar space so starting analysis does not shift the board. Keep player/toolbar chrome within its normal budget without clipping notices.
- At widths below 320px, preserve target sizes and allow scrolling inside the toolbar; do not force horizontal document overflow.
- A move selection should scroll the move list, not unexpectedly move the entire document or steal keyboard focus.
- Verify light, dark, and system themes, reduced motion, zoom, long usernames, long move lists, and expanded disclosures. Keep visible focus rings and accessible labels when text labels are visually hidden.

## 6. Treat tests as contracts

For every failure:

1. Run the specific test and read its complete failure output.
2. Reproduce and identify the root cause.
3. State whether the defect is production behavior, the test contract, or an intentionally changed visual baseline.
4. Repair the defect. Change an assertion only when this specification intentionally changes what it asserts, and keep an equivalent meaningful user-facing guarantee.
5. Rerun the specific case, then the affected suite. Investigate any newly exposed failure independently.

Add meaningful behavioral tests for new interactions and helpers. Observe their failure before implementing the new behavior. For purely visual adjustments, inspect rendered output and appropriate visual coverage instead of adding tests that only restate CSS values.

Never reduce coverage thresholds, skip tests, replace behavioral assertions with existence checks, or delete old tests simply because their selectors changed. Navigation roles and some labels intentionally change: update selectors while retaining the behavior being protected.

For snapshots, inspect the old and new images before updating a baseline. Record every changed filename and the intended difference. Do not approve snapshots from test success alone or copy Windows baselines into Linux filenames. Follow Phase 6's deterministic worker fixture for review screenshots; preserve the real-engine functional tests. Missing platform access is a recorded verification limitation, not a passing result.

## 7. Communicate and record progress

Begin with a short statement of the phase and concrete work you are starting. During work, report meaningful findings, resolved uncertainties, and the next verification step. Do not ask the user to reconfirm routine implementation decisions already specified here.

Update `implementation-log.md` after each phase with:

- Completed task IDs and supporting requirement evidence.
- Production files changed.
- Every changed test/assertion, previous and new contracts, and reason.
- Every changed visual baseline and inspected difference.
- Exact verification commands and actual terminal outcomes.
- Remaining work or blockers, without marking them complete.

### Required progress-tracking subagent

Assign one dedicated subagent to maintain [progress.md](./progress.md). This is the durable restart checkpoint; `implementation-log.md` remains the detailed evidence record. Do not depend on chat history, an agent's memory, or an in-memory task list for recovery.

Give the tracker this assignment:

> You are the frontend refactor's progress recorder. Own only `docs/frontend-revamp/progress.md`. Read the agent guideline, existing checkpoint, phase plans, implementation log, and read-only Git state. Do not edit application code, tests, specs, or the implementation log; do not commit, run application tests, or infer successful outcomes. On each checkpoint message, record the actual phase/task/substep, edits made, verified versus unverified work, exact test outcomes supplied by the implementing agent, unresolved failures, and the next executable action. Preserve pre-existing user edits and separate facts from unverified reports. Keep the checkpoint concise and self-contained. Save it to disk and acknowledge the checkpoint sequence number only after the write completes. If evidence is missing, mark it unknown or unverified. Never mark a phase complete without its exit-gate evidence.

The implementation agent sends the tracker structured updates containing: checkpoint sequence number, UTC time, phase/task/substep, changed files, last completed action, exact commands and exit results, running processes/session identifiers, blockers/decisions, and next action. Include output-file paths when full failures are too long; use persistent workspace paths, not only chat/tool references. Do not record secrets or credentials.

Checkpoint timing is mandatory:

1. Before the first implementation edit: save baseline and first intended action.
2. Before each numbered task: save the task and intended first substep.
3. After each coherent edit batch and each test result: save the actual state, including failures and unverified edits.
4. Before a long test/build: save command and `running` status; save the exit result when available. A running process is never a pass.
5. During sustained work: send an update at least every five minutes, even if the task has not changed. The implementing agent owns this cadence; do not assume the subagent has an autonomous timer.
6. At phase boundaries and before planned stopping, final responses, or context handoff: flush the latest checkpoint and wait for the tracker's saved acknowledgment.

For every checkpoint, wait for the saved acknowledgment before the next code-edit batch. Read-only inspection can continue while the tracker writes. Keep only one outstanding checkpoint so older messages cannot overwrite newer state. The implementation agent remains responsible for accuracy: inspect the saved checkpoint at phase boundaries. The tracker does not determine whether tests passed or authorize advancing a phase.

Only the tracker writes `progress.md` while it is active. If it fails, confirm it has stopped or interrupt it before replacing it. Start a replacement tracker with the on-disk checkpoint and latest unsaved facts. If subagent tools are unavailable or a usage limit prevents delegation, state that limitation and update the checkpoint directly; recording progress takes priority over losing the handoff. Record that fallback in the checkpoint and return ownership to a tracker when one becomes available. Never allow concurrent writers.

### Required checkpoint content

Keep these sections in `progress.md`:

- Last saved UTC timestamp and monotonically increasing checkpoint number; recorder identity and tracking mode.
- Repository/worktree path, branch, HEAD, and pre-existing edits to preserve.
- Phase table with `pending`, `in_progress`, `blocked`, or `complete`, and evidence links for completed phases.
- Active task ID and substep; last completed action; files edited but not yet verified.
- Latest verification command, scope, exit result, and persisted failure details. Separate targeted passes from full verification.
- Running commands/services with known session IDs or PIDs and whether the recorder has verified they are still running.
- Blockers, decisions, spec discrepancies, and any changes to authorized scope.
- Exact next ordered actions, including file paths and runnable commands where known.
- A short append-only checkpoint history; detailed historical evidence belongs in the implementation log.

### Resume after interruption or usage exhaustion

A replacement agent must read this guideline, `progress.md`, the implementation log if present, and the active phase spec before writing code. Then:

1. Compare current branch, HEAD, worktree, `git status`, and relevant diffs against the saved checkpoint. Preserve edits that arrived after the last save; do not reset them to match the checkpoint.
2. Inspect the active task's source and tests to determine whether an unrecorded edit landed. Treat incomplete task checkboxes and unverified edits as work to investigate, not as proof they need to be repeated.
3. Check whether recorded processes still exist. Tool session IDs may belong to an expired session. Do not assume a running test completed successfully or kill a process without checking its ownership.
4. Resolve uncertain test outcomes by inspecting persistent output or rerunning the smallest relevant check. Do not repeat verified work unless the checkout or evidence has changed.
5. Start a new progress tracker, save the reconciled state, and resume the first genuinely incomplete substep. Do not restart Phase 1 automatically.

Frequent disk checkpoints limit lost context, but a sudden stop can occur between writes. Always reconcile the checkpoint with the actual filesystem; never describe recovery as guaranteed to capture the final unrecorded action.

A real blocker is missing information or an unavailable prerequisite required to proceed. Describe it precisely, continue independent authorized work, and leave dependent work pending. Do not call the redesign complete while a phase exit gate remains unmet.

## 8. Finish with evidence

Run the final commands from Phase 6, including the complete `npm run verify`, and wait for the actual exit status. Do not substitute targeted tests for full verification or claim success from a still-running process.

The final handoff must state:

1. What changed for users and which phases are complete.
2. Verification commands and actual results.
3. Every changed test/assertion/snapshot and why, or a direct link to the complete itemized implementation log.
4. Any unresolved limitation or pending platform check.
5. Git status of the work: uncommitted, committed, or pushed, accurately reflecting actions actually authorized and performed.

The task is complete only when the full design contract, all six phase exit gates, and verification requirements are satisfied. Flush the final progress checkpoint and obtain its saved acknowledgment before reporting completion. For a fresh implementation begin with baseline inspection then Phase 1; for resumed work reconcile the checkpoint and continue the first incomplete substep.
