# Ingestion Status Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an active game ingestion legible and controllable through a compact, phase-aware status card.

**Architecture:** `IngestionProgress` remains a presentation-only component: it derives user-facing copy and progress mode from the existing `IngestionProgress` value. `ChessWorkspace` continues to render the card only during an active ingestion and supplies the existing cancellation handler. No service, API, reducer, or persistence behavior changes.

**Tech Stack:** Next.js 16.3.0, React 19, TypeScript, Vitest, Testing Library, CSS.

## Global Constraints

- Preserve the existing `IngestionProgress` public props: `progress: Progress` and `onCancel(): void`.
- Use existing ingestion phases verbatim: `planning`, `loading-cache`, `fetching`, and `filtering`.
- Use an indeterminate native `<progress>` element before `monthsPlanned` is known; expose `value` and `max` only after it is known.
- Keep the game query disabled during loading and retain the existing Cancel loading handler.
- Announce status updates with a polite, atomic live region.
- Leave all work uncommitted because this is a shared dirty worktree.

---

## File structure

- Modify `components/feedback/IngestionProgress.tsx`: map ingestion state to compact, phase-specific copy and native progress semantics.
- Modify `tests/dom/components/IngestionFeedback.test.tsx`: describe the full active-loading UX and cancellation contract.
- Modify `app/globals.css`: add narrowly scoped layout rules for the status card’s heading and metadata if existing `status-card` rules are insufficient.

### Task 1: Specify the status-card states with DOM tests

**Files:**

- Modify: `tests/dom/components/IngestionFeedback.test.tsx`

**Interfaces:**

- Consumes: `IngestionProgress({ progress, onCancel })` with the existing `Progress` type.
- Produces: failing tests for phase heading/detail copy, indeterminate versus determinate progress, and cancellation.

- [x] **Step 1: Write failing tests for archive discovery and a named archive month**

```tsx
it('shows an indeterminate archive-discovery status before a total is known', () => {
  render(
    <IngestionProgress
      progress={{ ...baseProgress, phase: 'planning', monthsPlanned: 0 }}
      onCancel={vi.fn()}
    />
  );

  expect(screen.getByRole('status')).toHaveTextContent(/finding game archives/i);
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('value');
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('max');
});

it('identifies the archive month being loaded and exposes completed work', () => {
  render(
    <IngestionProgress
      progress={{
        ...baseProgress,
        phase: 'fetching',
        currentMonth: '2026-07',
        monthsPlanned: 4,
        monthsCompleted: 2,
        recordsAccepted: 24,
      }}
      onCancel={vi.fn()}
    />
  );

  expect(screen.getByRole('status')).toHaveTextContent(/loading july 2026/i);
  expect(screen.getByRole('status')).toHaveTextContent(
    /2 of 4 archive months complete.*24 games found/i
  );
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '2');
  expect(screen.getByRole('progressbar')).toHaveAttribute('max', '4');
});
```

- [x] **Step 2: Write failing tests for cache/filter states and keyboard cancellation**

```tsx
it.each([
  ['loading-cache', /checking saved games/i],
  ['filtering', /organizing loaded games/i],
] as const)('uses clear copy for %s', (phase, heading) => {
  render(
    <IngestionProgress progress={{ ...baseProgress, phase, monthsPlanned: 3 }} onCancel={vi.fn()} />
  );
  expect(screen.getByRole('status')).toHaveTextContent(heading);
});

it('keeps cancellation keyboard-operable', async () => {
  const user = userEvent.setup();
  const onCancel = vi.fn();
  render(
    <IngestionProgress
      progress={{ ...baseProgress, phase: 'fetching', monthsPlanned: 3 }}
      onCancel={onCancel}
    />
  );
  await user.tab();
  await user.keyboard('{Enter}');
  expect(onCancel).toHaveBeenCalledOnce();
});
```

- [x] **Step 3: Run the focused test to verify it fails against the generic copy**

Run: `npm test -- tests/dom/components/IngestionFeedback.test.tsx`

Expected: FAIL because the current component renders “Loading game archives” for every phase and always supplies progress values.

- [x] **Step 4: Keep the failure output as the behavioral baseline**

Do not modify production code until the named assertions fail for the expected reasons.

### Task 2: Implement phase-aware, accessible status presentation

**Files:**

- Modify: `components/feedback/IngestionProgress.tsx`

**Interfaces:**

- Consumes: `Progress.phase`, `currentMonth`, `monthsPlanned`, `monthsCompleted`, `recordsAccepted`, and `recordsExcluded`.
- Produces: `statusCopy(progress): { heading: string; detail: string; determinate: boolean }` used only by `IngestionProgress`.

- [x] **Step 1: Add the smallest copy mapper**

```tsx
function statusCopy(progress: Progress) {
  const month = progress.currentMonth
    ? new Intl.DateTimeFormat(undefined, {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(`${progress.currentMonth}-01T00:00:00.000Z`))
    : null;
  const heading =
    progress.phase === 'planning'
      ? 'Finding game archives'
      : progress.phase === 'loading-cache'
        ? 'Checking saved games'
        : progress.phase === 'fetching'
          ? month
            ? `Loading ${month}`
            : 'Loading game archives'
          : 'Organizing loaded games';
  const detail =
    progress.monthsPlanned > 0
      ? `${progress.monthsCompleted} of ${progress.monthsPlanned} archive months complete. ${progress.recordsAccepted} games found.`
      : `${progress.recordsAccepted} games found so far.`;
  return { heading, detail, determinate: progress.monthsPlanned > 0 };
}
```

- [x] **Step 2: Render compact metadata and correct native progress semantics**

```tsx
const copy = statusCopy(progress);
return (
  <section className="status-card" role="status" aria-live="polite" aria-atomic="true">
    <span className="status-label status-label--loading">Loading</span>
    <h3>{copy.heading}</h3>
    <p>{copy.detail}</p>
    {copy.determinate ? (
      <progress value={progress.monthsCompleted} max={progress.monthsPlanned}>
        {copy.detail}
      </progress>
    ) : (
      <progress>{copy.detail}</progress>
    )}
    <button type="button" onClick={onCancel}>
      Cancel loading
    </button>
  </section>
);
```

- [x] **Step 3: Run the focused DOM test**

Run: `npm test -- tests/dom/components/IngestionFeedback.test.tsx`

Expected: PASS with phase-specific live status, determinate and indeterminate progress, and cancellation coverage.

- [x] **Step 4: Format only the touched implementation and test files**

Run: `npx prettier --write components/feedback/IngestionProgress.tsx tests/dom/components/IngestionFeedback.test.tsx`

Expected: Files are formatted without touching unrelated shared-tree files.

### Task 3: Verify integration and visual containment

**Files:**

- Modify only if required: `app/globals.css`
- Test: `tests/dom/components/IngestionFeedback.test.tsx`

**Interfaces:**

- Consumes: existing `.status-card`, `.status-label`, and global `progress` styles.
- Produces: a compact card that does not create layout overflow in the utility rail.

- [ ] **Step 1: Inspect the running app at a narrow and desktop viewport while a load is active**

Run: `npx playwright test tests/e2e/workspace-responsive.spec.ts --project=chromium --workers=1 --reporter=line`

Expected: Existing responsive workspace assertions pass; inspect the status card during a controlled loading state if the test fixture exposes one.

Attempted with Chromium on 2026-08-13, but the Playwright runner produced no output for more than a minute and was stopped. This existing runner-hang must be resolved before this step can be checked off.

- [x] **Step 2: Add scoped CSS only if the current shared card rules do not provide a compact vertical rhythm**

```css
.status-card {
  display: grid;
  gap: var(--space-3);
}

.status-card h3 {
  font-size: 1rem;
}
```

- [x] **Step 3: Run targeted checks**

Run: `npm test -- tests/dom/components/IngestionFeedback.test.tsx && npm run typecheck && npx prettier --check components/feedback/IngestionProgress.tsx tests/dom/components/IngestionFeedback.test.tsx app/globals.css`

Expected: all selected checks pass.

- [x] **Step 4: Record no commit**

Keep the changes uncommitted, preserving the user’s shared dirty worktree requirement.
