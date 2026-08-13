# Development CSP Compatibility Design

## Goal

Allow React's development-only debugging support without weakening the production Content Security Policy.

## Design

`next.config.ts` will construct the security headers from an explicit environment input. In development, `script-src` will include general `'unsafe-eval'`, as required by the installed Next.js 16.3 documentation. In test and production environments, general `'unsafe-eval'` will remain absent while `'wasm-unsafe-eval'` remains available for Stockfish WebAssembly.

The exported `securityHeaders` value will continue to be the value consumed by `nextConfig.headers()`, so routing and all other security directives remain unchanged. A focused unit test will exercise both environment branches and guard against accidentally allowing general evaluation in production.

## Verification

- The regression test must fail against the current static policy.
- Header unit tests must pass after the change.
- The live `next dev` response must include general `'unsafe-eval'`.
- A production build/server response must exclude general `'unsafe-eval'`.

## Scope

No nonce migration, CSP directive restructuring, UI change, or unrelated test cleanup is included.
