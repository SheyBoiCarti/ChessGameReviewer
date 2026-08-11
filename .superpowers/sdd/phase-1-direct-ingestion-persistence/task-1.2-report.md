# Task 1.2 Report: Shared contracts and runtime validation

## Implementation Summary

We have fully implemented Task 1.2 (Shared contracts and runtime validation) for Phase 1 of the ChessGameReviewer project.

- **Shared Contracts (`lib/api/contracts.ts`):**
  - Exported `GameQuery`, `TimeClass` (`'bullet' | 'blitz' | 'rapid' | 'daily'`), `PlayerColor` (`'white' | 'black'`), `UpstreamErrorCode`, `UpstreamError`, `IngestionJobStatus`, `Diagnostic`, `DiagnosticSeverity`, `GameResult`, and `NormalizedGameSummary`.
  - Enforced strict TypeScript optional property types compatible with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.
- **Raw Upstream Schemas & Narrowing (`lib/api/chesscomSchemas.ts`):**
  - Implemented runtime narrowing functions `validateArchivesResponse`, `validateMonthlyGamesResponse`, and `validateRawGame` from `unknown`.
  - Enforced 20,000 monthly response object limit producing `RESPONSE_TOO_LARGE` error.
  - Enforced required field check (`MISSING_REQUIRED_GAME_FIELD`) and invalid type/structure check (`MALFORMED_GAME_RECORD`) returning structured diagnostics tied to stable game IDs (`url` or `uuid`).
  - Ignored unknown upstream fields to prevent leak/pollution.
  - Implemented `parseUpstreamHttpError` mapping HTTP status codes (404, 410, 429, 5xx, 400) to normalized, safe `UpstreamError` objects that contain zero raw response bodies.
- **GameQuery Validation (`lib/validation/gameQuery.ts`):**
  - Implemented `validateGameQuery` validating Chess.com username grammar (`/^[a-zA-Z0-9_-]{3,25}$/`), inclusive UTC ISO date bounds (`YYYY-MM-DD`), calendar date validity, and inverted date range detection (`INVERTED_DATE_RANGE`).
  - Enforced `maxGames` integer bounds (1 to 5,000; default 500), non-empty `timeClasses` array, non-empty `colors` array, and optional `rated` boolean.
- **Result Mapping & Outcome Determination (`lib/chess/results.ts`):**
  - Built explicit table-driven mapping `CHESSCOM_RESULT_TOKENS` for all documented Chess.com player result tokens (`win`, `checkmated`, `resigned`, `timeout`, `lose`, `abandoned`, `kingofthehill`, `threecheck`, `timeforfeit`, `timefortfeit`, `bughousepartnerlose`, `agreed`, `repetition`, `stalemate`, `insufficient`, `50move`).
  - Implemented `determineUserOutcome` to evaluate outcome from both user and opponent result tokens, rejecting inconsistent pairs (`INCONSISTENT_PLAYER_RESULTS`) and unknown tokens (`UNKNOWN_RESULT_TOKEN`) with structured diagnostics rather than silently mapping to draws.
- **Test Fixtures (`tests/fixtures/upstream/`):**
  - Created `validArchives.json`, `validMonthlyGames.json`, `missingFieldsGame.json`, `malformedGame.json`, and `httpErrorResponses.json`.

---

## TDD Evidence

### RED Stage
- **Command:** `npm test`
- **Output:**
  ```text
  FAIL unit tests/unit/chesscomSchemas.test.ts
  Error: Cannot find module '@/lib/api/chesscomSchemas'
  FAIL unit tests/unit/gameQuery.test.ts
  Error: Cannot find module '@/lib/validation/gameQuery'
  FAIL unit tests/unit/results.test.ts
  Error: Cannot find module '@/lib/chess/results'

  Test Files  3 failed | 1 passed (4)
  Tests       8 passed (8)
  ```
- **Why Failure Was Expected:** The test suites imported `@/lib/api/chesscomSchemas`, `@/lib/validation/gameQuery`, and `@/lib/chess/results`, which had not yet been created.

### GREEN Stage
- **Command:** `npm test`
- **Output:**
  ```text
  RUN  v3.2.7 C:/Users/sheha/OneDrive/Desktop/ChessGameReviewer

  ✓ unit tests/unit/gameQuery.test.ts (27 tests) 25ms
  ✓ unit tests/unit/results.test.ts (27 tests) 20ms
  ✓ unit tests/unit/chesscomSchemas.test.ts (12 tests) 32ms
  ✓ unit tests/setup/headers.test.ts (8 tests) 13ms

  Test Files  4 passed (4)
  Tests       74 passed (74)
  Duration    2.31s
  ```

---

## Verification & Checkpoints

1. **Type Check (`npm run typecheck`):**
   - Command: `npm run typecheck`
   - Result: Exit code 0, 0 errors. All contracts, validation functions, and tests type-check cleanly under strict TS settings.
2. **Linter (`npm run lint`):**
   - Command: `npm run lint`
   - Result: Exit code 0, 0 errors.
3. **Prettier Format Check (`npm run format:check`):**
   - Command: `npm run format:check`
   - Result: Exit code 0 ("All matched files use Prettier code style!").
4. **Playwright E2E Tests (`npm run test:e2e`):**
   - Command: `npm run test:e2e`
   - Result: `4 passed (5.1s)`.

---

## Files Created / Modified

- `lib/api/contracts.ts` (created)
- `lib/api/chesscomSchemas.ts` (created)
- `lib/validation/gameQuery.ts` (created)
- `lib/chess/results.ts` (created)
- `tests/fixtures/upstream/validArchives.json` (created)
- `tests/fixtures/upstream/validMonthlyGames.json` (created)
- `tests/fixtures/upstream/missingFieldsGame.json` (created)
- `tests/fixtures/upstream/malformedGame.json` (created)
- `tests/fixtures/upstream/httpErrorResponses.json` (created)
- `tests/unit/gameQuery.test.ts` (created)
- `tests/unit/chesscomSchemas.test.ts` (created)
- `tests/unit/results.test.ts` (created)
- `.superpowers/sdd/phase-1-direct-ingestion-persistence/progress.md` (modified)

---

## Self-Review Findings

- **Completeness:** All acceptance criteria in task brief 1.2 are met: trust-boundary narrowing, structured error codes, safe error messages without raw bodies, table-driven token mapping, and game query bounds validation.
- **Quality:** Strict TypeScript parameters (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) enforced.
- **Discipline:** Pure validation and domain contracts without external dependencies or YAGNI abstractions.

---

## Concerns

None.
