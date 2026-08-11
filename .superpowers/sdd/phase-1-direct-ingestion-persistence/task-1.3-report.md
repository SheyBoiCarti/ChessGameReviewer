# Task 1.3 Implementation Report: Direct browser Chess.com PubAPI client

## Summary of Implementation

Implemented the direct browser Chess.com PubAPI client with strict origin/path validation, Web Lock concurrency control, streaming size caps, composed abort deadlines, and sanitized typed error handling.

### Created Modules

1. **`lib/api/chesscomUrl.ts`**:
   - `buildArchivesUrl(username)`: Validates username segment and constructs `https://api.chess.com/pub/player/{username}/games/archives` via `new URL()`.
   - `buildMonthlyUrl(username, year, month)`: Validates username, 4-digit year, and month (1..12), padding month to 2 digits.
   - `isValidRedirectUrl(urlStr, expectedType, username, year, month)`: Enforces post-redirect validation checking HTTPS origin `api.chess.com` and matching pathname family.

2. **`lib/api/errors.ts`**:
   - `PubApiError`: Custom typed error class extending `UpstreamError` with sanitization.
   - `sanitizeMessage(input)`: Strips usernames, username-bearing URLs, raw response bodies, and PGNs from error/diagnostic messages to prevent telemetry leaks.
   - Factory functions: `createTimeoutError()`, `createAbortError()`, `createOfflineError()`, `createCorsError()`, `createResponseTooLargeError()`, `createInvalidResponseError()`.

3. **`lib/api/pubApiCoordinator.ts`**:
   - `PubApiCoordinator`: Per-tab serial queue execution for PubAPI requests.
   - Holds named Web Lock `chesscom-pubapi-lock` via `navigator.locks.request` when supported, with fallback when Web Locks are unavailable.

4. **`lib/api/chesscomClient.ts`**:
   - `fetchPlayerArchives(username, options)`: Fetches player archives endpoint.
   - `fetchMonthlyGames(username, year, month, options)`: Fetches monthly games archive endpoint.
   - Enforces `GET`, `mode: 'cors'`, `credentials: 'omit'`, `redirect: 'follow'`, `cache: 'default'`. Sets no non-safelisted request headers.
   - Composed abort signal combining a 10-second deadline (`options.timeoutMs ?? 10000`) and caller `AbortSignal`.
   - Streamed byte counter enforcing a strict 32 MiB size cap (checking `Content-Length` header and streamed chunk bytes).
   - Validates responses using `validateArchivesResponse` and `validateMonthlyGamesResponse` (rejecting >20,000 raw games).

5. **`tests/api/chesscomClient.test.ts`**:
   - Comprehensive Vitest test suite (28 tests) covering URL construction, redirect validation, error typing, Web Lock concurrency, size caps, timeouts, cancellations, offline detection, CORS errors, and message sanitization.

---

## TDD Evidence

### RED State
- Command run: `npx vitest run tests/api/chesscomClient.test.ts`
- Result: Failed as expected due to missing modules (`../../lib/api/chesscomUrl`, `../../lib/api/errors`, `../../lib/api/pubApiCoordinator`, `../../lib/api/chesscomClient`).
- Sample output:
  ```
  FAIL dom tests/api/chesscomClient.test.ts
  Configuration error: Failed to resolve import "../../lib/api/chesscomUrl" from "tests/api/chesscomClient.test.ts". Does the file exist?
  ```

### GREEN State
- Command run: `npx vitest run`
- Result: Passed pristine (102 tests across 5 test suites).
- Output:
  ```
  RUN  v3.2.7 C:/Users/sheha/OneDrive/Desktop/ChessGameReviewer

  ✓ unit tests/unit/gameQuery.test.ts (27 tests) 23ms
  ✓ unit tests/unit/chesscomSchemas.test.ts (12 tests) 31ms
  ✓ unit tests/unit/results.test.ts (27 tests) 15ms
  ✓ unit tests/setup/headers.test.ts (8 tests) 11ms
  ✓ dom tests/api/chesscomClient.test.ts (28 tests) 286ms

  Test Files  5 passed (5)
       Tests  102 passed (102)
    Start at  22:52:58
    Duration  4.11s
  ```

---

## Files Changed

- `lib/api/chesscomUrl.ts` (new)
- `lib/api/errors.ts` (new)
- `lib/api/pubApiCoordinator.ts` (new)
- `lib/api/chesscomClient.ts` (new)
- `tests/api/chesscomClient.test.ts` (new)
- `vitest.config.ts` (modified: added `tests/api/**/*.test.ts` to `dom` test include pattern)
- `.superpowers/sdd/phase-1-direct-ingestion-persistence/progress.md` (updated status)

---

## Self-Review Findings

- **Completeness:** Fully satisfies all requirements in `task-1.3-brief.md`.
- **Security & Privacy:** Ensured URL validation prevents arbitrary origin/path injection and post-redirect validation rejects unexpected redirect targets. Verified that error messages sanitize all usernames, URLs with usernames, raw response texts, and PGNs.
- **Concurrency & Limits:** Holding Web Locks (`chesscom-pubapi-lock`) per request duration and enforcing 32 MiB size cap and 20,000 raw games cap.
- **Testing:** 102/102 unit/DOM tests passing with zero warnings or errors.

---

## Issues / Concerns

None. Implementation is robust, fully tested, and cleanly integrated.
