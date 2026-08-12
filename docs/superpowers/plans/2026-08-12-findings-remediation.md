# Findings Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve every correctness, privacy, redirect-compatibility, and cross-tab lock-scope concern recorded in `findings.txt`.

**Architecture:** Keep archive parsing, ingestion accounting, PGN diagnostics, and redirect validation as local pure-function changes. Refactor `PubApiCoordinator` so it can execute a short, lock-protected request-initialization task while the existing per-tab queue continues to cover the complete request lifecycle; body streaming remains outside the Web Lock.

**Tech Stack:** TypeScript, Vitest, Web Locks API, Fetch API, chess.js.

## Global Constraints

- Preserve exact Chess.com origin, username, archive month, redirect query, and redirect hash validation.
- Preserve the 32 MiB streaming body limit and request timeout/abort behavior.
- Do not expose raw usernames, URLs, PGN, or parser exception fragments in diagnostics.
- Keep ingestion progress accepted-count monotonic and no greater than `query.maxGames`.

---

### Task 1: URL parsing and redirect normalization

**Files:**

- Modify: `features/ingestion/archivePlanner.ts:14-27`
- Modify: `lib/api/chesscomUrl.ts:52-95`
- Test: `tests/unit/ingestion/archivePlanner.test.ts`
- Test: `tests/api/chesscomClient.test.ts`

**Interfaces:**

- Consumes: `parseArchiveMonth(url: string, username: string): string` and `isValidRedirectUrl(...)`.
- Produces: Case-insensitive username comparisons while maintaining strict URL structure; trailing-slash equivalence only for redirect paths.

- [ ] **Step 1: Write failing regression tests**

```ts
expect(parseArchiveMonth('https://api.chess.com/pub/player/JaneDoe/games/2026/08', 'JaneDoe')).toBe(
  '2026-08'
);
expect(
  isValidRedirectUrl(
    'https://api.chess.com/pub/player/hikaru/games/archives/',
    'archives',
    'hikaru'
  )
).toBe(true);
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npx vitest run tests/unit/ingestion/archivePlanner.test.ts tests/api/chesscomClient.test.ts`

Expected: the mixed-case archive and trailing-slash redirect assertions fail.

- [ ] **Step 3: Implement exact normalization**

```ts
if (!url.toLowerCase().startsWith(prefix)) throw new Error('INVALID_ARCHIVE_URL');

const trimTrailingSlashes = (path: string) => path.replace(/\/+$/, '');
return (
  trimTrailingSlashes(parsed.pathname.toLowerCase()) ===
  trimTrailingSlashes(expectedPath.toLowerCase())
);
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npx vitest run tests/unit/ingestion/archivePlanner.test.ts tests/api/chesscomClient.test.ts`

Expected: PASS.

### Task 2: Bounded ingestion progress and sanitized PGN diagnostics

**Files:**

- Modify: `features/ingestion/ingestionService.ts:405-421`
- Modify: `lib/chess/pgnParser.ts:1-87`
- Test: `tests/dom/ingestion/ingestionService.test.ts`
- Test: `tests/unit/chess/pgnParser.test.ts`

**Interfaces:**

- Consumes: `matchesQuery`, `sanitizeMessage`, and `parseGamePgn`.
- Produces: Progress snapshots and results whose accepted count never exceeds the query cap; sanitized illegal-PGN diagnostics.

- [ ] **Step 1: Write failing regression tests**

```ts
const progress: IngestionProgress[] = [];
await runIngestion(makeQuery({ maxGames: 1 }), {
  deps: fakeDependencies({
    fetchMonthlyGames: vi
      .fn()
      .mockResolvedValue([makeRawGame(), makeRawGame({ uuid: 'overflow' })]),
  }),
  now: () => NOW,
  onProgress: (event) => progress.push(event),
});
expect(progress.every((event) => event.recordsAccepted <= 1)).toBe(true);

expect(
  parseGamePgn({ game: { ...game, pgn: '[Event "Secret"]\\n\\n1. e4 e5 2. Qh9' } })
).not.toMatchObject({
  errors: [expect.objectContaining({ message: expect.stringContaining('Secret') })],
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npx vitest run tests/dom/ingestion/ingestionService.test.ts tests/unit/chess/pgnParser.test.ts`

Expected: acceptance count exceeds one and parser diagnostics retain unsanitized exception text.

- [ ] **Step 3: Enforce the cap and redact parser error text**

```ts
if (matchesQuery(normalized.game, query) && !seen.has(normalized.game.id)) {
  seen.add(normalized.game.id);
  if (games.length < query.maxGames) games.push(normalized.game);
  else recordsExcluded += 1;
}

const sanitized = error instanceof Error ? sanitizeMessage(error.message) : '';
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npx vitest run tests/dom/ingestion/ingestionService.test.ts tests/unit/chess/pgnParser.test.ts`

Expected: PASS.

### Task 3: Narrow Web Lock scope to request initialization

**Files:**

- Modify: `lib/api/pubApiCoordinator.ts:3-42`
- Modify: `lib/api/chesscomClient.ts:144-247`
- Test: `tests/api/chesscomClient.test.ts`

**Interfaces:**

- Consumes: `PubApiCoordinator` and `readResponseBody(response, composed)`.
- Produces: A coordinator operation that retains per-tab serialization for the full task but holds a Web Lock only until a response has passed initial validation.

- [ ] **Step 1: Write a failing concurrency regression test**

```ts
const firstBodyRead = deferred<void>();
const secondFetchStarted = deferred<void>();
// Make request one return a stream blocked on firstBodyRead and assert request two starts before it resolves.
await expect(secondFetchStarted.promise).resolves.toBeUndefined();
```

- [ ] **Step 2: Run the client test and verify it fails**

Run: `npx vitest run tests/api/chesscomClient.test.ts`

Expected: the second request cannot start until the first response body finishes.

- [ ] **Step 3: Separate Web Lock acquisition from task execution**

```ts
async execute<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  // preserve existing per-tab queue
  // acquire Web Lock only around the callback that performs fetch and response-header validation
}
```

Move `readResponseBody(response, composed)` after the lock-protected callback returns, keeping cleanup in an outer `finally` and preserving all typed error translations.

- [ ] **Step 4: Run the client test and verify it passes**

Run: `npx vitest run tests/api/chesscomClient.test.ts`

Expected: PASS; the second fetch starts while the first stream is deliberately paused.

### Task 4: Full verification

**Files:**

- Verify: all modified production and test files.

- [ ] **Step 1: Format changed files**

Run: `npx prettier --write features/ingestion/archivePlanner.ts features/ingestion/ingestionService.ts lib/api/chesscomUrl.ts lib/api/chesscomClient.ts lib/api/pubApiCoordinator.ts lib/chess/pgnParser.ts tests/unit/ingestion/archivePlanner.test.ts tests/dom/ingestion/ingestionService.test.ts tests/unit/chess/pgnParser.test.ts tests/api/chesscomClient.test.ts`

- [ ] **Step 2: Run repository checks**

Run: `npm run format:check && npm run lint && npm run typecheck && npm test`

Expected: every command exits zero.
