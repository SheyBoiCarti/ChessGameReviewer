# Phase 6: release verification implementation plan

> For agentic workers: use `superpowers:executing-plans` when available. Execute tasks in order and track the checkboxes.

**Goal:** Verify the completed redesign across themes, screen sizes, interaction modes, and failure states, then produce an auditable handoff.
**Architecture:** Keep application contracts from Phases 1–5. Consolidate fixtures, visual baselines, and behavioral coverage; remove only obsolete presentation code.
**Tech stack:** Existing Vitest, Playwright, axe, TypeScript, ESLint, Prettier, Next.js build.
**Spec:** [Design contract](./00-design-contract.md) and all completed phase plans.
**Prerequisite:** Phase 5 exit gate passed.
**Global constraints:** Do not lower coverage, skip failing tests, regenerate images blindly, change engine behavior to satisfy UI tests, or alter CSP/isolation policy.

## Task 6.1 — presentation cleanup and coverage audit

Files: `app/globals.css`, changed workspace/component files, `tests/dom/components`, `tests/e2e`, `docs/frontend-revamp/implementation-log.md`.

- [ ] Search for old gold token names, removed header/rail selectors, and old long CTA/status copy. Remove aliases only after all consumers use semantic tokens. Keep intentional domain terminology inside engine/diagnostic details.
- [ ] Remove Phase 1 temporary shared-mode body; confirm Review and Analysis each meet Phase 4.
- [ ] Confirm no duplicate forms/IDs, unused component imports, hidden duplicate analyzer, or extra useWorkspace instance exists. Do not remove unrelated legacy files merely because they are unused by this page.
- [ ] Map each design section to evidence in the implementation log: layout/navigation -> Phase 1; board -> Phase 2; entry/library -> Phase 3; analysis/lifecycle -> Phase 4; opening outcomes -> Phase 5; themes/accessibility/regression -> this phase.
- [ ] Add missing behavioral tests identified by the audit. Existing coverage thresholds remain 80% branches/functions/lines/statements globally and 90% branches for the configured API/validation/graph paths. Do not exclude new presentation helpers to bypass coverage.

## Task 6.2 — deterministic visual coverage

Files: modify `tests/e2e/workspace-visual.spec.ts`, `tests/e2e/helpers/workspaceFixtures.ts`; create `tests/e2e/helpers/reviewWorkerFixture.ts`; update matching snapshot files after inspection.

Retain existing baseline scenarios (initial query, loaded board, opening tree, analyzer unavailable, mobile workspace), adjusting scenario actions for the intended UI. Add dark-theme snapshots named `review-idle.png`, `review-complete.png`, `analysis-variation.png`, `import-drawer.png`, and `settings.png` at 1440x900. Add light-theme `loaded-board-light.png` and `review-complete-light.png`. Add stacked `review-mobile.png` at 390x844. Existing project suffixes/browser/platform naming remain Playwright-controlled.

Use current ingestion routes for game data. For completed-review E2E screenshots, use the test-owned Worker proxy specified below; do not seed a fictitious persisted GameAnalysisResult (the app currently persists position evaluations, not the complete review object). Do not expose a production test endpoint or new query parameter. Keep existing real-engine functional tests running without this proxy.

`reviewWorkerFixture.ts` exports `installReviewWorkerFixture(page: Page): Promise<void>`. Prepare a serializable FEN-to-EvaluationResult map in the test process with chess.js, using every before/after FEN in the existing two-game archive fixture. For each FEN, sort legal moves by UCI lexicographically; use the first as bestMove, with one line `{ multiPv: 1, depth: 14, score: { kind: 'cp', value: 0 }, pv: [bestMove] }`. Add a second line for the second legal move with `multiPv: 2` and score -20. All scores are side-to-move UCI scores. Terminal positions use `bestMove: '0000'`, empty PV and a cp 0 line. These are deliberately artificial deterministic engine responses for layout tests, not chess-strength assertions.

Install the proxy using `page.addInitScript` before navigation, retaining the original Worker constructor. Defer constructing the real worker until the first postMessage. If the first message has protocolVersion 1, nonempty jobId, and type INITIALIZE with mode single-thread/threaded, classify that instance as the Stockfish fixture. Otherwise instantiate the original Worker with the original URL/options and forward the first message and all subsequent calls/events; ingestion/graph workers must remain real. Preserve add/removeEventListener, onmessage/onerror forwarding, postMessage, and terminate. For the fixture instance, dispatch asynchronous MessageEvents (queueMicrotask) using the exact request jobId/protocolVersion:

| Request                   | Response                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| INITIALIZE                | READY                                                                                                  |
| EVALUATE with mapped FEN  | RESULT with the map's EvaluationResult; limit line count to requested multiPv                          |
| EVALUATE with unknown FEN | FAILED, code FIXTURE_FEN_MISSING, message including FEN; test fails rather than silently using a score |
| STOP                      | STOPPED; suppress any pending result for cancelled work                                                |
| NEW_GAME                  | READY; keep immutable fixture map                                                                      |
| DISPOSE                   | STOPPED, then mark disposed and discard pending result delivery                                        |
| terminate                 | Mark disposed; discard pending delivery and remove listeners; no response                              |

Verify READY/RESULT shapes against `workers/stockfish.protocol.ts`; do not change that production protocol. Add fixture isolation assertions: importing still builds a real graph; completed-review has the expected annotation count; switching view does not add a second INITIALIZE for an already initialized service. Trigger Run review and wait for Review complete before snapshot. For analysis-variation, switch Analysis, return to start, play a legal alternative to the recorded first move, and assert Exploring a variation before capture. The proxy must not be enabled in the analyzer-unavailable scenario.

Cover mistake, blunder, indeterminate accuracy, odd final ply, and distinct upstream accuracy through typed DOM fixtures in Phase 4; visual fixture scores must not be changed to force particular heuristic classifications. Use parseGamePgn/chess.js to produce valid FEN/UCI pairs for DOM variation cases; `createLongGameAnalysisResult` has synthetic UCI/PV data and must not be used unchanged to exercise legal moves. Freeze browser clock at 2026-09-05T12:00:00Z before navigation for date-preset screenshots. Continue masking locale/dynamic dates where needed. Disable animations and wait for font readiness, selected board position, and intended result status before capture.

- [ ] Run existing visual tests first and inspect failures. Record intended design changes separately from unexpected breakage.
- [ ] Add the named scenarios and deterministic result setup. Confirm each scenario actually reaches its named state with a semantic assertion before screenshot.
- [ ] Inspect old/new desktop and mobile images using an image viewer. Check clipping, focus rings, player order, board aspect, readable labels, missing controls, and excessive empty space.
- [ ] Update only inspected snapshots. Generate baselines separately on supported Windows/Linux environments; never copy one platform's file under the other platform suffix. If a required environment is unavailable, record that limitation and leave its validation pending rather than inventing evidence.

## Task 6.3 — responsiveness and accessibility matrix

Modify `tests/e2e/workspace-responsive.spec.ts` and `tests/e2e/workspace-accessibility.spec.ts`; preserve existing meaningful assertions while replacing intentional old-layout assumptions.

| Check                      | Exact pass condition                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Widths 1279/1280           | Icon rail below 1280; labeled 168px rail at 1280; no inaccessible navigation                                                |
| Widths 959/960             | Menu/stacked below 960; 64px rail/two columns at 960                                                                        |
| 1440x900 and 1024x768      | Board square formula within 2px; playback present; board/panel top alignment within 2px                                     |
| 1024x600                   | Short-window document scrolling; board remains square/useful; no negative sizing or clipped controls                        |
| 768x1024, 390x844, 320x568 | Header then board then panel; playback one row at >=320; tabs never wrap                                                    |
| 200% zoom and 200px width  | All controls reachable; horizontal document overflow <=1px; content can scroll vertically                                   |
| Keyboard global navigation | All view and modal controls reachable with Tab; no keyboard trap outside modal                                              |
| Review tabs                | ArrowLeft/Right, Home/End select/focus correctly; only selected tab in normal tab order                                     |
| Board                      | Arrow keys, select/move, Escape, promotion, flip, first/last navigation retain existing semantics                           |
| Modal                      | Focus contained, background inert, Escape/backdrop/Close behavior correct, focus restored or intentionally moved on success |
| Themes                     | Dark/light/system all render readable controls, board overlays, result bars, and errors                                     |
| Reduced motion             | UI works with transitions disabled                                                                                          |
| Long content               | Long names, 20+ games, 40+ plies, long opening path do not force horizontal document scroll                                 |

Run axe against onboarding, loaded Games, Review, Analysis, Openings, Settings, and open Import/Menu/About dialogs in applicable viewports. No unwaived violations. Verify text contrast at least 4.5:1 for normal text and 3:1 for large text; control boundaries/focus indicators at least 3:1. If the fixed palette fails an actual contrast check in a specific usage, change that usage to a stronger existing semantic token first. Document any necessary token adjustment and apply it consistently across themes; accessibility takes precedence over an exact hex value.

- [ ] Update old tests asserting automatic mobile import or global tab roles with new user-facing contracts. Keep the original functionality checks; do not merely delete failing assertions.
- [ ] Run the matrix and inspect any failing viewport independently.
- [ ] Run keyboard/focus and axe checks in all configured browser/device projects supported by the environment.

## Task 6.4 — final verification and handoff

Run commands sequentially and wait for each actual result:

```powershell
npx prettier --check docs/frontend-revamp
npm run verify
git diff --check
git status --short
```

`npm run verify` runs formatting, lint, types, coverage, build, and the complete E2E suite. Do not replace it with a subset, assume success from partial output, or suppress formatter warnings. If browser installation or platform availability blocks verification, document the exact failed command and leave release verification pending.

- [ ] Confirm all previous phase requirements have evidence and all plan checkboxes reflect actual work.
- [ ] Complete implementation log with exact command results, every changed test/assertion, every changed visual baseline, and reasons.
- [ ] Send the final verified state to the progress-tracking subagent, wait for its saved acknowledgment, and inspect `progress.md`. All phase states must match their actual exit-gate evidence; any unresolved work remains pending or blocked with an exact resume action.
- [ ] State unchanged engine/data contracts and any concrete remaining limitation supported by evidence.
- [ ] If committing is authorized, commit only after full verification passes. No automatic push or deployment.

Exit gate: all requirements covered, inspected visual baselines, no unresolved verification failure, clean diff whitespace, and a complete handoff. Report completion only after this gate passes.
