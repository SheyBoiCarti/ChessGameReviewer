# Phase 1 Audit Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the existing Phase 1 implementation into complete, independently verified conformance with the canonical Phase 1 ingestion, persistence, security, and quality-gate requirements.

**Architecture:** Retain and harden the existing framework, PubAPI, and IndexedDB foundations, but replace the incomplete synchronization orchestrator with focused planning, retry, ingestion, and job-management modules under `features/ingestion`. Keep the PubAPI client as the only network boundary, IndexedDB repositories as the only durable-data boundary, and make every terminal state and quality gate deterministic and testable.

**Tech Stack:** Next.js 16.3.0, React 19.2.8, strict TypeScript 5.9.3, IndexedDB/fake-indexeddb, Vitest 3.2.7, Testing Library, Playwright 1.62.1, ESLint 9, Prettier 3.

## Global Constraints

- Minimum permitted Next.js version is 16.2.11; use stable Active LTS, not a preview/canary build.
- Use only direct browser requests to `https://api.chess.com`; never add a server PubAPI proxy.
- PubAPI requests use `GET`, `mode: 'cors'`, `credentials: 'omit'`, `redirect: 'follow'`, `cache: 'default'`, and no custom request headers.
- The per-attempt deadline is 10 seconds and the response ceiling is 32 MiB streamed bytes or 20,000 raw monthly games.
- `GameQuery.maxGames` is inclusive 1 through 5,000 and defaults to 500.
- Current-month data is fresh for 15 minutes; completed-month data is fresh for 30 days; archive-list metadata is fresh for 15 minutes.
- Retry only network/CORS, timeout, 429, 502, 503, and 504 failures, with at most three total attempts.
- Store PGN exactly once, only in the `games` record; never store raw monthly payloads.
- IndexedDB database name is `ChessGameAnalyzerDB`, initial schema version is 1.
- Diagnostics never contain full usernames, username-bearing URLs, response bodies, or PGNs.
- Normal pull-request CI makes no live Chess.com calls.
- Strict TypeScript, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` remain enabled.
- Do not implement PGN parsing, opening graphs, Stockfish, Phase 4 workspace UI, or other post-Phase-1 behavior.

---

## File Structure

- `package.json`, `package-lock.json`: exact tool versions and truthful scripts.
- `vitest.config.ts`: project discovery and coverage enforcement.
- `eslint.config.mjs`, `.github/workflows/ci.yml`: complete static/browser gates.
- `next.config.ts`: security/isolation headers and hardened CSP.
- `lib/api/contracts.ts`: shared query, progress, normalized-game, diagnostic, and upstream error contracts.
- `lib/api/chesscomSchemas.ts`: strict `unknown` narrowing for upstream endpoint payloads.
- `lib/api/errors.ts`: redacted typed PubAPI error representation.
- `lib/api/pubApiCoordinator.ts`: per-tab serialization and abortable per-attempt Web Lock acquisition.
- `lib/api/chesscomClient.ts`: approved URL fetch/body boundary; parsing happens after lock release.
- `lib/db/schema.ts`: schema records and runtime validators.
- `lib/db/openDatabase.ts`: database lifecycle and upgrade/recovery errors.
- `lib/db/repositories.ts`: explicit read/write operations and atomic month commits.
- `lib/db/retention.ts`: compatibility checks and true LRU eviction.
- `lib/db/deleteLocalData.ts`: scoped and complete deletion confirmations.
- `features/ingestion/types.ts`: ingestion dependency/progress/result contracts.
- `features/ingestion/archivePlanner.ts`: fingerprinting and UTC month planning.
- `features/ingestion/retryPolicy.ts`: retry classification, jitter, `Retry-After`, and abort-aware waits.
- `features/ingestion/ingestionService.ts`: one-job ingestion state machine plus active-job manager.
- `lib/ingestion/syncOrchestrator.ts`, `lib/ingestion/jobQueue.ts`: remove after consumers/tests migrate; their responsibilities move to the specified feature modules.
- `tests/helpers/phase1Fixtures.ts`: typed factories for queries, raw/normalized games, sync metadata, and endpoint responses used across Phase 1 suites.
- `tests/**`: deterministic contract, repository, ingestion, and browser evidence.

The first task that needs a shared fixture creates `tests/helpers/phase1Fixtures.ts` with these exact factories; later tasks extend the same file rather than duplicating literals:

```ts
export const NOW = Date.UTC(2026, 7, 12, 12);

export function makeQuery(overrides: Partial<GameQuery> = {}): GameQuery {
  return {
    username: 'janedoe',
    maxGames: 500,
    timeClasses: ['bullet', 'blitz', 'rapid', 'daily'],
    colors: ['white', 'black'],
    ...overrides,
  };
}

export function makeRawGame(overrides: Partial<RawChesscomGame> = {}): RawChesscomGame {
  return {
    url: 'https://www.chess.com/game/live/100',
    uuid: 'game-100',
    pgn: '1. e4 e5 1/2-1/2',
    end_time: Math.floor(NOW / 1000),
    time_class: 'blitz',
    rules: 'chess',
    rated: true,
    white: { username: 'janedoe', rating: 1500, result: 'agreed' },
    black: { username: 'opponent', rating: 1500, result: 'agreed' },
    ...overrides,
  };
}

export function makeGameRecord(overrides: Partial<GameRecord> = {}): GameRecord {
  return {
    id: 'game-100',
    username: 'janedoe',
    url: 'https://www.chess.com/game/live/100',
    userColor: 'white',
    result: 'draw',
    endedAt: Math.floor(NOW / 1000),
    timeClass: 'blitz',
    rated: true,
    userRating: 1500,
    opponentRating: 1500,
    pgn: '1. e4 e5 1/2-1/2',
    rules: 'chess',
    ...overrides,
  };
}

export function makeArchiveSync(overrides: Partial<ArchiveSyncRecord> = {}): ArchiveSyncRecord {
  return {
    key: 'janedoe:2026-08',
    username: 'janedoe',
    month: '2026-08',
    lastSuccessfulFetchAt: NOW - 60_000,
    status: 'success',
    observedGameIds: ['game-100'],
    observedGameCount: 1,
    normalizerVersion: NORMALIZER_VERSION,
    ...overrides,
  };
}

export function jsonResponse(value: unknown, url: string, init: ResponseInit = {}): Response {
  const response = new Response(JSON.stringify(value), {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}
```

Task 2 creates the query/raw/record/sync factories when its first tests need them. Task 3 adds `jsonResponse` when its first response-boundary test needs it. Test-helper additions accompany the failing test that first consumes them; they are not production implementation.

---

### Task 1: Make Quality Gates Truthful

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.ts`
- Modify: `eslint.config.mjs`
- Modify: `.github/workflows/ci.yml`
- Modify: `next.config.ts`
- Modify: `tests/setup/headers.test.ts`
- Create: `tests/setup/test-discovery.test.ts`
- Create: `tests/setup/worker-strategy.test.ts`

**Interfaces:**
- Consumes: existing npm/Vitest/ESLint/Next.js configuration.
- Produces: `npm test` discovers `tests/unit`, `tests/dom`, `tests/setup`, and `tests/api`; `npm run test:coverage` enforces branch thresholds; `npm run lint` checks all source/config files; CI runs production Playwright.

- [ ] **Step 1: Add failing configuration assertions**

```ts
// tests/setup/test-discovery.test.ts
import { describe, expect, it } from 'vitest';
import config from '../../vitest.config';

describe('test discovery and coverage gates', () => {
  it('includes API contract tests in the DOM project', () => {
    const projects = config.test?.projects ?? [];
    expect(JSON.stringify(projects)).toContain('tests/api/**/*.test.ts');
  });

  it('enforces the documented global coverage minimums', () => {
    expect(config.test?.coverage?.thresholds).toMatchObject({
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    });
  });
});
```

Extend `tests/setup/headers.test.ts` with:

```ts
it('does not permit general unsafe eval', () => {
  const csp = securityHeaders.find((header) => header.key === 'Content-Security-Policy');
  expect(csp?.value).toContain("'wasm-unsafe-eval'");
  expect(csp?.value).not.toMatch(/(?:^|\s)'unsafe-eval'(?:\s|;|$)/);
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm.cmd exec vitest run tests/setup/test-discovery.test.ts tests/setup/headers.test.ts`  
Expected: FAIL because thresholds are absent and CSP contains `'unsafe-eval'`.

- [ ] **Step 3: Repair scripts, discovery, CSP, lint scope, and CI**

Set scripts to:

```json
{
  "lint": "eslint .",
  "test": "vitest run",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "verify": "npm run format:check && npm run lint && npm run typecheck && npm run test:coverage && npm run build && npm run test:e2e"
}
```

Set the DOM project's `include` to:

```ts
include: [
  'tests/dom/**/*.test.ts',
  'tests/dom/**/*.test.tsx',
  'tests/api/**/*.test.ts',
],
```

Set coverage configuration to:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'json', 'html'],
  include: ['lib/**/*.ts', 'features/**/*.ts', 'components/**/*.tsx'],
  exclude: ['**/*.d.ts', 'lib/api/contracts.ts', 'features/ingestion/types.ts'],
  thresholds: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
    'lib/**/*.ts': { branches: 90 },
    'features/**/*.ts': { branches: 90 },
  },
},
```

Remove `'unsafe-eval'` from `script-src`, retaining `'wasm-unsafe-eval'`. Update CI to run `npm run test:coverage`, `npm run build`, `npx playwright install --with-deps chromium`, and `npm run test:e2e`. Use `npm install --save-exact` for every direct dependency at the currently locked versions so `package.json` contains no `^` or `~` ranges. Add `"engines": { "node": ">=20.9.0" }` and retain Node 24.19.0 in CI. In `worker-strategy.test.ts`, instantiate the DOM test worker shim, post a message, terminate it, and assert those operations are safe so the configured worker-test strategy is executable rather than a comment-only promise.

- [ ] **Step 4: Run focused and gate checks**

Run: `npm.cmd exec vitest run tests/setup/test-discovery.test.ts tests/setup/headers.test.ts`  
Expected: PASS.

Run: `npm.cmd test -- --reporter=verbose`  
Expected: output includes `tests/api/chesscomClient.test.ts` and all discovered tests pass at this checkpoint.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts eslint.config.mjs next.config.ts .github/workflows/ci.yml tests/setup
git commit -m "fix(tooling): make Phase 1 quality gates comprehensive"
```

---

### Task 2: Harden Shared Contracts and Query Validation

**Files:**
- Modify: `lib/api/contracts.ts`
- Modify: `lib/validation/gameQuery.ts`
- Modify: `lib/api/chesscomSchemas.ts`
- Modify: `tests/unit/gameQuery.test.ts`
- Modify: `tests/unit/chesscomSchemas.test.ts`
- Create: `tests/fixtures/upstream/oversizedMonthlyGames.ts`
- Create: `tests/helpers/phase1Fixtures.ts`

**Interfaces:**
- Consumes: `unknown` query and upstream values.
- Produces: `validateGameQuery(input: unknown): ValidationResult<GameQuery>`; strict endpoint schema results; safe diagnostic codes.

- [ ] **Step 1: Add failing query and schema tests**

```ts
it('normalizes username and set-like filters without duplicates', () => {
  const result = validateGameQuery({
    username: '  MagnusCarlsen  ',
    timeClasses: ['blitz', 'blitz', 'rapid'],
    colors: ['white', 'white'],
  });
  expect(result).toEqual({
    success: true,
    data: {
      username: 'magnuscarlsen',
      maxGames: 500,
      timeClasses: ['blitz', 'rapid'],
      colors: ['white'],
    },
  });
});

it('rejects a non-string archives element instead of silently dropping it', () => {
  const result = validateArchivesResponse({ archives: ['https://api.chess.com/a', 42] });
  expect(result).toMatchObject({
    success: false,
    diagnostic: { code: 'INVALID_ARCHIVES_SCHEMA' },
  });
});

it('uses a UUID instead of a username-bearing game URL in diagnostics', () => {
  const result = validateRawGame({
    url: 'https://www.chess.com/game/live/private-user-123',
    uuid: 'safe-uuid',
  });
  expect(result).toMatchObject({ success: false, diagnostic: { gameId: 'safe-uuid' } });
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd exec vitest run tests/unit/gameQuery.test.ts tests/unit/chesscomSchemas.test.ts`  
Expected: FAIL because username casing/duplicate sets are preserved, archives entries are filtered, and URL is preferred as a diagnostic ID.

- [ ] **Step 3: Implement canonical normalization and strict narrowing**

Use stable helpers:

```ts
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; diagnostics: Diagnostic[] };

const unique = <T>(values: T[]): T[] => [...new Set(values)];

// After grammar validation:
username = username.toLowerCase();
query.timeClasses = unique(timeClasses);
query.colors = unique(colors);
```

Make `validateArchivesResponse` fail the entire response on any non-string, empty, or non-approved archive URL. Prefer `uuid`/`@id` for diagnostics and otherwise use a bounded index token; do not use the raw game URL in diagnostic fields or messages. Export `makeOversizedMonthlyGamesFixture(): unknown` from the new fixture module; it returns `{ games: Array.from({ length: 20_001 }, (_, index) => ({ ...validRawGame, uuid: `oversized-${index}` })) }` so oversized behavior has a named deterministic fixture without committing a multi-megabyte JSON blob.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd exec vitest run tests/unit/gameQuery.test.ts tests/unit/chesscomSchemas.test.ts tests/unit/results.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/api/contracts.ts lib/api/chesscomSchemas.ts lib/validation/gameQuery.ts tests/unit
git commit -m "fix(validation): enforce canonical Phase 1 contracts"
```

---

### Task 3: Make PubAPI Attempts Typed, Abortable, and Lock-Scoped

**Files:**
- Modify: `lib/api/contracts.ts`
- Modify: `lib/api/errors.ts`
- Modify: `lib/api/pubApiCoordinator.ts`
- Modify: `lib/api/chesscomClient.ts`
- Modify: `tests/api/chesscomClient.test.ts`
- Modify: `tests/helpers/phase1Fixtures.ts`

**Interfaces:**
- Consumes: approved `URL`, `AbortSignal`, endpoint discriminator.
- Produces: `PubApiError` with `code`, `retryable`, optional `status`, optional `retryAfterMs`; `PubApiCoordinator.execute<T>(task, signal?)`; endpoint fetch functions.

- [ ] **Step 1: Add failing response and lock tests**

```ts
it('distinguishes wrong content type, malformed JSON, and invalid schema', async () => {
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response('{}', { headers: { 'content-type': 'text/html' } }))
    .mockResolvedValueOnce(new Response('{', { headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response('{}', { headers: { 'content-type': 'application/json' } }));

  await expect(fetchPlayerArchives('hikaru')).rejects.toMatchObject({ code: 'WRONG_CONTENT_TYPE' });
  await expect(fetchPlayerArchives('hikaru')).rejects.toMatchObject({ code: 'MALFORMED_JSON' });
  await expect(fetchPlayerArchives('hikaru')).rejects.toMatchObject({ code: 'INVALID_SCHEMA' });
});

it('passes cancellation to Web Lock acquisition', async () => {
  const controller = new AbortController();
  const request = vi.fn((_name, options, callback) => callback());
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
  await new PubApiCoordinator().execute(async () => 'ok', controller.signal);
  expect(request).toHaveBeenCalledWith(
    'chesscom-pubapi-lock',
    { signal: controller.signal },
    expect.any(Function)
  );
});

it('parses JSON after releasing the Web Lock', async () => {
  const events: string[] = [];
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: vi.fn(async (_name, _options, callback) => {
        events.push('lock-start');
        const value = await callback();
        events.push('lock-end');
        return value;
      }),
    },
  });
  const originalParse = JSON.parse;
  vi.spyOn(JSON, 'parse').mockImplementation((text: string) => {
    events.push('parse');
    return originalParse(text);
  });
  const response = new Response(JSON.stringify({ archives: [] }), {
    headers: { 'content-type': 'application/json' },
  });
  Object.defineProperty(response, 'url', {
    value: 'https://api.chess.com/pub/player/hikaru/games/archives',
  });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

  await fetchPlayerArchives('hikaru');

  expect(events).toEqual(['lock-start', 'lock-end', 'parse']);
});
```

Add cases for UTF-8 fallback byte counting, empty/malformed `Content-Length`, absent/empty final response URL, final URL query/hash rejection, `application/json` and `application/*+json` acceptance, 502/503/504-only retryability, and `Retry-After` seconds/date parsing.

- [ ] **Step 2: Run PubAPI tests and confirm RED**

Run: `npm.cmd exec vitest run tests/api/chesscomClient.test.ts`  
Expected: FAIL on error-code distinction, lock options/scope, and retry metadata.

- [ ] **Step 3: Implement typed boundary and narrow lock scope**

Extend the error:

```ts
export class PubApiError extends Error implements UpstreamError {
  readonly code: UpstreamErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}
```

Coordinator signature:

```ts
async execute<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  // Await prior attempt, then navigator.locks.request(LOCK_NAME, { signal }, task).
}
```

Return a bounded byte buffer/string from the locked network/body-read stage. Reject an absent final response URL and validate final origin/path/search/hash plus JSON media type before reading. Accept `application/json` and structured JSON suffixes such as `application/ld+json`. Decode and `JSON.parse` only after `execute` resolves. Use `TextEncoder().encode(text).byteLength` for the non-stream fallback. Map only 502/503/504 5xx statuses as retryable; other 5xx remain typed unavailable but non-retryable.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd exec vitest run tests/api/chesscomClient.test.ts`  
Expected: PASS with all fetch, resource, lock, cancellation, and redaction cases.

- [ ] **Step 5: Commit**

```powershell
git add lib/api/errors.ts lib/api/pubApiCoordinator.ts lib/api/chesscomClient.ts tests/api/chesscomClient.test.ts
git commit -m "fix(api): harden direct PubAPI request boundary"
```

---

### Task 4: Make IndexedDB Schema and Recovery Explicit

**Files:**
- Modify: `lib/db/schema.ts`
- Modify: `lib/db/openDatabase.ts`
- Modify: `tests/dom/db/schema.test.ts`
- Modify: `tests/dom/db/openDatabase.test.ts`
- Modify: `tests/dom/db/migration.test.ts`

**Interfaces:**
- Consumes: persisted `unknown` records and browser IndexedDB lifecycle events.
- Produces: canonical database/stores/indexes; `CorruptRecordError`, `SchemaVersionError`, `DatabaseBlockedError`, and `StorageUnavailableError`.

- [ ] **Step 1: Add failing schema/recovery tests**

```ts
it('uses the canonical production database name', () => {
  expect(DB_NAME).toBe('ChessGameAnalyzerDB');
});

it('rejects non-finite numeric and malformed key fields', () => {
  expect(isValidGameRecord({ ...makeGameRecord(), endedAt: Number.NaN })).toBe(false);
  expect(isValidArchiveSyncRecord({ ...makeArchiveSync(), month: '2026-13' })).toBe(false);
  expect(isValidArchiveSyncRecord({ ...makeArchiveSync(), observedGameCount: -1 })).toBe(false);
});

it('aborts a failed upgrade and surfaces a recoverable schema error', async () => {
  const name = 'Phase1IncompatibleUpgrade';
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORES.GAMES, { keyPath: 'wrongKey' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });

  await expect(openDatabase({ name, version: 2 })).rejects.toBeInstanceOf(SchemaVersionError);

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
});
```

- [ ] **Step 2: Run schema tests and confirm RED**

Run: `npm.cmd exec vitest run tests/dom/db/schema.test.ts tests/dom/db/openDatabase.test.ts tests/dom/db/migration.test.ts`  
Expected: FAIL on database name, numeric/month validation, and incompatible-upgrade handling.

- [ ] **Step 3: Implement strict validators and upgrade failure handling**

Use predicates such as:

```ts
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isMonth = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
```

During upgrade, verify existing store key paths and required index key paths. On mismatch, abort the upgrade transaction and reject `SchemaVersionError` with reset guidance. Remove console logging of raw IndexedDB errors; wrap errors without user data.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd exec vitest run tests/dom/db/schema.test.ts tests/dom/db/openDatabase.test.ts tests/dom/db/migration.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/db/schema.ts lib/db/openDatabase.ts tests/dom/db/schema.test.ts tests/dom/db/openDatabase.test.ts tests/dom/db/migration.test.ts
git commit -m "fix(db): enforce canonical schema and recovery behavior"
```

---

### Task 5: Add Cache Repositories, Explicit Corruption, and True LRU

**Files:**
- Modify: `lib/db/repositories.ts`
- Modify: `lib/db/retention.ts`
- Modify: `lib/db/deleteLocalData.ts`
- Modify: `tests/dom/db/repositories.test.ts`
- Modify: `tests/dom/db/retention.test.ts`
- Modify: `tests/dom/db/deleteLocalData.test.ts`

**Interfaces:**
- Consumes: records from Task 4.
- Produces:
  - `getGamesForMonth(db, username, month): Promise<GameRecord[]>`
  - `getArchiveListMeta(db, username): Promise<ArchiveListMeta | null>`
  - `putArchiveListMeta(db, record): Promise<void>`
  - `saveSyncBatch(db, games, marker, signal?): Promise<void>`
  - repository reads that throw `CorruptRecordError` for invalid persisted data.

- [ ] **Step 1: Add failing repository and LRU tests**

```ts
it('loads only games in the requested UTC month', async () => {
  const julyGame = makeGameRecord({
    id: 'july',
    endedAt: Date.UTC(2026, 6, 15) / 1000,
  });
  const augustGame = makeGameRecord({
    id: 'august',
    endedAt: Date.UTC(2026, 7, 15) / 1000,
  });
  await upsertGames(db, [julyGame, augustGame]);
  await expect(getGamesForMonth(db, 'JaneDoe', '2026-08')).resolves.toEqual([augustGame]);
});

it('round-trips normalized archive-list metadata without PGN or raw payloads', async () => {
  const record = {
    username: 'janedoe',
    months: ['2026-08', '2026-07'],
    fetchedAt: 123,
  };
  await putArchiveListMeta(db, record);
  expect(await getArchiveListMeta(db, 'janedoe')).toEqual(record);
  expect(JSON.stringify(record)).not.toMatch(/pgn|rawMonthly/i);
});

it('surfaces corrupt persisted records rather than silently dropping them', async () => {
  const tx = db.transaction(STORES.GAMES, 'readwrite');
  tx.objectStore(STORES.GAMES).put({
    ...makeGameRecord(),
    id: 'corrupt',
    endedAt: Number.NaN,
  });
  await transactionDone(tx);
  await expect(getGamesForUser(db, 'janedoe')).rejects.toMatchObject({
    name: 'CorruptRecordError',
  });
});

it('evicts snapshots by least-recently-used time, not creation time', async () => {
  const tx = db.transaction(STORES.GRAPH_SNAPSHOTS, 'readwrite');
  const store = tx.objectStore(STORES.GRAPH_SNAPSHOTS);
  store.put({
    key: 'old-created-recent-use', username: 'janedoe', createdAt: 1,
    lastUsedAt: 30, snapshotData: {}, byteSize: 2,
  });
  store.put({
    key: 'new-created-old-use', username: 'janedoe', createdAt: 20,
    lastUsedAt: 2, snapshotData: {}, byteSize: 2,
  });
  await transactionDone(tx);
  await evictGraphSnapshots(db, { maxCount: 1 });
  expect(await getGraphSnapshot(db, 'new-created-old-use')).toBeNull();
});
```

Define the test-only transaction helper in the same repository test file:

```ts
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
```

Add a test proving an already-aborted `saveSyncBatch` writes neither games nor marker and deletion removes archive-list metadata case-insensitively.

- [ ] **Step 2: Run repository tests and confirm RED**

Run: `npm.cmd exec vitest run tests/dom/db/repositories.test.ts tests/dom/db/retention.test.ts tests/dom/db/deleteLocalData.test.ts`  
Expected: FAIL because month/meta APIs and corruption errors do not exist and snapshot eviction uses `createdAt`.

- [ ] **Step 3: Implement repository APIs and LRU**

Define:

```ts
export interface ArchiveListMeta {
  username: string;
  months: string[];
  fetchedAt: number;
}

export class CorruptRecordError extends Error {
  readonly store: StoreName;
  constructor(store: StoreName) {
    super(`Stored ${store} data is incompatible. Clear local data and retry.`);
    this.name = 'CorruptRecordError';
    this.store = store;
  }
}
```

Implement month reads with the username index plus an in-memory UTC month predicate, because schema v1 has no compound month index. Validate every returned record; throw on the first corrupt record. Add `lastUsedAt` index to graph snapshots during schema creation/migration and evict through it. Use a shared helper that throws the typed `ABORTED` PubAPI error before opening `saveSyncBatch`. While the transaction is active, attach a one-shot abort listener that calls `tx.abort()`; remove it on completion/error/abort. This guarantees cancellation before commit leaves neither games nor the successful marker.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd exec vitest run tests/dom/db`  
Expected: all IndexedDB tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/db tests/dom/db
git commit -m "feat(db): support safe ingestion cache and true LRU retention"
```

---

### Task 6: Define Ingestion Contracts, Fingerprinting, and Archive Planning

**Files:**
- Create: `features/ingestion/types.ts`
- Create: `features/ingestion/archivePlanner.ts`
- Create: `tests/unit/ingestion/archivePlanner.test.ts`

**Interfaces:**
- Consumes: validated `GameQuery`, normalized `YYYY-MM` archive values.
- Produces:
  - `fingerprintQuery(query: GameQuery): string`
  - `parseArchiveMonth(url: string, username: string): string`
  - `planArchiveMonths(months: readonly string[], query: GameQuery): string[]`
  - `IngestionProgress`, `IngestionResult`, `IngestionDependencies`, and source/terminal contracts.

- [ ] **Step 1: Write failing planner tests**

```ts
describe('planArchiveMonths', () => {
  it('intersects inclusive UTC bounds and sorts newest first', () => {
    expect(
      planArchiveMonths(['2025-12', '2026-02', '2026-01', 'bad'], {
        username: 'janedoe',
        dateFrom: '2026-01-31',
        dateTo: '2026-02-01',
        maxGames: 500,
        timeClasses: ['blitz'],
        colors: ['white', 'black'],
      })
    ).toEqual(['2026-02', '2026-01']);
  });

  it('creates the same fingerprint for semantically equal set ordering', () => {
    expect(fingerprintQuery(query(['rapid', 'blitz'], ['black', 'white']))).toBe(
      fingerprintQuery(query(['blitz', 'rapid'], ['white', 'black']))
    );
  });
});
```

- [ ] **Step 2: Run planner tests and confirm RED**

Run: `npm.cmd exec vitest run tests/unit/ingestion/archivePlanner.test.ts`  
Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement exact contracts and pure planner**

Use:

```ts
export type IngestionPhase =
  | 'planning'
  | 'loading-cache'
  | 'fetching'
  | 'filtering';
export type IngestionTerminalStatus = 'complete' | 'partial' | 'cancelled' | 'failed';
export type IngestionDataSource = 'indexeddb' | 'browser-fetch';

export interface FailedMonth {
  month: string;
  error: UpstreamError;
  retryable: boolean;
  attempts: number;
}

export interface RetryProgress {
  attempt: number;
  delayMs: number;
}

export interface IngestionProgress {
  jobId: string;
  phase: IngestionPhase;
  monthsPlanned: number;
  monthsCompleted: number;
  recordsFetched: number;
  recordsAccepted: number;
  recordsExcluded: number;
  recordsFailed: number;
  currentMonth?: string;
  source?: IngestionDataSource;
  retry?: RetryProgress;
  diagnostics: Diagnostic[];
}

export interface IngestionResult {
  jobId: string;
  fingerprint: string;
  status: IngestionTerminalStatus;
  games: GameRecord[];
  failedMonths: FailedMonth[];
  diagnostics: Diagnostic[];
  offlineCacheOnly: boolean;
}

export interface IngestionDependencies {
  fetchArchives(username: string, options: FetchOptions): Promise<string[]>;
  fetchMonthlyGames(
    username: string,
    year: string,
    month: string,
    options: FetchOptions
  ): Promise<RawChesscomGame[]>;
  readArchiveList(username: string): Promise<ArchiveListMeta | null>;
  writeArchiveList(record: ArchiveListMeta): Promise<void>;
  readArchiveSyncs(username: string): Promise<ArchiveSyncRecord[]>;
  readMonthGames(username: string, month: string): Promise<GameRecord[]>;
  persistMonth(
    games: GameRecord[],
    marker: ArchiveSyncRecord,
    signal?: AbortSignal
  ): Promise<void>;
}

export interface RunIngestionOptions {
  deps: IngestionDependencies;
  jobId?: string;
  signal?: AbortSignal;
  manualRefresh?: boolean;
  now?: () => number;
  random?: () => number;
  wait?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  onProgress?: (progress: IngestionProgress) => void;
}

export type StartOptions = Omit<RunIngestionOptions, 'deps' | 'jobId' | 'signal'>;
```

Fingerprint a stable JSON representation with sorted set arrays. `parseArchiveMonth` accepts only the approved HTTPS `api.chess.com/pub/player/{normalized-user}/games/YYYY/MM` family and returns `YYYY-MM`; every other value throws `INVALID_ARCHIVE_URL`. A month intersects when its first/last UTC instants overlap `dateFrom` 00:00:00Z through `dateTo` 23:59:59.999Z.

- [ ] **Step 4: Run planner tests**

Run: `npm.cmd exec vitest run tests/unit/ingestion/archivePlanner.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add features/ingestion/types.ts features/ingestion/archivePlanner.ts tests/unit/ingestion/archivePlanner.test.ts
git commit -m "feat(ingestion): add query fingerprint and archive planner"
```

---

### Task 7: Implement Bounded Abort-Aware Retry Policy

**Files:**
- Create: `features/ingestion/retryPolicy.ts`
- Create: `tests/unit/ingestion/retryPolicy.test.ts`

**Interfaces:**
- Consumes: `PubApiError`, operation callback, abort signal, injected clock/random.
- Produces: `executeWithRetry<T>(operation, options): Promise<T>` and retry progress callbacks.

```ts
export interface RetryOptions {
  signal: AbortSignal;
  baseDelayMs: number;
  random: () => number;
  wait: (delayMs: number, signal: AbortSignal) => Promise<void>;
  onRetry?: (progress: RetryProgress) => void;
}
```

- [ ] **Step 1: Write failing retry tests**

```ts
it.each([
  ['CORS_ERROR', undefined],
  ['TIMEOUT', undefined],
  ['UPSTREAM_RATE_LIMITED', 429],
  ['UPSTREAM_UNAVAILABLE', 502],
  ['UPSTREAM_UNAVAILABLE', 503],
  ['UPSTREAM_UNAVAILABLE', 504],
])('retries %s/%s at most three total attempts', async (code, status) => {
  const operation = vi.fn()
    .mockRejectedValueOnce(pubError(code, status))
    .mockRejectedValueOnce(pubError(code, status))
    .mockResolvedValue('ok');
  await expect(executeWithRetry(operation, fakeOptions())).resolves.toBe('ok');
  expect(operation).toHaveBeenCalledTimes(3);
});

it('does not retry 500, offline, abort, schema, or size errors', async () => {
  // Table-drive each error and assert one operation call.
});

it('honors readable Retry-After and aborts during the wait', async () => {
  const controller = new AbortController();
  const wait = vi.fn((_ms, signal) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
  }));
  const promise = executeWithRetry(
    () => Promise.reject(rateLimitError({ retryAfterMs: 4000 })),
    { ...fakeOptions(), signal: controller.signal, wait }
  );
  controller.abort();
  await expect(promise).rejects.toMatchObject({ code: 'ABORTED' });
  expect(wait).toHaveBeenCalledWith(4000, controller.signal);
});
```

- [ ] **Step 2: Run retry tests and confirm RED**

Run: `npm.cmd exec vitest run tests/unit/ingestion/retryPolicy.test.ts`  
Expected: FAIL because retry policy does not exist.

- [ ] **Step 3: Implement minimal retry loop**

```ts
export async function executeWithRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    throwIfAborted(options.signal);
    try {
      return await operation(attempt);
    } catch (error) {
      if (!isRetryable(error) || attempt === 3) throw error;
      const exponentialCap = options.baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(options.random() * exponentialCap);
      const delayMs = error.retryAfterMs ?? jitter;
      options.onRetry?.({ attempt: attempt + 1, delayMs });
      await options.wait(delayMs, options.signal);
    }
  }
  throw new Error('unreachable');
}
```

- [ ] **Step 4: Run retry tests**

Run: `npm.cmd exec vitest run tests/unit/ingestion/retryPolicy.test.ts`  
Expected: PASS with fake time and no real delays.

- [ ] **Step 5: Commit**

```powershell
git add features/ingestion/retryPolicy.ts tests/unit/ingestion/retryPolicy.test.ts
git commit -m "feat(ingestion): add bounded abort-aware retry policy"
```

---

### Task 8: Implement Complete One-Job Ingestion State Machine

**Files:**
- Create: `features/ingestion/ingestionService.ts`
- Create: `tests/dom/ingestion/ingestionService.test.ts`
- Delete: `lib/ingestion/syncOrchestrator.ts`
- Delete: `tests/dom/ingestion/syncOrchestrator.test.ts`

**Interfaces:**
- Consumes: Tasks 2–7 contracts and injected dependencies.
- Produces: `runIngestion(input: unknown, options: RunIngestionOptions): Promise<IngestionResult>`.

Internal signatures are fixed as:

```ts
interface RequiredRuntimeOptions {
  deps: IngestionDependencies;
  jobId: string;
  signal: AbortSignal;
  manualRefresh: boolean;
  now: () => number;
  retry: RetryOptions;
  onProgress?: (progress: IngestionProgress) => void;
}

type NormalizationResult =
  | { success: true; game: GameRecord }
  | { success: false; diagnostic: Diagnostic };

function normalizeRawGame(raw: RawChesscomGame, username: string): NormalizationResult;
function safeDiagnostic(error: unknown): Diagnostic;
function isPubApiError(error: unknown, code?: UpstreamErrorCode): error is PubApiError;
function isOfflineError(error: unknown): boolean;
function terminal(
  runtime: RequiredRuntimeOptions,
  status: IngestionTerminalStatus,
  games: GameRecord[],
  failedMonths: FailedMonth[],
  diagnostics: Diagnostic[],
  offlineCacheOnly?: boolean
): IngestionResult;
```

- [ ] **Step 1: Add failing planning/cache tests**

```ts
function fakeDependencies(
  overrides: Partial<IngestionDependencies> = {}
): IngestionDependencies {
  return {
    fetchArchives: vi.fn().mockResolvedValue([
      'https://api.chess.com/pub/player/janedoe/games/2026/08',
    ]),
    fetchMonthlyGames: vi.fn().mockResolvedValue([]),
    readArchiveList: vi.fn().mockResolvedValue(null),
    writeArchiveList: vi.fn().mockResolvedValue(undefined),
    readArchiveSyncs: vi.fn().mockResolvedValue([]),
    readMonthGames: vi.fn().mockResolvedValue([]),
    persistMonth: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

it('uses fresh cached archive metadata and normalized games without a browser fetch', async () => {
  const cachedGame = makeGameRecord();
  const deps = fakeDependencies({
    readArchiveList: vi.fn().mockResolvedValue({
      username: 'janedoe', months: ['2026-08'], fetchedAt: NOW - 60_000,
    }),
    readArchiveSyncs: vi.fn().mockResolvedValue([makeArchiveSync()]),
    readMonthGames: vi.fn().mockResolvedValue([cachedGame]),
  });
  const result = await runIngestion(makeQuery(), { deps, now: () => NOW });
  expect(result).toMatchObject({ status: 'complete', games: [cachedGame] });
  expect(deps.fetchArchives).not.toHaveBeenCalled();
  expect(deps.fetchMonthlyGames).not.toHaveBeenCalled();
});

it('manual refresh bypasses application freshness but retains browser cache mode', async () => {
  const deps = fakeDependencies({
    readArchiveList: vi.fn().mockResolvedValue({
      username: 'janedoe', months: ['2026-08'], fetchedAt: NOW - 60_000,
    }),
    readArchiveSyncs: vi.fn().mockResolvedValue([makeArchiveSync()]),
  });
  await runIngestion(makeQuery(), { deps, manualRefresh: true, now: () => NOW });
  expect(deps.fetchArchives).toHaveBeenCalledTimes(1);
  expect(deps.fetchMonthlyGames).toHaveBeenCalledTimes(1);
});

it('uses stale cached data while offline and reports freshness explicitly', async () => {
  const cachedGame = makeGameRecord();
  const deps = fakeDependencies({
    readArchiveList: vi.fn().mockResolvedValue({
      username: 'janedoe', months: ['2026-08'], fetchedAt: NOW - 60 * 60_000,
    }),
    readArchiveSyncs: vi.fn().mockResolvedValue([
      makeArchiveSync({ lastSuccessfulFetchAt: NOW - 60 * 60_000 }),
    ]),
    readMonthGames: vi.fn().mockResolvedValue([cachedGame]),
    fetchArchives: vi.fn().mockRejectedValue(createOfflineError()),
  });
  const result = await runIngestion(makeQuery(), { deps, now: () => NOW });
  expect(result).toMatchObject({ status: 'complete', offlineCacheOnly: true });
  expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'OFFLINE_STALE_CACHE' }));
});
```

- [ ] **Step 2: Run cache tests and confirm RED**

Run: `npm.cmd exec vitest run tests/dom/ingestion/ingestionService.test.ts -t "cache|manual refresh|offline"`  
Expected: FAIL because ingestion service does not exist.

- [ ] **Step 3: Implement planning and cache selection**

Implement `runIngestion` with injected functions in `IngestionDependencies`; emit immutable progress snapshots through `onProgress`. Treat freshness thresholds as `now - fetchedAt <= threshold`. If offline archive planning fails, derive months from cached archive metadata; if metadata is absent, derive candidate months from archive-sync records before declaring failure.

```ts
const ARCHIVE_LIST_FRESH_MS = 15 * 60_000;
const CURRENT_MONTH_FRESH_MS = 15 * 60_000;
const COMPLETED_MONTH_FRESH_MS = 30 * 24 * 60 * 60_000;

function isFresh(fetchedAt: number, thresholdMs: number, now: number): boolean {
  return fetchedAt <= now && now - fetchedAt <= thresholdMs;
}

async function resolveArchiveMonths(
  query: GameQuery,
  options: RequiredRuntimeOptions
): Promise<{ months: string[]; offlineCacheOnly: boolean }> {
  const cached = await options.deps.readArchiveList(query.username);
  if (!options.manualRefresh && cached && isFresh(cached.fetchedAt, ARCHIVE_LIST_FRESH_MS, options.now())) {
    return { months: planArchiveMonths(cached.months, query), offlineCacheOnly: false };
  }
  try {
    const archives = await executeWithRetry(
      () => options.deps.fetchArchives(query.username, { signal: options.signal }),
      options.retry
    );
    const months = archives.map((archive) => parseArchiveMonth(archive, query.username));
    await options.deps.writeArchiveList({ username: query.username, months, fetchedAt: options.now() });
    return { months: planArchiveMonths(months, query), offlineCacheOnly: false };
  } catch (error) {
    if (isOfflineError(error) && cached) {
      return { months: planArchiveMonths(cached.months, query), offlineCacheOnly: true };
    }
    throw error;
  }
}
```

- [ ] **Step 4: Add failing normalization/filter/dedup/max tests**

```ts
async function runWithFetchedGames(
  query: GameQuery,
  games: RawChesscomGame[]
): Promise<IngestionResult> {
  const deps = fakeDependencies({
    fetchMonthlyGames: vi.fn().mockResolvedValue(games),
  });
  return runIngestion(query, { deps, now: () => NOW, random: () => 0 });
}

it.each([
  {
    name: 'date',
    query: makeQuery({ dateFrom: '2026-08-12', dateTo: '2026-08-12' }),
    games: [
      makeRawGame({ uuid: 'in-day', end_time: Date.UTC(2026, 7, 12, 23, 59) / 1000 }),
      makeRawGame({ uuid: 'out-day', end_time: Date.UTC(2026, 7, 13) / 1000 }),
    ],
    expected: ['in-day'],
  },
  {
    name: 'time class',
    query: makeQuery({ timeClasses: ['rapid'] }),
    games: [
      makeRawGame({ uuid: 'rapid', time_class: 'rapid' }),
      makeRawGame({ uuid: 'blitz', time_class: 'blitz' }),
    ],
    expected: ['rapid'],
  },
  {
    name: 'colour',
    query: makeQuery({ colors: ['black'] }),
    games: [
      makeRawGame({
        uuid: 'black',
        white: { username: 'opponent', result: 'agreed' },
        black: { username: 'janedoe', result: 'agreed' },
      }),
      makeRawGame({ uuid: 'white' }),
    ],
    expected: ['black'],
  },
  {
    name: 'rated',
    query: makeQuery({ rated: true }),
    games: [makeRawGame({ uuid: 'rated', rated: true }), makeRawGame({ uuid: 'casual', rated: false })],
    expected: ['rated'],
  },
])('applies the $name filter', async ({ query, games, expected }) => {
  const result = await runWithFetchedGames(query, games);
  expect(result.games.map((game) => game.id)).toEqual(expected);
});

it('matches the player case-insensitively and verifies exactly one colour', async () => {
  const mixedCase = makeRawGame({
    uuid: 'mixed-case',
    white: { username: 'JaneDoe', result: 'agreed' },
  });
  const ambiguous = makeRawGame({
    uuid: 'ambiguous',
    white: { username: 'janedoe', result: 'agreed' },
    black: { username: 'JANEDOE', result: 'agreed' },
  });
  const result = await runWithFetchedGames(makeQuery(), [mixedCase, ambiguous]);
  expect(result.games.map((game) => game.id)).toEqual(['mixed-case']);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'AMBIGUOUS_PLAYER_COLOR' })
  );
});

it('deduplicates a stable game ID across fetched months', async () => {
  const fetchMonthlyGames = vi.fn()
    .mockResolvedValueOnce([makeRawGame({ uuid: 'duplicate' })])
    .mockResolvedValueOnce([makeRawGame({ uuid: 'duplicate' })]);
  const deps = fakeDependencies({
    fetchArchives: vi.fn().mockResolvedValue([
      'https://api.chess.com/pub/player/janedoe/games/2026/08',
      'https://api.chess.com/pub/player/janedoe/games/2026/07',
    ]),
    fetchMonthlyGames,
  });
  const result = await runIngestion(makeQuery(), { deps, now: () => NOW });
  expect(result.games.map((game) => game.id)).toEqual(['duplicate']);
  expect(fetchMonthlyGames).toHaveBeenCalledTimes(2);
});

it('stops fetching as soon as maxGames is reached newest first', async () => {
  const fetchMonthlyGames = vi.fn().mockResolvedValue([
    makeRawGame({ uuid: 'newest' }),
    makeRawGame({ uuid: 'second-newest' }),
  ]);
  const deps = fakeDependencies({
    fetchArchives: vi.fn().mockResolvedValue([
      'https://api.chess.com/pub/player/janedoe/games/2026/08',
      'https://api.chess.com/pub/player/janedoe/games/2026/07',
    ]),
    fetchMonthlyGames,
  });
  const result = await runIngestion(makeQuery({ maxGames: 2 }), { deps, now: () => NOW });
  expect(result.games.map((game) => game.id)).toEqual(['newest', 'second-newest']);
  expect(fetchMonthlyGames).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 5: Run filter tests and confirm RED**

Run: `npm.cmd exec vitest run tests/dom/ingestion/ingestionService.test.ts -t "filter|colour|deduplicates|maxGames"`  
Expected: FAIL until normalization and all filters are implemented.

- [ ] **Step 6: Implement normalization, filtering, persistence, and bounded diagnostics**

Normalize a raw game only when exactly one player username equals `query.username`, result tokens are consistent, `rules === 'chess'`, and time class is supported. Date comparison uses seconds from UTC day bounds. Deduplicate with `Set<string>` by stable `id`, preserve newest-first month and response order, cap accepted games at `maxGames`, cap diagnostics at 100, and call `saveSyncBatch` only for successfully fetched months.

```ts
function matchesQuery(game: GameRecord, query: GameQuery): boolean {
  const from = query.dateFrom ? Date.parse(`${query.dateFrom}T00:00:00.000Z`) / 1000 : -Infinity;
  const to = query.dateTo ? Date.parse(`${query.dateTo}T23:59:59.999Z`) / 1000 : Infinity;
  return (
    game.rules === 'chess' &&
    game.endedAt >= from &&
    game.endedAt <= to &&
    query.timeClasses.includes(game.timeClass) &&
    query.colors.includes(game.userColor) &&
    (query.rated === undefined || game.rated === query.rated)
  );
}

function appendDiagnostic(target: Diagnostic[], diagnostic: Diagnostic): void {
  if (target.length < 100) target.push(diagnostic);
}

for (const raw of rawGames) {
  const normalized = normalizeRawGame(raw, query.username);
  if (!normalized.success) {
    appendDiagnostic(diagnostics, normalized.diagnostic);
    counters.excluded += 1;
    continue;
  }
  if (!matchesQuery(normalized.game, query) || seen.has(normalized.game.id)) continue;
  seen.add(normalized.game.id);
  accepted.push(normalized.game);
  if (accepted.length === query.maxGames) break;
}
```

- [ ] **Step 7: Add failing terminal/retry/cancellation tests**

```ts
it('returns partial with accepted data and retryable failed months', async () => {
  const fetchMonthlyGames = vi.fn()
    .mockResolvedValueOnce([makeRawGame({ uuid: 'accepted' })])
    .mockRejectedValue(createPubApiError(
      'UPSTREAM_UNAVAILABLE', 'Upstream temporarily unavailable', true, 503
    ));
  const deps = fakeDependencies({
    fetchArchives: vi.fn().mockResolvedValue([
      'https://api.chess.com/pub/player/janedoe/games/2026/08',
      'https://api.chess.com/pub/player/janedoe/games/2026/07',
    ]),
    fetchMonthlyGames,
  });
  const result = await runIngestion(makeQuery(), {
    deps, now: () => NOW, random: () => 0, wait: async () => undefined,
  });
  expect(result).toMatchObject({
    status: 'partial',
    games: [expect.objectContaining({ id: 'accepted' })],
    failedMonths: [{ month: '2026-07', retryable: true, attempts: 3 }],
  });
});

it('distinguishes empty complete from total failure', async () => {
  await expect(runWithFetchedGames(makeQuery(), [])).resolves.toMatchObject({
    status: 'complete', games: [], failedMonths: [],
  });
  const deps = fakeDependencies({
    fetchArchives: vi.fn().mockRejectedValue(
      createPubApiError('PLAYER_NOT_FOUND', 'Player not found', false, 404)
    ),
  });
  await expect(runIngestion(makeQuery(), { deps, now: () => NOW })).resolves.toMatchObject({
    status: 'failed', games: [],
  });
});

function rejectWhenAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(createAbortError()), { once: true });
  });
}

it('returns one cancelled result during archive fetch and emits no late progress', async () => {
  const controller = new AbortController();
  const progress: IngestionProgress[] = [];
  const deps = fakeDependencies({
    fetchArchives: vi.fn((_username, options) => rejectWhenAborted(options.signal!)),
  });
  const promise = runIngestion(makeQuery(), {
    deps,
    signal: controller.signal,
    now: () => NOW,
    onProgress: (event) => progress.push(event),
  });
  controller.abort();
  await expect(promise).resolves.toMatchObject({ status: 'cancelled' });
  const progressCountAtTerminal = progress.length;
  await Promise.resolve();
  expect(progress).toHaveLength(progressCountAtTerminal);
});

it('cancels during a retry wait without starting another attempt', async () => {
  const controller = new AbortController();
  const fetchArchives = vi.fn().mockRejectedValue(createCorsError());
  const wait = vi.fn((_delay, signal) => rejectWhenAborted(signal));
  const promise = runIngestion(makeQuery(), {
    deps: fakeDependencies({ fetchArchives }),
    signal: controller.signal,
    now: () => NOW,
    wait,
  });
  await vi.waitFor(() => expect(wait).toHaveBeenCalledTimes(1));
  controller.abort();
  await expect(promise).resolves.toMatchObject({ status: 'cancelled' });
  expect(fetchArchives).toHaveBeenCalledTimes(1);
});

it('aborts persistence before its atomic commit', async () => {
  const controller = new AbortController();
  const persistMonth = vi.fn(async (_games, _marker, signal) => {
    controller.abort();
    throwIfAborted(signal);
  });
  const result = await runIngestion(makeQuery(), {
    deps: fakeDependencies({
      fetchMonthlyGames: vi.fn().mockResolvedValue([makeRawGame()]),
      persistMonth,
    }),
    signal: controller.signal,
    now: () => NOW,
  });
  expect(result.status).toBe('cancelled');
  expect(persistMonth).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 8: Run terminal tests and confirm RED**

Run: `npm.cmd exec vitest run tests/dom/ingestion/ingestionService.test.ts -t "partial|empty|failure|cancelled"`  
Expected: FAIL until terminal aggregation and cancellation handling exist.

- [ ] **Step 9: Complete state machine and migrate old orchestrator consumers**

Catch `ABORTED` once at the top-level and return a single cancelled result. Month errors append `FailedMonth`; archive planning failure produces failed unless cached planning can continue. A month storage error retains its in-memory accepted games and marks partial. Remove old orchestrator and its tests after all behavior has equivalent coverage in the new service.

```ts
try {
  return await executeIngestion(validatedQuery, runtime);
} catch (error) {
  if (isPubApiError(error, 'ABORTED') || runtime.signal.aborted) {
    return terminal(runtime, 'cancelled', accepted, failedMonths, diagnostics);
  }
  return terminal(runtime, accepted.length > 0 ? 'partial' : 'failed', accepted, failedMonths, [
    ...diagnostics,
    safeDiagnostic(error),
  ]);
}
```

- [ ] **Step 10: Run the complete ingestion suite**

Run: `npm.cmd exec vitest run tests/unit/ingestion tests/dom/ingestion/ingestionService.test.ts`  
Expected: PASS.

- [ ] **Step 11: Commit**

```powershell
git add features/ingestion lib/ingestion/syncOrchestrator.ts tests/unit/ingestion tests/dom/ingestion
git commit -m "feat(ingestion): implement resilient Phase 1 ingestion service"
```

---

### Task 9: Add Active-Job Supersession and Remove the Legacy Queue

**Files:**
- Modify: `features/ingestion/ingestionService.ts`
- Modify: `features/ingestion/types.ts`
- Modify: `tests/dom/ingestion/ingestionService.test.ts`
- Delete: `lib/ingestion/jobQueue.ts`
- Delete: `tests/dom/ingestion/jobQueue.test.ts`

**Interfaces:**
- Consumes: `runIngestion` from Task 8.
- Produces: `IngestionManager.start(input, options): Promise<IngestionResult>` and `IngestionManager.cancel(): void`.

- [ ] **Step 1: Add failing supersession tests**

```ts
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

it('cancels the previous query and ignores its late progress/result', async () => {
  const oldArchives = deferred<string[]>();
  const fetchArchives = vi.fn()
    .mockImplementationOnce(() => oldArchives.promise)
    .mockResolvedValueOnce([]);
  const deps = fakeDependencies({ fetchArchives });
  const manager = new IngestionManager(deps);
  const oldProgress = vi.fn();
  const currentProgress = vi.fn();
  const old = manager.start(makeQuery({ username: 'old-user' }), { onProgress: oldProgress });
  await vi.waitFor(() => expect(fetchArchives).toHaveBeenCalledTimes(1));
  const oldProgressCountAtSupersession = oldProgress.mock.calls.length;
  const current = manager.start(makeQuery({ username: 'new-user' }), {
    onProgress: currentProgress,
  });
  oldArchives.resolve([]);

  await expect(old).resolves.toMatchObject({ status: 'cancelled' });
  await expect(current).resolves.toMatchObject({ status: 'complete' });
  expect(oldProgress).toHaveBeenCalledTimes(oldProgressCountAtSupersession);
  expect(currentProgress).toHaveBeenCalled();
});

it('uses cryptographically random job IDs when crypto.randomUUID is available', async () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  await expect(manager.start(makeQuery())).resolves.toMatchObject({
    jobId: '00000000-0000-4000-8000-000000000001',
  });
});
```

- [ ] **Step 2: Run supersession tests and confirm RED**

Run: `npm.cmd exec vitest run tests/dom/ingestion/ingestionService.test.ts -t "previous query|job IDs"`  
Expected: FAIL because manager/relevance tokens do not exist.

- [ ] **Step 3: Implement active manager and remove legacy queue**

```ts
export class IngestionManager {
  private active: { token: symbol; controller: AbortController } | null = null;

  constructor(private readonly deps: IngestionDependencies) {}

  async start(input: unknown, options: StartOptions = {}): Promise<IngestionResult> {
    this.active?.controller.abort();
    const token = Symbol('ingestion-job');
    const controller = new AbortController();
    this.active = { token, controller };
    return runIngestion(input, {
      ...options,
      deps: this.deps,
      jobId: createJobId(),
      signal: controller.signal,
      onProgress: (progress) => {
        if (this.active?.token === token) options.onProgress?.(progress);
      },
    });
  }

  cancel(): void {
    this.active?.controller.abort();
  }
}

export function createJobId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
```

Generate a UUID with `crypto.randomUUID()` where available and a `crypto.getRandomValues` UUID fallback otherwise. Delete the username-deduplicating legacy queue because distinct validated queries for one username must supersede, not share, work.

- [ ] **Step 4: Run ingestion tests**

Run: `npm.cmd exec vitest run tests/unit/ingestion tests/dom/ingestion`  
Expected: PASS with no legacy queue imports.

- [ ] **Step 5: Commit**

```powershell
git add features/ingestion tests/dom/ingestion lib/ingestion/jobQueue.ts
git commit -m "feat(ingestion): supersede stale browser ingestion jobs"
```

---

### Task 10: Add Deterministic Production Browser Evidence

**Files:**
- Modify: `tests/e2e/csp.spec.ts`
- Modify: `tests/e2e/server-headers.spec.ts`
- Modify: `tests/e2e/smoke.spec.ts`
- Create: `tests/e2e/indexeddb-persistence.spec.ts`
- Create: `tests/e2e/ingestion-fixtures.spec.ts`
- Create: `app/phase-1-test-harness/page.tsx`
- Create: `components/Phase1TestHarness.tsx`
- Modify: `playwright.config.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: production Next.js shell, IndexedDB repositories, `IngestionManager`.
- Produces: deterministic browser proof for headers/CSP/isolation, reload persistence/deletion, and all ingestion terminal states.

- [ ] **Step 1: Replace the live CSP check and add failing browser journeys**

Use Playwright routing so the approved request is deterministic:

```ts
await page.route('https://api.chess.com/**', async (route) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ archives: [] }),
  });
});
```

Persistence assertion:

```ts
test('persists one PGN across reload and deletes it with confirmation', async ({ page }) => {
  await page.goto('/phase-1-test-harness');
  await page.getByRole('button', { name: 'Seed local game' }).click();
  await expect(page.getByTestId('stored-game-count')).toHaveText('1');
  await page.reload();
  await expect(page.getByTestId('stored-game-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Delete local user data' }).click();
  await expect(page.getByTestId('deletion-result')).toContainText('1 game');
});
```

Parameterize fixture ingestion modes `complete`, `partial`, `cancelled`, `empty`, `offline-cache-only`, and `failed`, asserting the exact visible terminal status and no console/page errors.

- [ ] **Step 2: Run Playwright and confirm RED**

Run: `npm.cmd run test:e2e`  
Expected: FAIL because the test harness and deterministic journeys do not exist; existing CSP test may attempt a live request.

- [ ] **Step 3: Implement a production-only-safe test harness**

`Phase1TestHarness` exposes semantic buttons/status outputs and imports the real repositories/manager. It selects fixture dependencies solely from a fixed query parameter enum; it never accepts arbitrary URLs or fetches from a server route. Add `<meta name="robots" content="noindex,nofollow" />` for the harness route. Use a fixed `PLAYWRIGHT_BASE_URL` override in config while retaining local `next build && next start` defaults.

```tsx
'use client';

type FixtureMode =
  | 'complete'
  | 'partial'
  | 'cancelled'
  | 'empty'
  | 'offline-cache-only'
  | 'failed';

const FIXTURE_MODES = new Set<FixtureMode>([
  'complete', 'partial', 'cancelled', 'empty', 'offline-cache-only', 'failed',
]);

export function Phase1TestHarness() {
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [storedCount, setStoredCount] = useState(0);
  const [status, setStatus] = useState<IngestionTerminalStatus | 'idle'>('idle');
  const [deletionText, setDeletionText] = useState('');

  useEffect(() => {
    let opened: IDBDatabase | null = null;
    void openDatabase().then(async (openedDb) => {
      opened = openedDb;
      setDb(openedDb);
      setStoredCount((await getGamesForUser(openedDb, 'fixture-user')).length);
    });
    return () => opened?.close();
  }, []);

  async function seed(): Promise<void> {
    if (!db) return;
    await upsertGames(db, [makeHarnessGame()]);
    setStoredCount((await getGamesForUser(db, 'fixture-user')).length);
  }

  async function remove(): Promise<void> {
    if (!db) return;
    const result = await deleteUserData(db, 'fixture-user');
    setStoredCount(0);
    setDeletionText(`${result.gamesDeleted} game deleted`);
  }

  async function run(mode: FixtureMode): Promise<void> {
    if (!db || !FIXTURE_MODES.has(mode)) return;
    const manager = new IngestionManager(createHarnessDependencies(db, mode));
    if (mode === 'cancelled') queueMicrotask(() => manager.cancel());
    const result = await manager.start(makeHarnessQuery());
    setStatus(result.status);
  }

  return (
    <main>
      <h1>Phase 1 Test Harness</h1>
      <output data-testid="stored-game-count">{storedCount}</output>
      <output data-testid="ingestion-status">{status}</output>
      <output data-testid="deletion-result">{deletionText}</output>
      <button onClick={() => void seed()}>Seed local game</button>
      <button onClick={() => void remove()}>Delete local user data</button>
      {[...FIXTURE_MODES].map((mode) => (
        <button key={mode} onClick={() => void run(mode)}>{`Run ${mode}`}</button>
      ))}
    </main>
  );
}
```

Define `makeHarnessGame`, `makeHarnessQuery`, and `createHarnessDependencies(db, mode)` in the same file as fixed functions with no external input. Each dependency function binds the real database repository operations; only `fetchArchives`/`fetchMonthlyGames` vary by the six enumerated fixture modes. Exclude this fixed browser-only test component from unit coverage with `coverage.exclude`, because its behavior is covered by Playwright and it is not application domain code.

- [ ] **Step 4: Run Playwright production tests**

Run: `npm.cmd run test:e2e`  
Expected: all Chromium tests PASS against `next start`, with no live Chess.com request.

- [ ] **Step 5: Commit**

```powershell
git add app/phase-1-test-harness components/Phase1TestHarness.tsx tests/e2e playwright.config.ts
git commit -m "test(e2e): prove Phase 1 browser persistence and terminal states"
```

---

### Task 11: Raise Coverage and Complete Requirement-by-Requirement Verification

**Files:**
- Modify: tests identified by uncovered domain branches.
- Create: `docs/verification/phase-1-local-verification.md`
- Modify: `.superpowers/sdd/phase-1-direct-ingestion-persistence/progress.md`

**Interfaces:**
- Consumes: all prior tasks and the authoritative Phase 1 plan.
- Produces: passing fresh gates and an evidence matrix for every Phase 1 requirement/exit criterion.

- [ ] **Step 1: Run coverage and capture only genuine gaps**

Run: `npm.cmd run test:coverage`  
Expected: either PASS at thresholds or FAIL listing uncovered branches. For each uncovered domain branch, add a behavior test that names the production behavior that would make it fail; do not exclude domain files to make the number green.

- [ ] **Step 2: Run the full fresh local gate**

Run in order:

```powershell
npm.cmd ci
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:coverage
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit --audit-level=high
```

Expected: every command exits 0; Vitest includes all unit/DOM/setup/API suites, coverage meets enforced thresholds, and Playwright reports all production-browser journeys passing.

- [ ] **Step 3: Audit architecture/security searches**

Run:

```powershell
rg -n "app/api|pages/api|User-Agent|If-None-Match|If-Modified-Since|X-Application-Contact|unsafe-eval|rawMonthly|response\.text\(\).*message" app components features lib next.config.ts
rg -n "fetch\(" app components features lib tests/e2e
rg -n "ChessGameReviewerDB|syncOrchestrator|jobQueue" app components features lib tests
git diff --check HEAD~10..HEAD
```

Expected: no server PubAPI proxy, disallowed header, general unsafe eval, raw monthly persistence, legacy database/orchestrator/queue reference, or unexpected network boundary. Every remaining `fetch` is either the PubAPI client or a deliberate browser-test CSP probe.

- [ ] **Step 4: Write the evidence matrix**

Create `docs/verification/phase-1-local-verification.md` with a row for every Task 1.1–1.5 requirement and Phase 1 exit-gate item:

```markdown
| Requirement | Evidence | Status |
| --- | --- | --- |
| Direct approved PubAPI URLs, omitted credentials, timeout, streamed size cap | `tests/api/chesscomClient.test.ts`; fresh Vitest output | Proven locally |
| Preview deployed revision and controlled live CORS | Requires exact preview URL/revision | External verification pending |
```

Only deployed-preview/MCP and controlled-live checks may remain external; do not label them locally proven.

- [ ] **Step 5: Re-read the authoritative documents and correct any mismatch**

Read completely:

```powershell
Get-Content -Raw 'docs/superpowers/specs/2026-08-11-chesscom-game-analyzer-design.md'
Get-Content -Raw 'docs/superpowers/plans/phase-1-direct-ingestion-persistence.md'
Get-Content -Raw 'docs/superpowers/specs/2026-08-12-phase-1-audit-repair-design.md'
```

For each explicit requirement, point to current source plus a current test/browser/command result. If evidence is absent or indirect, add the missing test/fix and repeat Steps 1–5.

- [ ] **Step 6: Record final local verification and commit**

Update the progress ledger to retract the premature completion marker and record the exact verified revision/commands plus external-only concerns.

```powershell
git add tests docs/verification .superpowers/sdd/phase-1-direct-ingestion-persistence/progress.md
git commit -m "docs: record independent Phase 1 verification"
```

- [ ] **Step 7: Final clean-tree verification**

Run:

```powershell
git status --short
git log -8 --oneline
```

Expected: empty status and a reviewable sequence of focused repair commits.

---

## Plan Self-Review

- Task 1 covers supported/pinned tooling, strict/static gates, worker strategy, security headers, deterministic CI, and coverage enforcement.
- Task 2 covers every `GameQuery` field, trust-boundary narrowing, stable diagnostics, strict schemas, and the named oversized fixture.
- Task 3 covers the two allowed direct-browser URLs, request options, redirects, typed failures, timeout/size limits, serialization, abortable Web Locks, retry metadata, and redaction.
- Tasks 4–5 cover the canonical versioned IndexedDB schema, migration/recovery, atomic writes, cache metadata, corrupt records, quota preservation, deletion, and LRU retention.
- Tasks 6–9 cover fingerprinting, UTC archive planning, application freshness, manual/offline behavior, retries, all filters, deduplication, `maxGames`, progress, bounded diagnostics, partial/empty/failed/cancelled terminals, and stale-job supersession.
- Task 10 covers production-server headers/CSP/isolation, real-browser reload persistence/deletion, and all fixture-driven ingestion terminal journeys without pull-request live traffic.
- Task 11 covers clean-install verification, complete local gates, architecture/security searches, and the final requirement-by-requirement evidence audit.
- The only non-local evidence is the externally deployed preview/MCP journey and controlled live PubAPI CORS check; Task 11 records these accurately instead of treating them as locally proven.
- Incomplete-instruction scan and cross-task signature review completed on 2026-08-12; all named public interfaces are defined before use.
