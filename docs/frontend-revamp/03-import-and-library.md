# Phase 3: import and game library implementation plan

> For agentic workers: use `superpowers:executing-plans` when available. Execute tasks in order and track the checkboxes.

**Goal:** Make importing games a clear first action and browsing games compact and readable.
**Architecture:** Keep the ingestion service and query validation unchanged. Add presentation-only UTC date presets and restyle the existing GameSelector.
**Tech stack:** Existing React, TypeScript, CSS, Vitest and Playwright.
**Spec:** [Design contract](./00-design-contract.md).
**Prerequisite:** Phase 2 exit gate passed.
**Global constraints:** No new API calls, profile fetching, persistence schema, game parsing rules, or invented game metadata.

## Task 3.1 — deterministic date presets

Files: create `features/ingestion/datePresets.ts`, `tests/unit/ingestion/datePresets.test.ts`; modify `components/controls/GameQueryForm.tsx`, `tests/dom/components/GameQueryForm.test.tsx`.

```ts
export type DatePreset = 'last30' | 'thisMonth' | 'all' | 'custom';
export function resolveDatePreset(
  preset: Exclude<DatePreset, 'custom'>,
  now: Date
): { dateFrom: string; dateTo: string };
```

`last30`: UTC calendar date today minus 29 days through UTC today, inclusive. `thisMonth`: UTC first day of this month through UTC today. `all`: both empty strings (converted to omitted query fields by the existing submit path). Use UTC constructors/getters; do not subtract local calendar days. `custom` preserves the current input values and is handled in the form, not the helper. Helper must not call Date.now or mutate its input.

Default on a fresh form without a recent query: Last 30 days. When a recent query exists, preserve its dates exactly; select Custom if either date exists, otherwise All available. Selecting a preset replaces date fields, invokes onDraftChange once with the completed draft, and does not submit. Editing either date selects Custom. User preferences for maximum games, colors, time classes, rated status, and opening horizon retain existing defaults.

- [ ] Add exact UTC cases: now 2026-09-05T12:00Z -> last30 2026-08-07..2026-09-05; thisMonth 2026-09-01..2026-09-05; all empty strings. Include January year rollover and leap-year February.
- [ ] Run new helper tests and observe expected missing-implementation failure; implement helper and rerun.
- [ ] Add form cases for preset selection, preserving recent queries, switching to Custom, and unchanged validation on inverted dates.
- [ ] Implement a labeled native radio group **Date range** with visible labels Last 30 days, This month, All available, Custom. Use a two-column grid; no custom keyboard radio implementation.

## Task 3.2 — onboarding and import states

Files: modify `components/controls/GameQueryForm.tsx`, `components/workspace/ChessWorkspace.tsx`, `components/feedback/IngestionProgress.tsx`, `components/feedback/DiagnosticSummary.tsx`, `components/feedback/OfflineCacheNotice.tsx`, `app/globals.css`.

First-visit Games panel: max-width 520px, centered, padding 24px (16px below 480px). Heading **Review your games** (24px bold); body **Enter your Chess.com username to import games and explore your play.** Username input then date preset group then **Game filters** disclosure then **Load games** primary button. Show native From date / To date controls only for Custom. Keep UTC helper text beside those controls. No sample board, marketing illustration, fake statistics, or empty game list beneath it.

Game filters contains existing maximum-games, time-class, color, rated-status, and opening-horizon fields; use native controls and preserve limits. An invalid field opens the disclosure/custom dates as needed and receives focus after submission. A diagnostic summary remains visible. Form input values survive drawer close/reopen via the existing draft mechanism; preset selection must be inferred from draft on remount as specified in Task 3.1.

| State               | Required presentation/action                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idle                | Load games primary action                                                                                                                                                  |
| Loading             | Existing cancel action; disabled submit and query fields; determinate progress only when total archive count > 0; otherwise indeterminate progress with fetched-game count |
| Complete, games > 0 | Close drawer if open; Games view; focus heading; show “{count} games loaded” status once                                                                                   |
| Partial, games > 0  | Same navigation, with persistent “Some games could not be imported.” notice and Diagnostics disclosure above library                                                       |
| Empty               | Keep form visible; “No games found for these filters.”; editable filters; Load games remains available                                                                     |
| Failed              | Keep form; existing specific error message and retry through Load games; preserve draft                                                                                    |
| Cancelled           | Keep form; “Import cancelled.”; retain results exposed by the existing controller; View games button only if games are available                                           |
| Offline cache used  | Existing offline/cached-data notice above available games; do not claim fresh data                                                                                         |

Progress percentages use existing archive counts and clamp 0..100; never use a timer to simulate progress. Keep diagnostic codes inside the expandable diagnostics body; render user-facing summary outside it. Do not discard warnings when drawer closes.

- [ ] Run ingestion feedback tests, then add cases for the table's focus/visibility contracts.
- [ ] Implement onboarding and form layout; retain the Phase 1 single-form rule.
- [ ] Wire transition notices to existing ingestion result/status, not a second request state machine.
- [ ] Verify form stays reachable after empty, failure, cancellation, and offline-cache results.

## Task 3.3 — compact game rows

Files: modify `components/analysis/GameSelector.tsx`, `components/workspace/ChessWorkspace.tsx`, `app/globals.css`; modify `tests/dom/components/GameSelector.test.tsx`, E2E workspace fixtures/helpers.

Keep GameSelector's current games, selectedGameId, onSelect, onAnalyze, analysisStatus, hasLoaded contract. Header **Games** with count; search input label **Filter games**, placeholder **Opponent name**; native sort label **Sort games** with existing Newest first / Oldest first / Opponent rating options. Do not add filters that are not implemented.

Each game row is a single selection button, minimum height 76px, padding 12px, 8px vertical list gap; no outer card around each row. Top line: opponent name and opponent rating at left; textual Win/Draw/Loss badge at right. Second line: time class, date, review status. Keep user color and both ratings in the accessible name and in the selected-game detail line. Use existing locale date formatting. Unknown opponent uses the existing fallback. Result badge: green Win, neutral Draw, red Loss, always with text. Selected row uses selected background and 3px left accent; selection does not start analysis.

Selected-game detail line immediately above list: “{White name} ({rating}) vs {Black name} ({rating})”; truncate visually without hiding accessible content. One primary **Review game** button appears with this line. It invokes onAnalyze(selectedGameId), selects Review mode, and does not start analysis. If the selected record has no parseable PGN or zero parsed plies, disable Review game and show **This game has no reviewable moves.** Preserve row selection and display that same text in the board region. Pass an optional `reviewDisabledReason?: string` from ChessWorkspace, where parsing already occurs, rather than parsing every row during render.

Status mapping in ChessWorkspace: no result = Not reviewed; result complete = Reviewed; result partial/cancelled = Partial review; result failed = Review failed; selected current running job = Analysing… . Do not map every cached result to Reviewed. Preserve existing search/sort behavior and show **No games match this filter. Try another opponent name.** when filtering has no matches. The pre-import state is owned by onboarding, not by an empty library panel.

- [ ] Test row selection does not call analysis; Review game calls onAnalyze exactly once; invalid PGN prevents review; result statuses distinguish complete/partial/failed.
- [ ] Implement compact rows and selected detail/action; remove the long old Stockfish CTA and unnecessary nested surface borders.
- [ ] Update E2E `loadFixtureGames` to choose Custom before filling dates and expand Game filters before setting maximum games. Keep fixtures deterministic; no live API dependency.
- [ ] Inspect 20+ rows, long names, zero search results, cached results, and narrow-width controls. On desktop list uses remaining panel space with its own scrollbar; search/header/action remain visible. On stacked layouts use normal document flow and no fixed tall empty list.

## Acceptance and checks

```powershell
npx vitest run tests/unit/ingestion/datePresets.test.ts tests/dom/components/GameQueryForm.test.tsx tests/dom/components/GameSelector.test.tsx tests/dom/components/IngestionFeedback.test.tsx tests/dom/ingestion
npx playwright test tests/e2e/workspace.spec.ts tests/e2e/workspace-responsive.spec.ts tests/e2e/workspace-accessibility.spec.ts --project=chromium
npm run verify
```

Exit gate: fresh visit has one clear import action; date ranges are deterministic in UTC; all query options remain available; complete/partial/empty/cancel/error/cache states meet the table; library selection and review navigation work without auto-analysis; full verification passes. Log intentional onboarding/library snapshot and assertion changes.
