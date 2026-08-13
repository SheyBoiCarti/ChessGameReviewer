# Development CSP Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permit React's development debugging evaluation while keeping the production CSP hardened.

**Architecture:** Build the CSP from an explicit development flag in `next.config.ts`. Keep the existing exported headers and Next.js route configuration, changing only the `script-src` value selected for development.

**Tech Stack:** Next.js 16.3, TypeScript, Vitest

## Global Constraints

- General `'unsafe-eval'` is development-only.
- Production retains `'wasm-unsafe-eval'` and excludes general `'unsafe-eval'`.
- Existing security directives and header routes remain unchanged.
- Changes remain uncommitted on the dirty shared branch.

---

### Task 1: Environment-aware CSP

**Files:**

- Modify: `tests/setup/headers.test.ts`
- Modify: `next.config.ts`

**Interfaces:**

- Consumes: `process.env.NODE_ENV`
- Produces: `createSecurityHeaders(isDevelopment: boolean): SecurityHeader[]`

- [x] **Step 1: Write the failing test**

Add a test which calls `createSecurityHeaders(true)` and `createSecurityHeaders(false)`, then asserts the development CSP contains general `'unsafe-eval'` and the production CSP does not.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- tests/setup/headers.test.ts`

Expected: FAIL because `createSecurityHeaders` is not exported yet.

- [x] **Step 3: Write the minimal implementation**

Export `createSecurityHeaders(isDevelopment: boolean)` and append ` 'unsafe-eval'` to `script-src` only when `isDevelopment` is true. Initialize `securityHeaders` using `process.env.NODE_ENV === 'development'`.

- [x] **Step 4: Run the focused tests to verify they pass**

Run: `npm test -- tests/setup/headers.test.ts`

Expected: all header tests PASS.

- [x] **Step 5: Verify runtime headers**

Restart `npm run dev`, request `/`, and assert its CSP includes general `'unsafe-eval'`. Run a production build/server and assert its CSP excludes general `'unsafe-eval'`.

- [x] **Step 6: Preserve shared-branch state**

Inspect `git diff` for the scoped files and leave the work uncommitted.
