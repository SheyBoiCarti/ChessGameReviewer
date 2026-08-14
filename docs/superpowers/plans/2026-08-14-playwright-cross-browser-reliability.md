# Playwright Cross-Browser Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the configured Playwright browser projects launch in CI, stabilize modal accessibility scanning, restore meter coverage, and supply reviewed Linux Chromium visual baselines.

**Architecture:** CI installs the browser bundle matched to the locked Playwright package after `npm ci`. E2E accessibility tests wait for the observable completion of dialog focus and background inertness before Axe scans. Visual baselines remain project- and platform-specific, generated from the production build in Linux.

**Tech Stack:** GitHub Actions, Playwright 1.62.1, Next.js 16.3.0, React 19, TypeScript.

## Global Constraints

- Keep Chromium, Firefox, WebKit, mobile Chromium, and tablet Chromium projects enabled.
- Do not increase retries or weaken assertions.
- Generate snapshots in Linux with the exact `package-lock.json` Playwright version.
- Preserve the real Stockfish geometry assertion while restoring all project coverage.

---

### Task 1: Install every configured browser in CI

**Files:**

- Modify: `.github/workflows/ci.yml`

- [ ] Replace the Chromium-only installation command with `npx playwright install --with-deps` after `npm ci`.
- [ ] Verify the command recognizes Chromium, Firefox, and WebKit from the locked Playwright package.

### Task 2: Synchronize modal accessibility scans

**Files:**

- Modify: `tests/e2e/workspace-accessibility.spec.ts`

- [ ] Add a helper that waits for a dialog's close button to receive focus and for non-modal workspace content to be inert before calling Axe.
- [ ] Use it for the utility drawer and product-information dialog states.
- [ ] Run the accessibility project repeatedly without retries to prove the condition removes the race.

### Task 3: Restore evaluation-meter project coverage

**Files:**

- Modify: `tests/e2e/workspace-responsive.spec.ts`

- [ ] Remove the Chromium-only `test.skip` guard.
- [ ] Run the responsive tests in every project and retain the existing geometry and full-track assertions.

### Task 4: Add reviewed Linux Chromium snapshots

**Files:**

- Create: `tests/e2e/workspace-visual.spec.ts-snapshots/*-chromium-linux.png`

- [ ] Generate the five missing Linux Chromium images using `npx playwright test --project=chromium --update-snapshots` in a Linux environment.
- [ ] Inspect each image against its scenario before retaining it.
- [ ] Run the visual tests without snapshot updates to prove the baselines are used.

### Task 5: Verify the complete browser matrix

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `tests/e2e/workspace-accessibility.spec.ts`
- Modify: `tests/e2e/workspace-responsive.spec.ts`
- Create: `tests/e2e/workspace-visual.spec.ts-snapshots/*-chromium-linux.png`

- [ ] Run `npm run test:e2e` with all configured projects.
- [ ] Run the relevant formatting, lint, typecheck, and build checks.
