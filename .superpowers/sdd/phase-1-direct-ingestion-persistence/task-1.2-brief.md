## 3. Task 1.2 — Shared contracts and runtime validation

### Files

- Create `lib/api/contracts.ts`.
- Create `lib/api/chesscomSchemas.ts`.
- Create `lib/validation/gameQuery.ts`.
- Create `lib/chess/results.ts`.
- Create fixtures for valid, missing, malformed, oversized, 404, 410, 429, and 5xx upstream responses.

### Requirements

Implement and export the canonical `GameQuery`, normalized upstream error, raw upstream schemas, normalized game summary, job status, and diagnostic contracts.

`GameQuery` validation covers:

- normalized Chess.com username grammar and length;
- inclusive UTC date bounds and inverted ranges;
- `maxGames` from 1 through 5,000, default 500;
- non-empty supported time-class and colour sets;
- optional rated status.

Raw game validation retains only required fields. Unknown upstream fields are ignored. Missing required fields produce a structured diagnostic tied to a stable game identifier when available.

Map all documented Chess.com player-result tokens explicitly. Determine user outcome from both player result fields and reject inconsistent pairs. Unknown tokens are excluded with diagnostics, never silently mapped to a draw.

### Tests first

- Boundary/property tests for username, dates, sets, and `maxGames`.
- Schema tests for optional fields, unknown fields, wrong types, malformed arrays, and oversized counts.
- Table-driven result mapping for both user colours, draws, abandonment/time outcomes, and unknown/inconsistent tokens.
- Error messages are safe for rendering and contain no raw response body.

### Acceptance

- Every trust-boundary value is narrowed from `unknown`.
- Every validation failure maps to a stable error/diagnostic code.
- The browser client, repositories, and ingestion service share these contracts.
