# Local Data Deletion Quiescence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee that confirmed username or clear-all deletion is the final local-data mutation from every operation that began before confirmation.

**Architecture:** Track active query and analysis promises in the workspace controller and introduce a serialized maintenance barrier. Deletion invalidates relevance tokens, aborts all writers, awaits their settlement, runs one IndexedDB deletion transaction, then resets UI state and admits new work.

**Tech Stack:** TypeScript, React external-store state, AbortController, IndexedDB, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-02-logic-functionality-audit-remediation-implementation-spec.md`

## Global Constraints

- Use test-driven development.
- Deletion must win over every operation that began before confirmation.
- Await cancelled writers before opening the deletion transaction.
- Do not delete position-keyed evaluation records for a single username.
- Clear-all must delete evaluations after active analysis settles.
- Ignore or reject query, analysis, and repeated deletion starts during maintenance.
- Never announce deletion success before the transaction commits.

---

## File structure

- Modify `features/workspace/types.ts`: define maintenance state and actions.
- Modify `features/workspace/reducer.ts`: transition maintenance and reset loaded state after success.
- Modify `features/workspace/createWorkspaceController.ts`: track promises and implement `cancelAndWait`.
- Modify `features/workspace/browserServices.ts`: conform to ingestion disposal/lifecycle interfaces from Plan 1.
- Modify `components/controls/LocalDataSettings.tsx`: disable destructive controls and report pending/failure states.
- Modify `components/workspace/ChessWorkspace.tsx`: provide maintenance state.
- Test `tests/unit/workspace/reducer.test.ts`, `tests/dom/workspace/workspaceController.test.ts`, `tests/dom/components/LocalDataSettings.test.tsx`, and `tests/e2e/indexeddb-persistence.spec.ts`.

### Task 1: Add explicit data-maintenance state

**Files:**

- Modify: `features/workspace/types.ts`
- Modify: `features/workspace/reducer.ts`
- Test: `tests/unit/workspace/reducer.test.ts`

**Interfaces:**

- Consumes: existing `WorkspaceState` and deletion reset behavior.
- Produces: `dataMaintenance` state and `operations/invalidated`, `data/deletionStarted`, `data/deletionFailed`, `data/userDeleted`, and `data/allCleared` transitions.

- [ ] **Step 1: Write failing reducer transition tests**

```ts
const deleting = reduceWorkspace(initialWorkspaceState, {
  type: 'data/deletionStarted',
  kind: 'user',
});
expect(deleting.dataMaintenance).toEqual({ status: 'deleting-user', error: null });

const failed = reduceWorkspace(deleting, {
  type: 'data/deletionFailed',
  error: 'Local data could not be deleted.',
});
expect(failed.dataMaintenance).toEqual({
  status: 'idle',
  error: 'Local data could not be deleted.',
});
```

Also assert successful user/all deletion resets maintenance to idle only after the corresponding terminal action.

Add a token test: `operations/invalidated` must replace `state.query.token`, convert active ingestion/analysis to `cancelled`, convert a building graph to `idle`, retain already completed results/snapshots, and ignore a later action carrying the previous token.

- [ ] **Step 2: Run reducer tests and verify missing state/actions fail**

Run: `npx vitest run --project unit tests/unit/workspace/reducer.test.ts`

Expected: FAIL on missing `dataMaintenance` and action variants.

- [ ] **Step 3: Add the state and actions**

```ts
dataMaintenance: {
  status: 'idle' | 'deleting-user' | 'clearing-all';
  error: string | null;
};
```

```ts
type DataMaintenanceAction =
  | { type: 'operations/invalidated'; token: number }
  | { type: 'data/deletionStarted'; kind: 'user' | 'all' }
  | { type: 'data/deletionFailed'; error: string };
```

Add all `DataMaintenanceAction` variants to `WorkspaceAction`. Exempt `operations/invalidated` from the reducer's stale-token precheck, as is already done for `query/started`. Update `query.token`; convert `ingestion.status === 'loading'` and `analysis.status === 'running'` to `cancelled`; convert `graph.status === 'building'` to `idle`; preserve completed results, snapshots, and other terminal statuses. Preserve the maintenance slice in unrelated transitions. Set it to idle/null after successful deletion; on failure keep the now-quiescent loaded state intact and store a safe error.

- [ ] **Step 4: Run reducer tests until they pass**

Run: `npx vitest run --project unit tests/unit/workspace/reducer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit maintenance state**

```powershell
git add features/workspace/types.ts features/workspace/reducer.ts tests/unit/workspace/reducer.test.ts
git commit -m "feat(data): model local deletion maintenance"
```

### Task 2: Quiesce controller writers before deletion

**Files:**

- Modify: `features/workspace/createWorkspaceController.ts`
- Test: `tests/dom/workspace/workspaceController.test.ts`

**Interfaces:**

- Consumes: Plan 2's deterministic cancellation, active analysis `AbortController`, graph cancellation, and Task 1 maintenance actions.
- Produces: private tracked query/analysis promises and serialized `runDeletion` behavior.

- [ ] **Step 1: Add failing query-write deletion race test**

Use a deferred ingestion promise whose abort path settles only after the test releases it. Record call order.

```ts
const deletion = controller.deleteUserData('second-player');
expect(order).toEqual(['ingestion-cancel']);
settleIngestionCancellation();
await deletion;
expect(order).toEqual(['ingestion-cancel', 'ingestion-settled', 'delete-user']);
```

Assert a late ingestion terminal result does not repopulate state.

- [ ] **Step 2: Add failing analysis-write clear-all race test**

Start analysis, call `clearAllData`, and keep analysis pending after its signal becomes aborted. Assert `services.data.clearAll` has not run. Settle analysis, await clear-all, and assert the evaluations deletion runs last.

- [ ] **Step 3: Add failing tests for starts during maintenance and repeated deletion**

Assert `submitQuery` and `startAnalysis` make no service calls while deletion is pending. Assert a second deletion rejects with a typed `DataMaintenanceActiveError` whose fixed message is `Local data maintenance is already running.`; this avoids returning the wrong result type when username deletion and clear-all overlap.

Define the error privately beside the controller factory:

```ts
class DataMaintenanceActiveError extends Error {
  constructor() {
    super('Local data maintenance is already running.');
    this.name = 'DataMaintenanceActiveError';
  }
}
```

- [ ] **Step 4: Run controller tests and verify race assertions fail**

Run: `npx vitest run --project dom tests/dom/workspace/workspaceController.test.ts`

Expected: FAIL because deletion currently starts immediately.

- [ ] **Step 5: Track active operations without changing public return types**

```ts
let activeQuery: Promise<void> | null = null;
let activeAnalysis: Promise<void> | null = null;
let maintenance: Promise<unknown> | null = null;
```

Move the existing async bodies into private `runQuery` and `runAnalysis` functions. Public methods assign the promise before returning it and clear it in `finally` only if identity still matches.

- [ ] **Step 6: Implement the quiescence barrier**

```ts
async function cancelAndWait(): Promise<void> {
  const invalidationToken = ++nextToken;
  analysisSequence += 1;
  dispatch({ type: 'operations/invalidated', token: invalidationToken });
  services.ingestion.cancel();
  services.graph.cancel();
  analysisController?.abort();
  const active = [activeQuery, activeAnalysis].filter(
    (promise): promise is Promise<void> => promise !== null
  );
  await Promise.allSettled(active);
}
```

Do not call service disposal here; the workspace must remain usable after deletion.

- [ ] **Step 7: Serialize deletion after quiescence**

```ts
async function runDeletion<T>(
  kind: 'user' | 'all',
  operation: () => Promise<T>,
  terminal: (result: T) => WorkspaceAction
): Promise<T> {
  if (maintenance) throw new DataMaintenanceActiveError();
  const work = (async () => {
    dispatch({ type: 'data/deletionStarted', kind });
    await cancelAndWait();
    const result = await operation();
    dispatch(terminal(result));
    return result;
  })();
  maintenance = work;
  try {
    return await work;
  } catch {
    dispatch({ type: 'data/deletionFailed', error: 'Local data could not be deleted.' });
    throw new Error('Local data could not be deleted.');
  } finally {
    if (maintenance === work) maintenance = null;
  }
}
```

Use the exact existing deletion result values in successful returns. Sanitize the UI error but retain the original exception as `cause` for local debugging if supported.

- [ ] **Step 8: Run controller tests until all race cases pass**

Run: `npx vitest run --project dom tests/dom/workspace/workspaceController.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit controller quiescence**

```powershell
git add features/workspace/createWorkspaceController.ts tests/dom/workspace/workspaceController.test.ts
git commit -m "fix(data): quiesce writers before local deletion"
```

### Task 3: Disable conflicting UI actions and report maintenance

**Files:**

- Modify: `components/controls/LocalDataSettings.tsx`
- Modify: `components/workspace/ChessWorkspace.tsx`
- Test: `tests/dom/components/LocalDataSettings.test.tsx`

**Interfaces:**

- Consumes: `WorkspaceState.dataMaintenance` from Task 1.
- Produces: disabled controls, pending status, and safe failure alert.

- [ ] **Step 1: Add failing component tests for pending, repeated clicks, success, and failure**

```ts
render(
  <LocalDataSettings
    users={[{ username: 'alice' }]}
    maintenance={{ status: 'deleting-user', error: null }}
    onDeleteUsername={onDelete}
    onClearAll={onClear}
  />
);
expect(screen.getByRole('button', { name: /delete alice data/i })).toBeDisabled();
expect(screen.getByRole('button', { name: /clear all local data/i })).toBeDisabled();
expect(screen.getByRole('status')).toHaveTextContent('Deleting local data');
```

Assert an injected maintenance error renders with `role="alert"` and no raw exception detail.

- [ ] **Step 2: Run the component test and verify it fails on the missing prop**

Run: `npx vitest run --project dom tests/dom/components/LocalDataSettings.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Add the maintenance prop and UI states**

```ts
maintenance: WorkspaceState['dataMaintenance'];
```

Disable confirmation buttons while non-idle, close an open confirmation once maintenance starts, show `Deleting local data…` or `Clearing all local data…`, and render `maintenance.error` as an alert. Keep success copy driven by the awaited controller result.

- [ ] **Step 4: Pass maintenance state from the workspace**

```tsx
<LocalDataSettings
  users={users}
  maintenance={state.dataMaintenance}
  onDeleteUsername={controller.deleteUserData}
  onClearAll={controller.clearAllData}
/>
```

- [ ] **Step 5: Run component and workspace DOM tests**

Run: `npx vitest run --project dom tests/dom/components/LocalDataSettings.test.tsx tests/dom/components/AnalyzerWorkspace.test.tsx tests/dom/workspace/useWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit maintenance UI**

```powershell
git add components/controls/LocalDataSettings.tsx components/workspace/ChessWorkspace.tsx tests/dom/components/LocalDataSettings.test.tsx
git commit -m "feat(data): expose deletion maintenance state"
```

### Task 4: Prove deletion wins in IndexedDB and browser flows

**Files:**

- Modify: `tests/dom/db/deleteLocalData.test.ts`
- Modify: `tests/e2e/indexeddb-persistence.spec.ts`

**Interfaces:**

- Consumes: Tasks 1 through 3.
- Produces: database and browser evidence that no stale writer recreates data.

- [ ] **Step 1: Add an IndexedDB integration race test**

Start a controlled pre-deletion write, abort and settle it, call `deleteUserData`/`clearAllData`, then query every affected store. Assert user deletion retains unrelated users and shared evaluations; clear-all leaves all five stores empty.

- [ ] **Step 2: Extend the browser persistence scenario**

Intercept a monthly response or analysis completion behind a deferred route. Confirm deletion while work is active, release the stale response, reload, and assert the deleted username/game is absent. In the clear-all variant, inspect IndexedDB in `page.evaluate` and assert the evaluations store count is zero.

- [ ] **Step 3: Run focused database and Chromium tests**

Run: `npx vitest run --project dom tests/dom/db/deleteLocalData.test.ts tests/dom/workspace/workspaceController.test.ts`

Run: `npx playwright test tests/e2e/indexeddb-persistence.spec.ts --project=chromium`

Expected: PASS.

- [ ] **Step 4: Run static checks and review call ordering**

Run: `npm run lint && npm run typecheck && git diff --check`

Expected: all commands exit 0. Confirm test assertions prove settlement precedes deletion rather than merely proving stale UI suppression.

- [ ] **Step 5: Commit integration coverage**

```powershell
git add tests/dom/db/deleteLocalData.test.ts tests/e2e/indexeddb-persistence.spec.ts
git commit -m "test(data): prove deletion wins over stale writers"
```
