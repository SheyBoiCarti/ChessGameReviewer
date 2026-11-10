# Exploratory E2E testing report

This is the original pre-fix audit. See [fixes and follow-up verification](exploratory-fixes-verification.md) for the implementation and retest results.

## Scope and method

- **Date:** 10 November 2026, UTC. **Revision:** `55166bce9a28506742e765fb7936e993635ccb7c`.
- Exercised the application through real, headless Playwright browsers using Node CLI scripts. Exploration was driven by visible controls, with source inspection afterward to investigate reproduced failures. Existing E2E/unit suites were not used as evidence of working features.
- Primary browser: Chromium **158.0.8127.18**, Playwright **1.62.1**, Node **22.23.2**; desktop at 1440×1000 and the CDP default desktop viewport. Additional viewport checks: 390×844 and 320×568. A separate Pixel 7 emulation context used touch input and an Android user agent, with a configured 390×844 viewport. Firefox **153.0** and WebKit **26.5** each completed an independent real import/review journey. Exact versions are recorded in [environment.json](exploratory-evidence/environment.json).
- **Real integrations:** direct browser requests to Chess.com's archive, monthly games, profile, and statistics APIs; actual bundled Stockfish workers/WebAssembly; actual IndexedDB/localStorage. No API responses or engine results were mocked. The offline check deliberately disabled browser networking with Playwright.
- Imported `Hikaru` using Last 30 days (500 games), a custom **2026-11-09 to 2026-11-09** inclusive UTC range (12 games), and filtered variations of that range. Counts describe the API data returned during this session, not a permanent fixture. All available was also exercised, cancelled, and restored from locally available data; a complete import of the entire historical account was not performed.
- Initial startup returned HTTP 500 because the supplied `node_modules` lacked `@vercel/analytics/next`. `npm ci` restored lockfile dependencies without changing tracked files. This is an **environment setup finding**, not a confirmed application defect. Initial dev server identified itself as Next 16.3.0; the installed lockfile version after restoration is 16.3.5. Production-build results are recorded below.
- Only report/evidence files were added. Production code was not fixed or modified. Deletion checks affected only browser data created by this audit.

Evidence is in [exploratory-evidence](exploratory-evidence/). The [production desktop trace](exploratory-evidence/production-desktop-trace.zip) covers a focused repeat of the critical desktop rechecks; the main exploration is supported by screenshots, text/JSON captures, and the browser event log. Traces include browser actions, DOM snapshots, screenshots, and network activity; open them with `npx playwright show-trace docs/exploratory-evidence/<trace-name>.zip`. The [browser event log](exploratory-evidence/browser-events.jsonl) records console errors, uncaught errors, failed requests, and selected HTTP responses. Initial startup errors, intentional cancellation/offline errors, and server-restart events must be distinguished from app failures.

## User journeys and observed outcomes

| Journey                         | What was actually exercised                                                                                                                    | Outcome                                                                                                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First visit and real import     | Enter `Hikaru`, keep Last 30 days, Load games, observe progress and populated game list                                                        | 500 games appeared; archive index and October/November endpoints returned HTTP 200.                                                                                                                                                                                     |
| Date/filter import              | Custom one-day range; rated-only and White games; then Daily-only with no games                                                                | 12 games for both colors; 6 rated White games. Empty import exposed stale graph/header data (B2).                                                                                                                                                                       |
| Input errors                    | `bad user!!`, overlength username, nonexistent `audit-no-user-928173`, reversed custom dates                                                   | Invalid values blocked with validation messages; nonexistent account produced a real HTTP 404, retained previous games, and displayed an error. Messages have UX problems noted below.                                                                                  |
| Repeated import                 | Import the same one-day range twice; inspect list and reviewed status                                                                          | Remained 12 games, rather than 24. A completed review remained available during the same session. This does not establish deduplication for every possible overlapping query.                                                                                           |
| Import interruption             | Cancel immediately; cancel a request for January 2025; refresh while loading and load saved search                                             | App remained usable and previous games were retained. Cancellation was misreported as failure (B7). Saved search could be loaded after refresh.                                                                                                                         |
| Games list                      | Opponent substring search, no-match search, sort oldest/newest, select White/Black games, Review game                                          | Filtering, empty-filter message, selection, and sorting responded. Board/player strips updated for the selected games.                                                                                                                                                  |
| Move navigation                 | First/previous/next/last controls, repeated next clicks during analysis, move-list selection                                                   | Board/history and selected move changed; the 95-ply game's promotion endpoint could be reached and navigated backward. No navigation crash observed on these paths.                                                                                                     |
| Stockfish review                | Balanced run with live progress; cancel; select Quick; resume to completion                                                                    | First game completed **95/95** eligible plies. Cancellation/resume worked while staying in that review. Local accuracy estimates, classifications, evaluation chart/bar, and best-move feedback appeared.                                                               |
| Inspect evaluated moves         | Select `9...Be6`, Next mistake, switch Review/Analysis, inspect depth and PV                                                                   | Feedback showed Mistake, best move `Nxc3`, and an actual PV. Quick run displayed depth 10; opening-position analysis separately reached depth 20–23. No claim is made that numerical scores match an external chess-analysis oracle.                                    |
| Variations                      | Explore PV on board, navigate variation, return to game; promote black pawn `c2-c1` to Knight in Analysis; keyboard-assisted `e2-e4` variation | PV exploration and return worked. Underpromotion produced `c1=N`; original game remained available. Board keyboard navigation plus Enter successfully created the `e4` variation.                                                                                       |
| Opening statistics              | Candidate navigation, root/Back, sort control, More statistics, White/Black result perspective, matching games, move-order dialog              | Root candidate totals were consistent with imported counts in the inspected positions. Move-order dialog exposed alternate orders. Some transposition candidates throw an exception (B1); counts have a scope ambiguity described below.                                |
| Opening engine                  | Enable Stockfish analysis; move between root, `e4`, `c5`, and Back                                                                             | Actual score, depth, and PV updated for inspected positions. Rapid return to earlier positions remained usable.                                                                                                                                                         |
| Insights                        | Profile/rating cards, outcomes, top openings tabs, speed/color/range controls, no-match/reset, Refresh                                         | Real profile/statistics loaded. Rapid filter on the one-day Blitz dataset displayed a no-games state; Reset restored results. Black filter produced 6 games. Refresh while offline failed silently (B8).                                                                |
| Settings and refresh            | Change theme to Dark, board orientation to Black, result perspective to White/Black; reload and restore saved games                            | These preferences persisted. Analysis strength also persisted. Active tab, game, ply, completed-review presentation, and local tactical totals did not restore automatically (B3 and UX notes).                                                                         |
| Switch away from partial review | Cancel a second game's review at 10/78 plies, select another game, then reselect original                                                      | Resume/progress disappeared; returned to Ready/Run review (B5).                                                                                                                                                                                                         |
| Mobile viewport and touch       | Menu, import drawer, complete review, move selection, opening candidate selection; 390px/320px layouts                                         | Main review/opening/import layouts fit tested widths. Insights overflowed substantially (B4), including the separate touch context.                                                                                                                                     |
| Firefox and WebKit              | Fresh browser: real 12-game import, Quick full 95-ply review, select ply 18, visit openings and insights                                       | Both completed these journeys. Logs/traces: [Firefox](exploratory-evidence/firefox-journey.txt), [WebKit](exploratory-evidence/webkit-journey.txt). These are focused checks, not full browser parity certification.                                                    |
| Local deletion                  | Delete-user dialog → Keep data; reopen → confirm deletion; visit Openings; Clear all → confirm; refresh                                        | Keep data retained username. User deletion reported 764 cached games removed and reset Openings. Clear all left all five application IndexedDB stores at count 0. Refresh did not restore deleted games. Saved-search button remained as a preference/history artifact. |
| Accessibility spot check        | Run axe against the rendered Dark-theme Insights screen; inspect findings and relevant elements                                                | Confirmed contrast failures and nested/duplicate landmarks (B6/B9). This was a spot check, not a screen-reader or full WCAG audit.                                                                                                                                      |

## Confirmed bugs, ranked by severity

**Severity scale:** High = broken core workflow with an uncaught error; Medium = incorrect/stale state, lost usable review state, or substantial layout/accessibility failure; Low = misleading feedback or secondary/development-only failure. No critical defect was established.

| ID  | Severity | Finding                                                                             |
| --- | -------- | ----------------------------------------------------------------------------------- |
| B1  | High     | Listed transposition candidate does nothing and throws `UNKNOWN_GRAPH_PATH`         |
| B2  | Medium   | Empty successful import leaves old opening statistics and loaded-count announcement |
| B3  | Medium   | Completed review and derived tactical statistics disappear after refresh            |
| B4  | Medium   | Insights has severe horizontal overflow on mobile                                   |
| B5  | Medium   | Cancelled review loses Resume/progress after selecting another game                 |
| B6  | Medium   | Insights text has insufficient contrast in Dark theme                               |
| B7  | Low      | User-cancelled import is reported as a failed import                                |
| B8  | Low      | Profile refresh fails silently when offline                                         |
| B9  | Low      | Nested and duplicate main/banner landmarks                                          |
| B10 | Low      | Development analytics request is blocked by the app's CSP                           |

### B1 — Transposition candidate throws an uncaught exception

**Reproduction:**

1. Import `Hikaru`, both colors/all time classes, maximum 500, horizon 30. Reproduced with All available using locally available October/November archives and, independently, with Last 30 days on the production build.
2. Open Openings and click `Nf3 → d5 → d4 → Nf6`.
3. Click the listed `e3` candidate, shown as **4 games** in the initial dataset (**5** in the production Last 30 days reproduction). Repeat the click.

**Expected:** Navigate to the legal resulting position, including an alternate observed move order if necessary, or clearly explain a restriction.

**Actual:** Board, breadcrumb, and table remain unchanged; each click produces uncaught `UNKNOWN_GRAPH_PATH`. `Bf4` from the same position works. Playing `e2-e3` directly on the board works and changes to an alternate breadcrumb (`d4 d5 Nf3 Nf6 e3`).

**Evidence:** [Before/after DOM and captured exception](exploratory-evidence/transposition-candidate-reproduction.json), [screenshot](exploratory-evidence/34-dead-opening-candidate.png), [board workaround](exploratory-evidence/35-board-transposition-workaround.png), browser events around 10:00 UTC; [production before/after and exception](exploratory-evidence/production-candidate.json), [production screenshot](exploratory-evidence/production-dead-candidate.png).

**Likely root cause:** `components/tree/OpeningTreeTable.tsx:133` passes a position's aggregated outgoing edge to `navigateCandidate` without an alternate path. `features/opening-tree/navigation.ts:37` throws when `graph.paths.lookup(currentPathId, edge.uci)` cannot find that exact move-order continuation. In contrast, `resolveBoardMoveInGraph` has a fallback to a target-node arrival path. This explains the different outcomes for the table and board.

### B2 — Empty imports retain an unrelated graph and old game count

**Reproduction:**

1. Import `Hikaru`, custom 2026-11-09, rated only, White games: **6 games**.
2. Reopen Import games → Game filters. Select only Daily for time class; keep the same date/color/rated filters. Load and wait for **No games found**.
3. Close the drawer and visit Openings, then Games.

**Expected:** Empty-result state throughout; no statistics from the preceding Blitz dataset and no old loaded-game announcement.

**Actual:** Games says **No games found for these filters**, while its header still says **6 games loaded**. Openings shows **0 as White · 0 as Black / matching games (0)** but still lists old candidates `e4: 4`, `b3: 1`, `d4: 1` and 100% result bars.

**Evidence:** [Stale openings](exploratory-evidence/38-stale-opening-after-empty-import.png), [contradictory Games screen](exploratory-evidence/39-empty-import-result.png), [Games text](exploratory-evidence/empty-import-games.txt), [Openings text](exploratory-evidence/empty-import-openings.txt).

**Likely root cause:** `features/workspace/reducer.ts` preserves the graph in `query/started` when games already exist and does not reset it for an empty `ingestion/terminal`. `features/workspace/createWorkspaceController.ts` returns before rebuilding the graph when `result.games.length === 0`. `components/workspace/ChessWorkspace.tsx:178` updates `loadedAnnouncement` only for a nonempty successful result, leaving the previous string visible.

### B3 — Refresh loses completed-review presentation and tactical totals

**Reproduction:**

1. Import the 12-game one-day range. Review the newest `Hikaru (3455) vs fan_of_chess1908 (2890)` game at Quick strength to **95/95 / Review complete**.
2. Inspect its accuracy summary/classifications and Insights tactical counts.
3. Reload, click **Load saved search for hikaru**, and select the same game → Review game.
4. Visit Insights again.

**Expected:** Previously completed review is recognized, its feedback is available, and tactical counts remain available after restoring the saved dataset.

**Actual:** The game is **Not reviewed**, Review shows **Ready to review / Run review**, and classifications/summary disappear. Insights drops from locally evaluated moves to **0 evaluated moves** with zero tactical-error totals. Average accuracy changes because it falls back to imported Chess.com accuracy. Reproduced twice. Strength remained Quick, so this was not simply a different-strength selection.

**Important limit:** This is **not evidence that evaluation records are erased**. A read-only IndexedDB check after rerunning found 192 evaluation entries, and rerunning restored the completed review quickly. The failure concerns reconstruction/presentation of completed review state.

**Evidence:** [Full before/after reproduction](exploratory-evidence/analysis-refresh-reproduction.txt), [complete before reload](exploratory-evidence/25-complete-before-refresh.png), [ready after reload](exploratory-evidence/26-review-lost-after-refresh.png), [reset tactical count](exploratory-evidence/27-insights-evaluated-count-reset.png).

**Likely root cause:** `features/workspace/reducer.ts:20` starts `resultsByGameId` empty; completed per-game results are retained only in reducer memory. `features/workspace/useWorkspace.ts` restores preferences/recent query, but not those results. `components/workspace/ChessWorkspace.tsx:119` and the Insights dashboard derive reviewed labels and tactics from that map. `features/stockfish-analysis/evaluationCache.ts` persists position evaluations separately, without restoring the per-game result map on selection.

### B4 — Mobile Insights expands beyond the viewport

**Reproduction:** Import games, set viewport to 390×844, open the menu, and choose Insights. Also reproduced in a fresh Pixel 7 touch-emulation context after a real import/review.

**Expected:** Cards, filters, charts, and tables fit the screen or have clearly bounded local scrolling.

**Actual:** In desktop Chromium resized to 390px, document `scrollWidth` is **1022px**. `.profile-insights-container` measured about **989px** wide starting at x=33. Most content lies beyond the screen. In touch emulation, the configured and visual viewport was 390px, but the layout/document expanded to 1022px, shrinking the effective presentation. Review and Openings measured 390px with no document overflow; Openings also fit 320px.

**Evidence:** [Mobile viewport screenshot](exploratory-evidence/18-mobile-insights.png), [touch screenshot](exploratory-evidence/mobile-touch-insights.png), [touch journey and viewport measurements](exploratory-evidence/mobile-touch-journey.txt), [touch trace](exploratory-evidence/mobile-touch-trace.zip).

**Likely root cause:** Profile layout styles in `app/globals.css:3107` onward allow intrinsic table/grid/ribbon widths to determine the dashboard's minimum width. The responsive rules near line 3865 change dashboard columns/filter scrolling without adequately constraining the whole container and its descendants. `components/profile-insights/ProfileInsightsDashboard.tsx` places this layout inside the narrow workspace panel.

### B5 — Partial review cannot be resumed through its previous UI after a game switch

**Reproduction:**

1. Select the second `fan_of_chess1908 (2891)` game; start Balanced review.
2. Cancel after some progress and wait for cancellation to settle. Observed **10/78**, **Partial review / Resume analysis**.
3. Go to Games, select the other `fan_of_chess1908` game, reselect the cancelled game, and open Review.

**Expected:** The cancelled game retains Partial review, coverage, and Resume analysis.

**Actual:** Returns to **Ready to review / Run review**, with no partial coverage or Resume control. Position evaluations may still be cached; no claim is made that all prior engine computation is discarded.

**Evidence:** [Before/after text](exploratory-evidence/partial-review-game-switch.txt), [after-switch screenshot](exploratory-evidence/41-partial-after-game-switch.png).

**Likely root cause:** `features/workspace/createWorkspaceController.ts:294` increments `analysisSequence` on cancellation, preventing the old run's result from being dispatched. `features/workspace/reducer.ts:248` adds only complete results to `resultsByGameId`; selection resets the active analysis. Cancelled progress is therefore not retained as per-game state.

### B6 — Insufficient contrast in Dark-theme Insights

**Reproduction:** Settings → Theme → Dark; open populated Insights. Run axe or inspect the text/background colors.

**Expected:** Normal small text meets a 4.5:1 contrast threshold.

**Actual:** Axe reported **15 contrast-failing nodes**. Examples: GM badge white on `#b58863`: **3.15:1**; time-class labels `#8b877c` on `#3a3834`: **3.26:1**; filter labels on `#302e2b`: **3.77:1**.

**Evidence:** [axe results with affected elements and calculations](exploratory-evidence/axe-insights.json), [Dark-theme Insights screenshot](exploratory-evidence/18-mobile-insights.png). Automated measurements establish these specific failures; other elements/themes were not comprehensively checked.

**Likely root cause:** `app/globals.css` token `--text-subtle`, `.profile-title-badge` (near line 3200), `.profile-rating-timeclass` (3297), and `.profile-filter-label` (3335).

### B7 — Intentional import cancellation is shown as failure

**Reproduction:** With a populated workspace, start a new import, immediately click **Cancel loading**, and wait. Reproduced with All available and a custom January 2025 range.

**Expected:** An explicit cancelled state and reassurance that previous games are retained.

**Actual:** Error panel says **Games could not be loaded**, followed by the same generic sentence again. Previous games do remain available. The January request was actually aborted, as expected.

**Evidence:** [Reproduction text](exploratory-evidence/cancel-import-reproduction.txt), [error screenshot](exploratory-evidence/30-cancel-import-error-reproduced.png), browser event `net::ERR_ABORTED` for the January request.

**Likely root cause:** `features/workspace/reducer.ts:78` explicitly classifies a cancelled result with zero new games as failure when existing games are present, then assigns a generic load-error message. `components/workspace/ChessWorkspace.tsx` renders it as a failed status card.

### B8 — Failed profile refresh provides no feedback

**Reproduction:** Load Insights with real profile data; disable browser networking; click **Refresh**; wait; restore networking.

**Expected:** A visible refresh error/offline notice, while retaining previously fetched data and identifying it as cached.

**Actual:** Profile and statistics requests fail, the loading state ends, and the same profile remains with no error, offline indication, or timestamp. The user cannot distinguish failed refresh from success.

**Evidence:** [Failed URLs and before/after UI text](exploratory-evidence/offline-profile-refresh.json), [screenshot](exploratory-evidence/45-offline-profile-refresh.png). This is a deliberate offline simulation, not a mocked API.

**Likely root cause:** `components/profile-insights/ProfileInsightsDashboard.tsx:54` uses `Promise.allSettled`, retains prior values after rejection, unconditionally sets `fetchedAt: Date.now()`, and exposes no error state. Marking failed refreshes as fresh may also defer automatic retry; the one-hour retry effect was not time-tested.

### B9 — Duplicate/nested page landmarks

**Reproduction:** Load the application and inspect the rendered landmark hierarchy; confirmed by axe on Insights.

**Expected:** One top-level main landmark, with the banner outside main content.

**Actual:** `<main class="workspace-root">` contains both the app's banner and another `<main class="workspace-content">`. Axe reports `landmark-banner-is-top-level`, `landmark-main-is-top-level`, `landmark-no-duplicate-main`, and `landmark-unique`.

**Evidence:** [axe element markup and violations](exploratory-evidence/axe-insights.json).

**Likely root cause:** Outer main in `app/page.tsx:5`, inner main in `components/workspace/ChessWorkspace.tsx:591`, and banner in `components/workspace/AppTopBar.tsx:54`.

### B10 — Development analytics conflicts with CSP

**Reproduction:** Open/reload the dev application and inspect the browser console/network log.

**Expected:** Configured development integrations load, or are disabled without producing CSP errors.

**Actual:** `https://va.vercel-scripts.com/v1/script.debug.js` is blocked by `script-src`; the browser logs a CSP error and the analytics package logs a load failure. Reproduced in Chromium, Firefox, and WebKit. Core chess interactions remained usable.

**Evidence:** [Browser events](exploratory-evidence/browser-events.jsonl), [Firefox log](exploratory-evidence/firefox-journey.txt), [WebKit log](exploratory-evidence/webkit-journey.txt).

**Likely root cause:** `app/layout.tsx` mounts Vercel Analytics, while `next.config.ts:33` restricts scripts to self and does not permit this development-script origin. **The observed issue is development-only; this finding does not establish a production analytics failure.**

## Other UX issues and suspected problems

- **Refresh recovery is unnecessarily indirect.** Reload returns to an empty import screen with blank username, even with hundreds of local games. The user must discover Load saved search. Theme/orientation/perspective persist, but tab, selected game, and move do not. The saved relative date range also appeared as explicit Custom dates after refresh. These are recovery/design issues distinct from B3's lost reviewed state.
- **Transposition statistics mix scopes.** At `Nf3 d5 d4 Nf6`, matching games showed **2**, but candidate counts summed to **17**; the move-order dialog explained 8+7+2 games through alternate orders. Position-wide aggregates are reasonable, but the table does not clearly distinguish them from “Your games in this line.” This is a labeling/scope concern, not proof that the aggregate arithmetic is wrong. See [move-order evidence](exploratory-evidence/31-transposition.png).
- **Accuracy sources are mixed without per-value attribution.** Insights averages local estimates for reviewed games with Chess.com accuracies for the rest. With no local results, it still displays Average Move Accuracy and numerical zero mistakes next to **0 evaluated moves**. The subtext mentions both sources but gives no reviewed-game coverage or explicit “unknown” tactical counts. The review page itself usefully distinguishes Local estimate and Chess.com accuracy.
- **Black-only insights initially show the White openings tab.** Selecting Black produced six games but “As White (0) / No opening data recorded for this side” until manually switching to As Black. Source: independent `selectedColor = 'white'` state in `components/profile-insights/TopOpeningsCard.tsx`.
- **Rating scope is ambiguous.** Peak Rating remained 3570 (Bullet lifetime peak) when the selected imported dataset contained only Blitz. All Time and Total Games refer to the loaded subset, while profile peaks refer to the remote lifetime account. Users may reasonably interpret the controls as applying to all KPIs.
- **Raw error wording:** nonexistent username shows `Upstream player [REDACTED] resource not found (HTTP 404)`; reversed dates show `dateFrom (...) cannot be after dateTo (...)`. These expose internal terminology rather than actionable user language. Validation errors remained visible while editing until resubmission, and a previous upstream error could coexist with a new validation error.
- **Mobile review requires substantial scrolling.** Selecting a move far down the review can leave the board out of view; the tested full review also had considerable blank vertical space below the panel. No claim of a blocked mobile review interaction is made: touch review completed successfully.
- **Clear all retains recent search/preferences.** IndexedDB stores were empty, but Load saved search for hikaru remained after reload. The deletion message specifically promises games/analysis removal, which was verified; wording could better explain retained preferences/search history.
- A full cache-consistency/performance comparison between cold imports, cached imports, and overlapping date ranges remains open. Restoring a large saved query took noticeably longer than a small query, with limited progress detail during local checking/graph processing; no precise performance threshold failure was established.

## Untested or limited coverage

- Full historical All available import, maximum 5000-game dataset, long-running Deep review, and exhaustive opening horizon 2/40 behavior.
- Chess.com 429/5xx/retry behavior, malformed upstream responses, expired archives, and genuine rate-limit recovery. No artificial route stubs were used to claim these worked.
- Storage quota exhaustion, disabled IndexedDB, private-mode restrictions, schema upgrades from older app versions, and deletion across multiple distinct usernames.
- Browser/OS process termination during database writes; background-tab throttling; multiple tabs reviewing or deleting the same data.
- Engine unavailability and single-thread fallback under intentionally removed cross-origin isolation; engine crash/retry; rigorous chess-score/classification accuracy against an external reference engine. Quick and Balanced ran; Deep was not completed.
- All promotion options and promotion cancellation; Knight underpromotion was actually exercised. General drag/drop input was not comprehensively exercised; clicking and keyboard-assisted board input were used.
- Every graph transposition, repeated-position rule, all game endings, and exhaustive tactical classifications. B1 is one reproduced real-data case.
- Physical mobile hardware, iOS Safari, screen-reader navigation, keyboard-only navigation of every dialog/filter, and full light-theme contrast coverage. WebKit desktop is not a physical Safari/iOS certification.
- Firefox/WebKit received focused core journeys; interruption/deletion and all bug repros were primarily Chromium.

## Production validation and artifact notes

**Production build passed:** `npm run build` completed compilation, TypeScript checks, and static generation on Next 16.3.5. See [build log](exploratory-evidence/production-build.log). The built application was started with `npm run start` and exercised through Playwright against the same localhost origin. A fresh real 500-game import, full Quick Stockfish review, Insights filter/range controls, Black openings tab, and candidate alphabetical/expected-score sorting ran successfully. **B1, B2, B3, and B4 were independently reproduced on the production build.** See [production state checks](exploratory-evidence/production-state-checks.txt), [stale empty-import graph](exploratory-evidence/production-stale-opening-empty.png), and [mobile Insights](exploratory-evidence/production-mobile-insights.png). Other findings retain their stated scope; production analytics was not certified. Screenshot and trace filenames document observed states, including intermediate investigations; bug entries above identify the evidence that supports each final finding. The startup-error screenshot is environment evidence, not a counted application bug. No existing test suite pass is asserted by this report.
