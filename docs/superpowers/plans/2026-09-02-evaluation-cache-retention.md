# Evaluation Cache Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep persisted engine evaluations at or below 1000 true-LRU records, recover once from quota pressure, and visibly report non-fatal cache degradation without failing analysis.

**Architecture:** Move retention into a serialized IndexedDB evaluation repository, refresh access timestamps on hits, and let `EvaluationCache` collect sanitized warnings for `GameAnalysisResult`. Initialize explicit schema/normalizer metadata once per opened database and convert incompatible newer schemas into a recoverable local-storage diagnostic.

**Tech Stack:** TypeScript, IndexedDB, Stockfish analysis service, React, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-02-logic-functionality-audit-remediation-implementation-spec.md`

## Global Constraints

- Use test-driven development.
- Keep at most 1000 persisted evaluation records after a successful write.
- Refresh `lastUsedAt` on a valid cache hit.
- Retry a quota-failed insert exactly once after eviction to 900 records.
- Cache failures must not invalidate a successfully computed engine analysis.
- Never expose raw IndexedDB exception details in the UI.
- Do not add graph snapshot persistence in this plan.

---

## File structure

- Modify `lib/db/repositories.ts`: add atomic evaluation touch and retained-write helpers.
- Modify `lib/db/retention.ts`: support deterministic high-/low-watermark eviction.
- Modify `features/stockfish-analysis/evaluationCache.ts`: serialize writes and collect warnings.
- Modify `features/stockfish-analysis/analyzeGame.ts`: include cache warnings in every terminal result.
- Modify `features/workspace/browserServices.ts`: construct the retention-aware repository and initialize database metadata.
- Modify `lib/db/openDatabase.ts`: expose a typed database initialization/compatibility path.
- Create `lib/db/errors.ts`: own `StorageUnavailableError`, `QuotaExceededError`, `DatabaseBlockedError`, and `SchemaVersionError`; import them from database and ingestion layers without a cycle.
- Modify `features/ingestion/ingestionService.ts`: map typed local-storage errors to safe actionable diagnostics.
- Modify `components/analysis/AnalyzerWorkspace.tsx`: render analysis persistence warnings.
- Test database repository/retention/migration, evaluation cache, analysis, ingestion diagnostics, and analyzer components.

### Task 1: Implement true-LRU repository primitives

**Files:**

- Modify: `lib/db/repositories.ts`
- Modify: `lib/db/retention.ts`
- Test: `tests/dom/db/repositories.test.ts`
- Test: `tests/dom/db/retention.test.ts`

**Interfaces:**

- Consumes: `EvaluationRecord`, evaluations store, and `lastUsedAt` index.
- Produces: `touchEvaluation(db, key, lastUsedAt)`, `countEvaluations(db)`, `putEvaluationWithRetention(db, record, maxCount)`, and deterministic `evictEvaluations(db, { maxCount })` behavior.

- [ ] **Step 1: Add failing touch tests**

```ts
await putEvaluation(db, { ...record, lastUsedAt: 1 });
await touchEvaluation(db, record.key, 20);
expect(await getEvaluation(db, record.key)).toMatchObject({ lastUsedAt: 20 });
await expect(touchEvaluation(db, 'missing', 30)).resolves.toBe(false);
```

Return `true` only when a record was updated. Reject non-finite timestamps before opening a transaction.

- [ ] **Step 2: Add failing eviction boundary tests**

Insert records with distinct timestamps, evict to 999 and 900, and assert the oldest timestamps are removed while exactly the target count remains. Include `maxCount: 0`, an empty store, and invalid negative/non-integer limits.

Add a retained-write concurrency test that launches more than one `putEvaluationWithRetention` call without awaiting between them and asserts the final count is exactly 1000. IndexedDB must serialize the read/write transactions; an in-memory JavaScript queue is insufficient because another tab can write concurrently.

- [ ] **Step 3: Run repository and retention tests and verify failures**

Run: `npx vitest run --project dom tests/dom/db/repositories.test.ts tests/dom/db/retention.test.ts`

Expected: FAIL because touch/count helpers and strict limit validation are missing.

- [ ] **Step 4: Implement atomic touch and count helpers**

```ts
export async function touchEvaluation(
  db: IDBDatabase,
  key: string,
  lastUsedAt: number
): Promise<boolean> {
  if (!Number.isFinite(lastUsedAt)) throw new TypeError('lastUsedAt must be finite.');
  const tx = db.transaction([STORES.EVALUATIONS], 'readwrite');
  const store = tx.objectStore(STORES.EVALUATIONS);
  const existing = await reqToPromise(store.get(key));
  const found = Boolean(existing);
  if (existing) store.put({ ...existing, lastUsedAt });
  await transactionDone(tx);
  return found;
}
```

Add private `transactionDone(tx): Promise<void>` beside `reqToPromise`, using the repository's existing transaction error wrappers. Ensure the no-record branch still awaits transaction completion.

- [ ] **Step 5: Harden eviction input and completion**

Reject `maxCount` unless it is a non-negative integer. Preserve ascending `lastUsedAt` eviction and resolve only from `tx.oncomplete`, never from the count request callback. Implement `putEvaluationWithRetention` as one `readwrite` transaction over the evaluations store: read the key, count records, delete the oldest `count - maxCount + 1` records only for a new key at capacity, then put the new record before allowing the transaction to complete. Because IndexedDB serializes overlapping read/write transactions on the store, the cap holds across cache instances and browser tabs.

- [ ] **Step 6: Run focused database tests until they pass**

Run: `npx vitest run --project dom tests/dom/db/repositories.test.ts tests/dom/db/retention.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit repository primitives**

```powershell
git add lib/db/repositories.ts lib/db/retention.ts tests/dom/db/repositories.test.ts tests/dom/db/retention.test.ts
git commit -m "feat(cache): add evaluation LRU primitives"
```

### Task 2: Enforce retention and quota recovery in `EvaluationCache`

**Files:**

- Modify: `features/stockfish-analysis/evaluationCache.ts`
- Modify: `features/workspace/browserServices.ts`
- Test: `tests/unit/stockfish-analysis/evaluationCache.test.ts`
- Test: `tests/dom/db/retention.test.ts`

**Interfaces:**

- Consumes: Task 1's touch/count/evict primitives and existing `QuotaExceededError`.
- Produces: `AnalysisWarning`, warning-aware `EvaluationCache`, and a serialized repository writer.

- [ ] **Step 1: Define warning types and add failing cache tests**

```ts
export interface AnalysisWarning {
  code:
    | 'EVALUATION_CACHE_READ_FAILED'
    | 'EVALUATION_CACHE_WRITE_FAILED'
    | 'EVALUATION_CACHE_QUOTA';
  message: string;
}
```

Test read failure returns `null`, write failure does not throw, and `cache.warnings()` returns one deduplicated safe warning per code.

- [ ] **Step 2: Add failing LRU and quota tests**

Assert a valid hit calls `touch(key, now)`. For a new key at capacity, assert eviction to 999 occurs before put. Make the first put throw `QuotaExceededError`; assert eviction to 900 and exactly one retry. Make the retry fail and assert no third put plus one quota warning.

- [ ] **Step 3: Run cache tests and verify current exception behavior fails**

Run: `npx vitest run --project unit tests/unit/stockfish-analysis/evaluationCache.test.ts`

Expected: FAIL because repository failures currently escape or are swallowed outside the cache and no retention contract exists.

- [ ] **Step 4: Extend the repository interface**

```ts
export interface EvaluationCacheRepository {
  get(key: string): Promise<EvaluationRecord | null>;
  touch(key: string, lastUsedAt: number): Promise<boolean>;
  putWithRetention(record: EvaluationRecord, maxCount: number): Promise<void>;
  recoverQuota(): Promise<void>;
}
```

The browser implementation delegates `putWithRetention` to Task 1's single-transaction helper. `recoverQuota` evicts to 900 in its own transaction. Do not add an in-memory queue as the correctness mechanism.

- [ ] **Step 5: Implement warning collection and one retry**

```ts
async put(key: EvaluationKey, evaluation: EvaluationResult): Promise<void> {
  const record: EvaluationRecord = {
    key: serializeEvaluationKey(key),
    positionHash: key.fen,
    engineBuild: key.engineBuild,
    lastUsedAt: this.now(),
    evaluation,
  };
  try {
    await this.repository.putWithRetention(record, 1000);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      try {
        await this.repository.recoverQuota();
        await this.repository.putWithRetention(record, 1000);
        return;
      } catch {
        this.warn('EVALUATION_CACHE_QUOTA', CACHE_QUOTA_MESSAGE);
        return;
      }
    }
    this.warn('EVALUATION_CACHE_WRITE_FAILED', CACHE_WRITE_MESSAGE);
  }
}
```

Catch read/touch failures inside `get`, return usable cached data if only touch fails, and expose `warnings(): readonly AnalysisWarning[]` as an immutable copy.

- [ ] **Step 6: Run cache and retention tests until they pass**

Run: `npx vitest run tests/unit/stockfish-analysis/evaluationCache.test.ts tests/dom/db/retention.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit retention-aware cache**

```powershell
git add features/stockfish-analysis/evaluationCache.ts features/workspace/browserServices.ts tests/unit/stockfish-analysis/evaluationCache.test.ts tests/dom/db/retention.test.ts
git commit -m "fix(cache): bound evaluation persistence"
```

### Task 3: Propagate non-fatal cache warnings to analysis UI

**Files:**

- Modify: `features/stockfish-analysis/analyzeGame.ts`
- Modify: `components/analysis/AnalyzerWorkspace.tsx`
- Test: `tests/unit/stockfish-analysis/analyzeGame.test.ts`
- Test: `tests/dom/components/AnalyzerWorkspace.test.tsx`

**Interfaces:**

- Consumes: Task 2's `EvaluationCache.warnings()` and `AnalysisWarning`.
- Produces: required `warnings: readonly AnalysisWarning[]` on `GameAnalysisResult` and an accessible UI notice.

- [ ] **Step 1: Add failing result tests for read, write, quota, partial, and cancelled analysis**

```ts
expect(result).toMatchObject({
  status: 'complete',
  warnings: [expect.objectContaining({ code: 'EVALUATION_CACHE_WRITE_FAILED' })],
});
```

Assert warning messages contain no injected repository exception text or FEN/PGN content.

- [ ] **Step 2: Run analysis tests and verify warnings are absent**

Run: `npx vitest run --project unit tests/unit/stockfish-analysis/analyzeGame.test.ts`

Expected: FAIL.

- [ ] **Step 3: Include warnings in every result constructor**

```ts
function result(
  status: GameAnalysisStatus,
  annotations: readonly GameAnnotation[],
  totalPlies: number,
  warnings: readonly AnalysisWarning[]
): Omit<GameAnalysisResult, 'error'> {
  return { status, annotations, analyzedPlies: annotations.length, totalPlies, summary: summarize(annotations), warnings };
}
```

Call `input.cache.warnings()` at each terminal return so cancellation and partial results preserve warnings already observed.

- [ ] **Step 4: Add failing analyzer component test**

Render a complete analysis with a cache warning and assert a `role="status"` message explains that analysis succeeded but may not resume from local cache.

- [ ] **Step 5: Render one deduplicated persistence warning region**

```tsx
{result?.warnings.length ? (
  <p className="analysis-cache-warning" role="status">
    Analysis completed, but some results could not be saved locally. A resumed review may need to analyse them again.
  </p>
) : null}
```

Do not display internal codes or exception messages to the user.

- [ ] **Step 6: Update typed fixtures and run analysis/component tests**

Add `warnings: []` to every direct `GameAnalysisResult` fixture. Run: `npx vitest run tests/unit/stockfish-analysis/analyzeGame.test.ts tests/unit/stockfish-analysis/engineService.test.ts tests/dom/components/AnalyzerWorkspace.test.tsx tests/dom/workspace/workspaceController.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit warning propagation**

```powershell
git add features/stockfish-analysis/analyzeGame.ts components/analysis/AnalyzerWorkspace.tsx tests/unit/stockfish-analysis/analyzeGame.test.ts tests/unit/stockfish-analysis/engineService.test.ts tests/dom/components/AnalyzerWorkspace.test.tsx tests/dom/workspace/workspaceController.test.ts
git commit -m "feat(analysis): report cache persistence warnings"
```

### Task 4: Initialize and diagnose database compatibility

**Files:**

- Modify: `lib/db/openDatabase.ts`
- Modify: `lib/db/retention.ts`
- Modify: `lib/db/repositories.ts`
- Modify: `features/workspace/browserServices.ts`
- Modify: `features/ingestion/ingestionService.ts`
- Test: `tests/dom/db/openDatabase.test.ts`
- Test: `tests/dom/db/retention.test.ts`
- Test: `tests/dom/ingestion/ingestionService.test.ts`

**Interfaces:**

- Consumes: current schema/normalizer constants and metadata repository.
- Produces: `initializeDatabaseMetadata(db)` and safe `LOCAL_STORAGE_INCOMPATIBLE` ingestion diagnostic.

- [ ] **Step 1: Add failing compatibility tests**

Test absent metadata, exact current metadata, older normalizer metadata, and newer schema metadata. Expected rules:

```ts
expect(await checkSchemaCompatibility(dbWithOlderNormalizer)).toMatchObject({
  compatible: true,
  normalizerMatches: false,
});
expect(await checkSchemaCompatibility(dbWithNewerSchema)).toMatchObject({
  compatible: false,
});
```

- [ ] **Step 2: Add failing initialization tests**

Call `initializeDatabaseMetadata` and assert `schemaVersion` and `normalizerVersion` metadata equal current constants. A newer stored schema must throw `SchemaVersionError` without overwriting metadata.

- [ ] **Step 3: Run database tests and verify current normalizer behavior fails**

Run: `npx vitest run --project dom tests/dom/db/openDatabase.test.ts tests/dom/db/retention.test.ts`

Expected: FAIL because normalizer mismatch is currently treated as incompatible and production does not initialize metadata.

- [ ] **Step 4: Implement compatibility initialization**

Treat only a stored schema newer than `SCHEMA_VERSION` as incompatible. Report normalizer equality separately; sync records continue to drive refetch. After a compatible check, write current schema and normalizer metadata using repository helpers.

- [ ] **Step 5: Call initialization once per opened database**

```ts
databasePromise ??= openDatabase().then(async (opened) => {
  await initializeDatabaseMetadata(opened);
  database = opened;
  return opened;
});
```

If initialization fails, close the database, clear `databasePromise`, and rethrow the typed error so a later user retry can reopen cleanly.

- [ ] **Step 6: Add safe local-storage diagnostics**

Map `SchemaVersionError`, `StorageUnavailableError`, and `QuotaExceededError` to fixed user-facing diagnostic codes/messages. Do not include the underlying database name, record key, or browser exception text.

- [ ] **Step 7: Run database and ingestion diagnostic tests**

Run: `npx vitest run tests/dom/db/openDatabase.test.ts tests/dom/db/retention.test.ts tests/dom/ingestion/ingestionService.test.ts tests/dom/components/IngestionFeedback.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit compatibility initialization**

```powershell
git add lib/db/openDatabase.ts lib/db/retention.ts lib/db/repositories.ts features/workspace/browserServices.ts features/ingestion/ingestionService.ts tests/dom/db/openDatabase.test.ts tests/dom/db/retention.test.ts tests/dom/ingestion/ingestionService.test.ts tests/dom/components/IngestionFeedback.test.tsx
git commit -m "fix(storage): initialize and report compatibility"
```

### Task 5: Verify cache and storage behavior

**Files:**

- Verify only: Tasks 1 through 4.

**Interfaces:**

- Consumes: completed retention and warning implementation.
- Produces: storage correctness evidence.

- [ ] **Step 1: Run all database and analysis suites**

Run: `npx vitest run tests/dom/db tests/unit/stockfish-analysis tests/dom/components/AnalyzerWorkspace.test.tsx tests/dom/workspace/workspaceController.test.ts`

Expected: PASS.

- [ ] **Step 2: Run coverage and static checks**

Run: `npm run test:coverage && npm run lint && npm run typecheck && git diff --check`

Expected: all commands exit 0 and repository/cache branches meet configured coverage thresholds.

- [ ] **Step 3: Review persistence invariants**

Confirm tests prove the 1000-record post-write cap under concurrent calls, true access-time eviction, one quota retry, successful live analysis despite cache failure, safe visible warnings, and non-destructive normalizer mismatch handling.
