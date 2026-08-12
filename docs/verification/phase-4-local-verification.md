# Phase 4 Local Verification

Date: 2026-08-12  
Implementation revision: `e84658097eeccea7f811ba6e2f4047495053de5f`  
Branch: `phase-4-ui-workspace-components`

## Exit-gate evidence

| Requirement | Evidence |
| --- | --- |
| Real query and progress workflow | The fixture journey submits username, inclusive UTC dates, maximum games, rated status, and opening horizon through the production form. It observes a typed completed result after production normalization, IndexedDB persistence, and worker graph construction. |
| Race safety and cancellation | Controller tests cover rapid-query relevance tokens, stale analysis rejection, ingestion cancellation, analysis cancellation, progress, disposal, and typed ingestion/graph/analysis failures. |
| Real game board | Parsed fixture PGNs drive game selection, FEN history, keyboard ply navigation, orientation, last-move highlights, evaluation meter, and PV arrow presentation. No fixed FEN or evaluation is used by the production workspace. |
| Opening graph and transpositions | Two different fixture move orders reach the same position. The browser journey navigates one path and verifies both independent arrival orders in the modal. Unit tests cover path identity, invalid navigation, perspectives, and back/root behavior. |
| Local Stockfish | Chromium forces the pinned single-thread build, produces non-empty selected-game analysis, cancels, resumes through the evaluation cache, and displays coverage, engine resources, settings, annotations, PV, evaluation, and graph/table alternatives. |
| Engine fallback | The forced-unavailable journey shows a typed unavailable state and then continues to use the opening tree. |
| Local-data control | The journey deletes the fixture username through a confirmed dialog and verifies both the deletion count and invalidated in-memory selection. Clear-all and failure paths have DOM/controller coverage. |
| Accessibility | Axe reports no serious or critical findings in initial, tree, and transposition-dialog states. The chessboard has valid grid/row/gridcell structure. Tabs, history, dialog focus trap/restoration, background inertness, visible focus, reduced motion, and deletion-dialog Escape behavior are automated. |
| Responsive behavior | Phone, tablet, and all desktop engines assert no horizontal document overflow at their viewport and an equivalent 200% reflow viewport. CSS uses an aspect-ratio board and stacks below the desktop breakpoint. |
| Server/client boundaries | `app/page.tsx` is a static Server Component. Browser workers and IndexedDB live below an SSR-disabled client loader; the analyzer is a second lazy client chunk. The production build prerenders `/` successfully. |
| Recovery | `app/error.tsx` exposes a retry action; invalid boards, storage failures, ingestion failures, graph failures, engine failures, partial results, cancellation, and offline-cache-only results have typed visible states. |
| Privacy and claims | The page states local IndexedDB storage and unaffiliated status. No Chess.com parity or branded-asset claim is made. |

## Automated gates

- Vitest: 56 files, 407 tests after the modal inertness assertion (406 in the last coverage run before that assertion), all passed.
- Coverage: global statements/lines/functions/branches exceed the configured 80% thresholds; `features/**/*.ts` branch coverage exceeds 90%; `lib/**/*.ts` branch coverage exceeds 90%.
- Playwright: 54 passed, 4 skipped. The skips are the two pinned-engine smoke cases on Firefox and WebKit; the real engine path remains mandatory and passing in Chromium.
- Browser projects: desktop Chromium, Firefox, WebKit; targeted Pixel 7 and iPad (7th generation) Chromium projects.
- Production build: Next.js 16.3 static prerender completed for `/` and all harness routes.
- Security regression coverage: CSP, COOP/COEP and other response headers, IndexedDB persistence, graph worker, and Stockfish worker suites pass in their configured projects.

## Production bundle observations

Sizes below are raw, uncompressed JavaScript emitted by the local production build. They are recorded for regression comparison, not as transfer-size claims.

- Next root runtime files: 437,172 bytes total.
- Server-page/client-loader chunk (`0c7rxly67ijfy.js`): 4,659 bytes.
- Lazy workspace chunk (`27m_yh946h6xv.js`): 55,572 bytes.
- Lazy analyzer chunk (`0918jj9h28e06.js`): 6,604 bytes.

## Manual-tool disposition

An interactive Playwright MCP/browser-inspector capability was not exposed in this session. The production-build Playwright matrix, axe scans, console/page-error smoke checks, real worker/WASM journey, keyboard flows, viewport/reflow assertions, fallback journey, and deletion journey were therefore used as the mandatory inspection evidence. No external preview was deployed; `npm run build && npm run start` is the verified preview path.

## Prohibited-placeholder audit

Production searches found no fixed FEN, fixed centipawn value, placeholder annotation, Chess.com accuracy parity, or copied branded asset. Fixture constants are confined to `tests/e2e/helpers/workspaceFixtures.ts` and only replace upstream HTTP responses; parsing, graph construction, persistence, and analysis remain production implementations.
