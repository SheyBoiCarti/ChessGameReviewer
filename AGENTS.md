<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Test-Safety Rules

Treat a failing test as evidence to investigate, not permission to rewrite the test.

Before changing production code, tests, or snapshots:

1. Run the specific failing test and read its complete failure output.
2. Identify the root cause and state whether the defect is in production code, the test contract, or an intentionally changed visual baseline.
3. Do not change a test expectation unless the product behaviour it asserted was intentionally changed and the new assertion still protects a user-facing contract.
4. Do not regenerate a visual snapshot merely to make a test pass. First verify the visual change is intentional, inspect the changed image, and document the reason in the final handoff.
5. When one repair exposes further failures, investigate each new failure independently; do not assume they share the first cause.

Before committing or pushing:

1. Run `npm run verify` and wait for its actual terminal result.
2. Do not claim verification passed from partial output, a running process, or the absence of visible artifacts.
3. In the final handoff, list every changed test, assertion, and snapshot, and explain why it changed.
4. Do not commit or push while any test failure, formatter warning, lint error, type error, build error, or coverage-threshold failure remains.
