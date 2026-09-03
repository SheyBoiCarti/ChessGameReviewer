# Serialized Graph Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent any serialized opening graph larger than 64 MiB from crossing the worker boundary and return the largest usable complete-game prefix as a limited graph.

**Architecture:** Keep position/edge/path limits inside `OpeningGraphBuilder` and enforce exact serialized bytes in the worker. On overflow, binary-search canonical game prefixes, rebuild and serialize candidates, and post only the largest fitting snapshot.

**Tech Stack:** TypeScript, Web Workers, TextEncoder, chess.js graph model, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-logic-functionality-audit-remediation-implementation-spec.md`

## Global Constraints

- Use test-driven development.
- Production serialized graph budget is exactly `64 * 1024 * 1024` bytes.
- Enforce the limit using UTF-8 bytes of `JSON.stringify(snapshot)`.
- Never split a game; prefix selection occurs only at complete-game boundaries.
- Never post a known-oversized snapshot to the UI thread.
- Preserve deterministic canonical ordering and existing structural limits.
- Use injected small byte budgets in tests.

---

## File structure

- Modify `lib/chess/graph/types.ts`: limit `GraphBuildLimits` to structural caps.
- Modify `lib/chess/graph/openingGraph.ts`: expose canonical ordering or a deterministic prefix-build helper and remove the unused byte cap.
- Modify `lib/chess/graph/serialization.ts`: centralize production byte budget and exact fit predicate.
- Modify `workers/analysis-data.worker.ts`: select the largest fitting prefix after overflow.
- Modify `workers/protocol.ts`: retain typed `maxSnapshotBytes` reached-limit metadata.
- Test `tests/unit/chess/graph/openingGraph.test.ts`, `tests/unit/chess/graph/serialization.test.ts`, and `tests/unit/workers/analysisDataWorker.test.ts`.

### Task 1: Separate structural and serialized limits

**Files:**

- Modify: `lib/chess/graph/types.ts`
- Modify: `lib/chess/graph/openingGraph.ts`
- Modify: `lib/chess/graph/serialization.ts`
- Test: `tests/unit/chess/graph/openingGraph.test.ts`
- Test: `tests/unit/chess/graph/serialization.test.ts`

**Interfaces:**

- Consumes: current `GraphBuildLimits`, `MAX_SERIALIZED_GRAPH_BYTES`, and `serializedGraphByteSize`.
- Produces: `GraphStructuralLimits`, `serializedGraphFits(snapshot, maxBytes)`, and one canonical-order helper.

- [ ] **Step 1: Write failing tests that byte limits are not accepted by the structural builder**

```ts
const limits: GraphStructuralLimits = {
  maxPositions: 10,
  maxEdges: 10,
  maxPathNodes: 10,
};
expect(new OpeningGraphBuilder({}, limits)).toBeDefined();
```

Remove tests that imply `OpeningGraphBuilder` itself reports `maxSnapshotBytes`; replace them with serialization-boundary tests.

- [ ] **Step 2: Write exact byte-fit tests**

```ts
const bytes = serializedGraphByteSize(snapshot);
expect(serializedGraphFits(snapshot, bytes)).toBe(true);
expect(serializedGraphFits(snapshot, bytes - 1)).toBe(false);
```

- [ ] **Step 3: Run graph and serialization tests and verify type/behavior failure**

Run: `npx vitest run --project unit tests/unit/chess/graph/openingGraph.test.ts tests/unit/chess/graph/serialization.test.ts`

Expected: FAIL because structural and serialized limits are conflated and the fit helper is missing.

- [ ] **Step 4: Implement the boundary split**

```ts
export interface GraphStructuralLimits {
  maxPositions: number;
  maxEdges: number;
  maxPathNodes: number;
}

export const MAX_SERIALIZED_GRAPH_BYTES = 64 * 1024 * 1024;

export function serializedGraphFits(
  snapshot: SerializedOpeningGraph,
  maxBytes = MAX_SERIALIZED_GRAPH_BYTES
): boolean {
  return serializedGraphByteSize(snapshot) <= maxBytes;
}
```

Export `canonicalGameOrder` or an equivalent immutable helper so overflow selection and builder use one ordering implementation.

- [ ] **Step 5: Run focused tests until they pass**

Run: `npx vitest run --project unit tests/unit/chess/graph/openingGraph.test.ts tests/unit/chess/graph/serialization.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit limit ownership cleanup**

```powershell
git add lib/chess/graph/types.ts lib/chess/graph/openingGraph.ts lib/chess/graph/serialization.ts tests/unit/chess/graph/openingGraph.test.ts tests/unit/chess/graph/serialization.test.ts
git commit -m "refactor(graph): separate structural and byte limits"
```

### Task 2: Select the largest fitting complete-game prefix

**Files:**

- Modify: `workers/analysis-data.worker.ts`
- Modify: `workers/protocol.ts`
- Test: `tests/unit/workers/analysisDataWorker.test.ts`

**Interfaces:**

- Consumes: Task 1's canonical ordering and `serializedGraphFits`.
- Produces: exported testable `buildGraphWithinByteBudget(games, options, metadata, runtime)` helper.

- [ ] **Step 1: Add failing worker tests for exact fit, one-game overflow, middle-prefix overflow, and structural-limit precedence**

Inject a tiny `maxBytes` through the exported helper, not through the public worker message.

```ts
expect(result).toMatchObject({
  status: 'limited',
  reachedLimit: 'maxSnapshotBytes',
  includedGameCount: 2,
  remainingGameCount: 1,
});
expect(serializedGraphByteSize(result.snapshot)).toBeLessThanOrEqual(maxBytes);
```

For one-game overflow, assert `includedGameCount === 0`, `remainingGameCount === validGames.length`, a valid root reference, and a fitting serialized size.

- [ ] **Step 2: Add a failing maximality assertion**

After selecting two games, build/serialize the three-game prefix and assert it exceeds the same injected budget. This proves largest-fitting rather than merely fitting.

- [ ] **Step 3: Run worker tests and verify overflow cases fail**

Run: `npx vitest run --project unit tests/unit/workers/analysisDataWorker.test.ts`

Expected: FAIL because the current worker only attaches a persistence notice.

- [ ] **Step 4: Implement deterministic binary search**

```ts
let low = 0;
let high = orderedGames.length;
let best = await buildPrefix(0);

while (low <= high) {
  if (runtime.shouldCancel?.()) throw createAbortError();
  const middle = Math.floor((low + high) / 2);
  const candidate = await buildPrefix(middle);
  if (serializedGraphFits(candidate.snapshot, maxBytes)) {
    best = candidate;
    low = middle + 1;
  } else {
    high = middle - 1;
  }
}
```

`buildPrefix(count)` must construct a fresh builder with the same structural options, build `orderedGames.slice(0, count)`, serialize with original source/excluded metadata, and check cancellation during async builds. Import `createAbortError` from `lib/api/errors`. Override the returned snapshot status/counts to `limited`, `maxSnapshotBytes`, selected count, and total-valid minus selected.

- [ ] **Step 5: Preserve structural-limit precedence**

If the initial graph is already `limited` by positions, edges, or paths and its snapshot fits, return that structural limit. If that structurally limited snapshot also exceeds bytes, apply prefix selection and report `maxSnapshotBytes`, because it is the tighter transferable result; preserve parse-exclusion metadata from Plan 1.

- [ ] **Step 6: Remove the old notice-only overflow behavior**

Remove `SNAPSHOT_TOO_LARGE_TO_PERSIST`, `SnapshotPersistenceNotice`, and `snapshotPersistenceNotice` from protocol, client, worker, serialization, and tests. There is no separate production persistence threshold, so the exact worker-transfer budget is the sole byte-size rule.

- [ ] **Step 7: Run worker, serialization, and protocol tests until they pass**

Run: `npx vitest run tests/unit/workers/analysisDataWorker.test.ts tests/unit/chess/graph/serialization.test.ts tests/unit/workers/protocol.test.ts tests/unit/workers/graphWorkerClient.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit byte-budget enforcement**

```powershell
git add workers/analysis-data.worker.ts workers/protocol.ts features/opening-tree/graphWorkerClient.ts lib/chess/graph/serialization.ts tests/unit/workers/analysisDataWorker.test.ts tests/unit/chess/graph/serialization.test.ts tests/unit/workers/protocol.test.ts tests/unit/workers/graphWorkerClient.test.ts
git commit -m "fix(graph): enforce serialized worker budget"
```

### Task 3: Verify performance, cancellation, and limit UI

**Files:**

- Modify: `tests/unit/benchmarks/openingGraph.benchmark.test.ts`
- Modify: `tests/dom/components/OpeningTreeTable.test.tsx`

**Interfaces:**

- Consumes: Tasks 1 and 2.
- Produces: evidence that normal builds remain single-pass and overflow remains cancellable and visible.

- [ ] **Step 1: Add an overflow cancellation test**

Cancel after the first rebuild/yield and assert the worker terminal response is `CANCELLED`, with neither `COMPLETE` nor `LIMITED` published afterward.

- [ ] **Step 2: Instrument the benchmark test for normal-path rebuild count**

Add optional `onBuildAttempt?: (gameCount: number) => void` to the exported helper's runtime test seam. Assert a within-budget 5000-game-equivalent fixture calls it exactly once with the full game count. Do not pass the callback from production or add production logging.

- [ ] **Step 3: Assert the UI names the byte limit**

```ts
expect(screen.getByRole('status')).toHaveTextContent(
  'This graph reached the snapshot size resource limit'
);
```

- [ ] **Step 4: Run focused benchmark and UI tests**

Run: `npx vitest run tests/unit/benchmarks/openingGraph.benchmark.test.ts tests/unit/workers/analysisDataWorker.test.ts tests/dom/components/OpeningTreeTable.test.tsx`

Expected: PASS; normal benchmark remains within its existing threshold.

- [ ] **Step 5: Run static checks**

Run: `npm run lint && npm run typecheck && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 6: Commit verification coverage**

```powershell
git add tests/unit/benchmarks/openingGraph.benchmark.test.ts tests/unit/workers/analysisDataWorker.test.ts tests/dom/components/OpeningTreeTable.test.tsx
git commit -m "test(graph): verify byte budget behavior"
```
