## 2. Task 1.1 — Bootstrap supported tooling

### Files

- Create `package.json` and lockfile.
- Create `tsconfig.json`.
- Create framework, CSS, lint, formatting, test, and Playwright configuration.
- Create `app/layout.tsx`, `app/page.tsx`, and `app/globals.css`.
- Create `tests/setup/headers.test.ts` and a minimal browser smoke test.
- Create CI workflow configuration.

### Requirements

1. Start from the current supported Next.js Active LTS patch; minimum permitted version is 16.2.11. Use its supported React and Node releases.
2. Pin the package manager version and commit the lockfile.
3. Enable strict TypeScript, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and path aliases.
4. Configure Vitest for Node and DOM projects separately. Include Testing Library, user-event, fake IndexedDB, and a worker-test strategy.
5. Configure Playwright with Chromium initially; Firefox and WebKit join preview coverage in Phase 4.
6. Provide scripts for `format:check`, `lint`, `typecheck`, `test`, `test:coverage`, `test:e2e`, and `build`.
7. Configure these response headers on document and required worker/static routes:
   - `Cross-Origin-Opener-Policy: same-origin`;
   - `Cross-Origin-Embedder-Policy: require-corp`;
   - `X-Content-Type-Options: nosniff`;
   - an application-appropriate `Referrer-Policy`;
   - framing restrictions;
   - a CSP that permits same-origin workers and the selected WASM loading mechanism, and limits ingestion `connect-src` to `https://api.chess.com`.
8. Do not create `app/api/chesscom` routes or another unauthenticated PubAPI proxy.
9. Add an unaffiliated-product notice and a local-storage/privacy summary to the shell.
10. Use the installed Playwright MCP to inspect the running local and preview shell, console, network activity, computed isolation state, CSP behavior, and IndexedDB persistence. Preserve reproducibility by adding committed Playwright tests for stable checks.

### Tests first

- Configuration test asserts headers for document and worker asset paths.
- Production-server smoke test asserts actual response headers; importing a config object is not sufficient as the only test.
- Browser smoke test asserts heading, privacy notice, and no console errors.
- CSP smoke test proves an approved PubAPI CORS request is allowed and an arbitrary connection target is blocked.
- CI test proves a clean lockfile install and build.

### Acceptance

- Clean clone/install/build succeeds on the documented Node version.
- Preview response headers are verified over HTTP.
- `window.crossOriginIsolated` is reported as capability state, not assumed from config.
- No unsupported framework major, server PubAPI proxy, or unpinned direct dependency remains.
- Playwright MCP verification notes identify the tested revision/URL, observed console/network state, and any regression test added; CI remains independent of MCP.
