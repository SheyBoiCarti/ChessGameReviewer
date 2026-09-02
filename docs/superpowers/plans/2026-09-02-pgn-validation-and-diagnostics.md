# PGN Validation and Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure only legally parseable games count toward `maxGames` or persistence, while all bounded parse exclusions remain visible through ingestion and defensive graph results.

**Architecture:** Add a dedicated job slot in the existing analysis-data worker for PGN validation and expose it through a separate browser client. Ingestion validates each normalized month before commit and acceptance; graph parsing remains defensive and reports any unexpected later exclusion as a partial result.

**Tech Stack:** TypeScript, chess.js, Web Workers, IndexedDB, Vitest, React.

**Spec:** `docs/superpowers/specs/2026-09-02-logic-functionality-audit-remediation-implementation-spec.md`

## Global Constraints

- Use test-driven development: add a failing regression test before changing production behavior.
- Preserve the current `GameQuery.maxGames` range of 1 through 5000.
- Never parse PGNs or build opening graphs on the UI thread.
- Keep diagnostics bounded to 100 detailed entries and 20 distinct codes at every worker/UI boundary.
- Preserve newest-month-first archive traversal and stable cross-month deduplication.
- Do not persist invalid PGNs or duplicate raw monthly payloads.
- Do not add a new runtime dependency.
- Increment `NORMALIZER_VERSION` from 4 to 5, or to the next monotonic integer if it is already above 4.

---

## File structure

- Modify `workers/protocol.ts`: define validation messages and validate them at the worker boundary.
- Modify `workers/analysis-data.worker.ts`: validate PGNs, bound diagnostics, and emit one terminal response.
- Create `features/ingestion/pgnValidationWorkerClient.ts`: own one validation worker and one active validation job.
- Modify `features/ingestion/types.ts`: define `PgnValidationResult` and add `validatePgns`.
- Modify `features/ingestion/ingestionService.ts`: validate before persistence and acceptance.
- Modify `features/workspace/browserServices.ts`: build and dispose the validation client.
- Modify `features/workspace/createWorkspaceController.ts`: dispose ingestion-owned worker resources.
- Modify `lib/db/schema.ts`: invalidate pre-validation sync markers.
- Modify `features/opening-tree/graphWorkerClient.ts`, `features/workspace/types.ts`, `features/workspace/reducer.ts`, and `components/tree/OpeningTreeTable.tsx`: propagate defensive exclusions.
- Test `tests/unit/workers/protocol.test.ts`, `tests/unit/workers/analysisDataWorker.test.ts`, `tests/unit/workers/pgnValidationWorkerClient.test.ts`, `tests/dom/ingestion/ingestionService.test.ts`, `tests/dom/workspace/workspaceController.test.ts`, and `tests/dom/components/OpeningTreeTable.test.tsx`.

### Task 1: Add the PGN-validation worker protocol

**Files:**

- Modify: `workers/protocol.ts`
- Modify: `workers/analysis-data.worker.ts`
- Test: `tests/unit/workers/protocol.test.ts`
- Test: `tests/unit/workers/analysisDataWorker.test.ts`

**Interfaces:**

- Consumes: existing `NormalizedGameSummary`, `Diagnostic`, `parseGamePgn`, and `PROTOCOL_VERSION`.
- Produces: `VALIDATE_PGNS` request and `PGN_VALIDATION_COMPLETE` response with `validGameIds`, `diagnostics`, `totalInvalid`, and `diagnosticCodes`.

- [ ] **Step 1: Write protocol guard tests for valid and malformed validation jobs**

```ts
expect(
  isWorkerRequest({
    protocolVersion: PROTOCOL_VERSION,
    jobId: 'validate-1',
    type: 'VALIDATE_PGNS',
    games: [game()],
  })
).toBe(true);

expect(
  isWorkerRequest({
    protocolVersion: PROTOCOL_VERSION,
    jobId: 'validate-2',
    type: 'VALIDATE_PGNS',
    games: 'not-an-array',
  })
).toBe(false);
```

- [ ] **Step 2: Run the protocol test and verify it fails because the new message does not exist**

Run: `npx vitest run --project unit tests/unit/workers/protocol.test.ts`

Expected: FAIL on the `VALIDATE_PGNS` expectation.

- [ ] **Step 3: Define the exact protocol variants**

```ts
type PgnValidationRequest = {
  protocolVersion: typeof PROTOCOL_VERSION;
  jobId: string;
  type: 'VALIDATE_PGNS';
  games: readonly NormalizedGameSummary[];
};

type PgnValidationCompleteResponse = {
  protocolVersion: typeof PROTOCOL_VERSION;
  jobId: string;
  type: 'PGN_VALIDATION_COMPLETE';
  validGameIds: readonly string[];
  diagnostics: readonly Diagnostic[];
  totalInvalid: number;
  diagnosticCodes: readonly string[];
};
```

Add `PgnValidationRequest` to `WorkerRequest` and `PgnValidationCompleteResponse` to `WorkerResponse`. Update `isWorkerRequest` so validation games pass the same `isNormalizedGameSummary` guard as graph games.

- [ ] **Step 4: Add worker behavior tests for valid, empty, illegal, bounded, and cancelled input**

```ts
expect(responses.at(-1)).toMatchObject({
  type: 'PGN_VALIDATION_COMPLETE',
  validGameIds: ['valid'],
  totalInvalid: 2,
  diagnosticCodes: ['MISSING_PGN', 'ILLEGAL_PGN'],
});
expect((responses.at(-1) as { diagnostics: unknown[] }).diagnostics).toHaveLength(2);
```

Generate more than 100 invalid games and assert `totalInvalid` retains the full count while `diagnostics.length === 100` and `diagnosticCodes.length <= 20`. Reuse the existing cancellation test pattern and assert the terminal sequence ends in `CANCELLED`, never validation complete.

- [ ] **Step 5: Run the worker test and verify the new behavior fails**

Run: `npx vitest run --project unit tests/unit/workers/analysisDataWorker.test.ts`

Expected: FAIL because `handleRequest` does not route validation jobs.

- [ ] **Step 6: Implement validation inside the worker**

```ts
async function validateGamesInWorker(
  games: readonly NormalizedGameSummary[],
  jobId: string
): Promise<PgnValidationResult | undefined> {
  const validGameIds: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const diagnosticCodes: string[] = [];
  let totalInvalid = 0;

  for (let index = 0; index < games.length; index += 1) {
    if (cancelledJobs.has(jobId)) return undefined;
    const parsed = parseGamePgn({ game: games[index]! });
    if (parsed.ok) validGameIds.push(parsed.game.id);
    else {
      totalInvalid += 1;
      appendBoundedDiagnostics(diagnostics, diagnosticCodes, parsed.errors);
    }
    if ((index + 1) % PARSE_YIELD_EVERY_GAMES === 0) await yieldToWorkerLoop();
  }
  return { validGameIds, diagnostics, totalInvalid, diagnosticCodes };
}
```

Route `VALIDATE_PGNS` before graph-building logic and reuse one helper for the existing diagnostic bounds.

- [ ] **Step 7: Run protocol and worker tests until they pass**

Run: `npx vitest run --project unit tests/unit/workers/protocol.test.ts tests/unit/workers/analysisDataWorker.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the protocol deliverable**

```powershell
git add workers/protocol.ts workers/analysis-data.worker.ts tests/unit/workers/protocol.test.ts tests/unit/workers/analysisDataWorker.test.ts
git commit -m "feat(ingestion): validate PGNs in worker"
```

### Task 2: Add an abort-safe validation worker client

**Files:**

- Create: `features/ingestion/pgnValidationWorkerClient.ts`
- Create: `tests/unit/workers/pgnValidationWorkerClient.test.ts`
- Modify: `features/ingestion/types.ts`

**Interfaces:**

- Consumes: Task 1's `VALIDATE_PGNS`, `PGN_VALIDATION_COMPLETE`, `CANCEL_JOB`, and `WorkerResponse`.
- Produces: `PgnValidationResult` and class methods `validate(games, signal)`, `cancel()`, and `dispose()`.

- [ ] **Step 1: Define the shared result and dependency signature**

```ts
export interface PgnValidationResult {
  validGameIds: readonly string[];
  diagnostics: readonly Diagnostic[];
  totalInvalid: number;
  diagnosticCodes: readonly string[];
}

validatePgns(
  games: readonly GameRecord[],
  options: { signal: AbortSignal }
): Promise<PgnValidationResult>;
```

- [ ] **Step 2: Write client tests for completion, supersession, caller abort, stale responses, worker errors, and disposal**

```ts
const promise = client.validate([game], signal);
worker.emitMessage({
  protocolVersion: PROTOCOL_VERSION,
  jobId: worker.lastMessage.jobId,
  type: 'PGN_VALIDATION_COMPLETE',
  validGameIds: [game.id],
  diagnostics: [],
  totalInvalid: 0,
  diagnosticCodes: [],
});
await expect(promise).resolves.toMatchObject({ validGameIds: [game.id] });
```

Assert an abort posts `CANCEL_JOB`, rejects with an `AbortError`, removes the abort listener, and ignores any later response for the old job ID.

- [ ] **Step 3: Run the new client test and verify it fails because the client is missing**

Run: `npx vitest run --project unit tests/unit/workers/pgnValidationWorkerClient.test.ts`

Expected: FAIL with a missing-module error.

- [ ] **Step 4: Implement the client with one active job slot**

```ts
export class PgnValidationWorkerClient {
  validate(games: readonly GameRecord[], signal: AbortSignal): Promise<PgnValidationResult>;
  cancel(): void;
  dispose(): void;
}
```

Map `GameRecord.username` to `NormalizedGameSummary.usernameKey` before posting. Use `crypto.randomUUID()`, reject superseded work with `AbortError`, clear listeners/tokens exactly once, and lazily create a replacement worker after a normal cancellation. Disposal is terminal for that client instance.

- [ ] **Step 5: Run the focused client and protocol tests until they pass**

Run: `npx vitest run --project unit tests/unit/workers/pgnValidationWorkerClient.test.ts tests/unit/workers/protocol.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the validation client**

```powershell
git add features/ingestion/pgnValidationWorkerClient.ts features/ingestion/types.ts tests/unit/workers/pgnValidationWorkerClient.test.ts
git commit -m "feat(ingestion): add PGN validation worker client"
```

### Task 3: Validate fetched and cached records before commit and acceptance

**Files:**

- Modify: `features/ingestion/ingestionService.ts`
- Modify: `features/workspace/browserServices.ts`
- Modify: `features/workspace/createWorkspaceController.ts`
- Modify: `lib/db/schema.ts`
- Test: `tests/dom/ingestion/ingestionService.test.ts`
- Test: `tests/dom/workspace/workspaceController.test.ts`

**Interfaces:**

- Consumes: Task 2's `IngestionDependencies.validatePgns` and `PgnValidationWorkerClient`.
- Produces: only PGN-valid `IngestionResult.games`, persisted month batches, and sync marker IDs.

- [ ] **Step 1: Update ingestion dependency fakes with a pass-through validator**

```ts
validatePgns: async (games) => ({
  validGameIds: games.map(({ id }) => id),
  diagnostics: [],
  totalInvalid: 0,
  diagnosticCodes: [],
}),
```

Keep this default in the shared fake builder so existing tests continue to express their original intent.

- [ ] **Step 2: Add failing ingestion tests for invalid replacement, persistence filtering, offline validation, and normalizer invalidation**

```ts
expect(result.games.map(({ id }) => id)).toEqual(['valid-new', 'valid-old']);
expect(persistMonth).toHaveBeenCalledWith(
  expect.not.arrayContaining([expect.objectContaining({ id: 'bad-pgn' })]),
  expect.anything(),
  expect.anything()
);
expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'ILLEGAL_PGN' }));
```

Use two archive months and `maxGames: 2`; make the newest month contain one invalid and one valid record, and the older month contain the replacement valid record. Add a fresh version-4 marker test that expects a refetch under version 5.

- [ ] **Step 3: Run the ingestion tests and verify they fail on current acceptance behavior**

Run: `npx vitest run --project dom tests/dom/ingestion/ingestionService.test.ts`

Expected: FAIL because invalid records are counted and persisted.

- [ ] **Step 4: Filter each month through validation before persistence**

```ts
const validation = await runtime.deps.validatePgns(normalizedMonthGames, {
  signal: runtime.signal,
});
const validIds = new Set(validation.validGameIds);
const validMonthGames = normalizedMonthGames.filter(({ id }) => validIds.has(id));
recordsExcluded += validation.totalInvalid;
recordsFailed += validation.totalInvalid;
for (const diagnostic of validation.diagnostics) appendDiagnostic(diagnostics, diagnostic);
```

Persist `validMonthGames`, use their IDs in `observedGameIds`, and apply query matching/max-count logic only to this array. Validate cached month records through the same dependency before accepting them.

- [ ] **Step 5: Bump the normalizer and wire browser ownership**

Set `NORMALIZER_VERSION` to 5 unless the current value is already higher, then increment it once. Construct a dedicated validation client in `createBrowserWorkspaceServices`, pass `validatePgns` into ingestion dependencies, add `dispose()` to `WorkspaceServices.ingestion`, and call it from controller disposal.

```ts
ingestion: {
  start: manager.start.bind(manager),
  cancel: manager.cancel.bind(manager),
  dispose: () => {
    manager.cancel();
    pgnValidator.dispose();
  },
},
```

- [ ] **Step 6: Run ingestion and workspace controller tests until they pass**

Run: `npx vitest run --project dom tests/dom/ingestion/ingestionService.test.ts tests/dom/workspace/workspaceController.test.ts`

Expected: PASS.

- [ ] **Step 7: Run schema, migration, and worker regression tests**

Run: `npx vitest run tests/dom/db/schema.test.ts tests/dom/db/migration.test.ts tests/unit/workers/analysisDataWorker.test.ts`

Expected: PASS with fixtures using the current exported normalizer version.

- [ ] **Step 8: Commit ingestion integration**

```powershell
git add features/ingestion/ingestionService.ts features/ingestion/types.ts features/workspace/browserServices.ts features/workspace/createWorkspaceController.ts lib/db/schema.ts tests/dom/ingestion/ingestionService.test.ts tests/dom/workspace/workspaceController.test.ts tests/dom/db/schema.test.ts tests/dom/db/migration.test.ts
git commit -m "fix(ingestion): count only parseable games"
```

### Task 4: Propagate defensive graph exclusions

**Files:**

- Modify: `workers/analysis-data.worker.ts`
- Modify: `workers/protocol.ts`
- Modify: `features/opening-tree/graphWorkerClient.ts`
- Modify: `features/workspace/types.ts`
- Modify: `features/workspace/reducer.ts`
- Modify: `features/workspace/createWorkspaceController.ts`
- Modify: `components/tree/OpeningTreeTable.tsx`
- Test: `tests/unit/workers/analysisDataWorker.test.ts`
- Test: `tests/unit/workers/graphWorkerClient.test.ts`
- Test: `tests/unit/workspace/reducer.test.ts`
- Test: `tests/dom/components/OpeningTreeTable.test.tsx`

**Interfaces:**

- Consumes: worker parse counts and diagnostic codes.
- Produces: graph status `partial` and exclusion metadata through worker, client, reducer, and UI.

- [ ] **Step 1: Write failing terminal-response and UI tests**

```ts
expect(responses.at(-1)).toMatchObject({
  type: 'PARTIAL',
  excludedGameCount: 1,
  diagnosticCodes: ['ILLEGAL_PGN'],
});

expect(screen.getByRole('status')).toHaveTextContent(
  '1 game was excluded while building this opening graph'
);
```

Also test limit precedence: a limited response retains `excludedGameCount` and `diagnosticCodes` without changing status from `LIMITED`.

- [ ] **Step 2: Run the worker, client, reducer, and component tests and verify failure**

Run: `npx vitest run tests/unit/workers/analysisDataWorker.test.ts tests/unit/workers/graphWorkerClient.test.ts tests/unit/workspace/reducer.test.ts tests/dom/components/OpeningTreeTable.test.tsx`

Expected: FAIL because partial graph status is not defined.

- [ ] **Step 3: Add exact terminal metadata to the protocol and client result**

Define `PARTIAL` with the same snapshot payload as `COMPLETE` plus `excludedGameCount` and `diagnosticCodes`. Extend `LIMITED` with those fields. `GraphBuildWorkerResult` must mirror both shapes without optionalizing fields that are always present.

- [ ] **Step 4: Propagate status through workspace state**

Add `'partial'` to graph status and `graph/terminal`. Read the exclusion count from `SerializedOpeningGraph.excludedGameCount` and store only the diagnostic-code list separately in workspace graph state.

```ts
graph: {
  status: 'idle' | 'building' | 'partial' | 'limited' | 'failed' | 'complete';
  snapshot: SerializedOpeningGraph | null;
  diagnosticCodes: readonly string[];
  error: string | null;
};
```

- [ ] **Step 5: Render the defensive warning**

Render a `role="status"` notice when `graph.excludedGameCount > 0`, naming the count and diagnostic categories without raw PGN content. Keep the resource-limit notice independently visible.

- [ ] **Step 6: Run all focused tests until they pass**

Run: `npx vitest run tests/unit/workers/analysisDataWorker.test.ts tests/unit/workers/graphWorkerClient.test.ts tests/unit/workspace/reducer.test.ts tests/dom/components/OpeningTreeTable.test.tsx tests/dom/workspace/workspaceController.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit graph diagnostic propagation**

```powershell
git add workers/analysis-data.worker.ts workers/protocol.ts features/opening-tree/graphWorkerClient.ts features/workspace/types.ts features/workspace/reducer.ts features/workspace/createWorkspaceController.ts components/tree/OpeningTreeTable.tsx tests/unit/workers/analysisDataWorker.test.ts tests/unit/workers/graphWorkerClient.test.ts tests/unit/workspace/reducer.test.ts tests/dom/components/OpeningTreeTable.test.tsx tests/dom/workspace/workspaceController.test.ts
git commit -m "fix(opening-tree): report defensive parse exclusions"
```

### Task 5: Verify the PGN-validation deliverable

**Files:**

- Verify only: all files changed in Tasks 1 through 4.

**Interfaces:**

- Consumes: complete Workstream 1 implementation.
- Produces: review evidence for the next plan.

- [ ] **Step 1: Run focused coverage**

Run: `npx vitest run --coverage tests/unit/workers/protocol.test.ts tests/unit/workers/analysisDataWorker.test.ts tests/unit/workers/pgnValidationWorkerClient.test.ts tests/dom/ingestion/ingestionService.test.ts tests/unit/workers/graphWorkerClient.test.ts tests/dom/components/OpeningTreeTable.test.tsx`

Expected: all selected tests pass; new branches have direct coverage.

- [ ] **Step 2: Run static checks**

Run: `npm run lint && npm run typecheck && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 3: Review invariants before proceeding**

Confirm from tests and code that invalid PGNs never enter a version-5 batch, accepted counts change only after validation, worker diagnostics remain bounded, graph exclusions remain visible, and worker disposal leaves no active promise.
