## 4. Task 1.3 — Direct browser Chess.com PubAPI client

### Files

- Create `lib/api/chesscomUrl.ts`.
- Create `lib/api/chesscomClient.ts`.
- Create `lib/api/errors.ts`.
- Create `lib/api/pubApiCoordinator.ts`.
- Create `tests/api/chesscomClient.test.ts`.

### Request requirements

- Support only:
  - `https://api.chess.com/pub/player/{username}/games/archives`;
  - `https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}`.
- Build URLs from validated segments with `new URL()`; never accept a caller-supplied URL or arbitrary path.
- Use `GET`, `mode: 'cors'`, `credentials: 'omit'`, `redirect: 'follow'`, and normal browser HTTP caching.
- After redirects, reject the response unless `response.url` still has HTTPS origin `api.chess.com` and the approved player-archives/monthly path family.
- Do not set `User-Agent`, `If-None-Match`, `If-Modified-Since`, `X-Application-Contact`, or another non-safelisted request header. Browsers control `User-Agent`, and the current PubAPI preflight permits only simple cross-origin use.
- Give every attempt a composed abort signal that enforces a 10-second deadline and caller cancellation.
- Fetch one PubAPI request at a time per ingestion job.
- When available, hold a named Web Lock only for the duration of each network attempt so same-origin tabs do not issue concurrent PubAPI calls. If Web Locks are unavailable, remain serial per tab and rely on bounded 429 recovery.

### Response and resource requirements

- Accept only a successful JSON response matching the endpoint schema.
- Map 404 to player/data not found, 410 to permanently unavailable, 429 to rate limited, and other retryable statuses according to the canonical error contract.
- Never reflect arbitrary upstream response text into the UI.
- Reject a declared body over 32 MiB before reading when `Content-Length` is available.
- Independently count streamed bytes and abort above 32 MiB; a missing or false `Content-Length` must not bypass the limit.
- Reject a monthly response containing more than 20,000 raw game objects before normalization.
- Treat CORS rejection, offline state, timeout, malformed JSON, invalid schema, and abort as distinct typed outcomes.

### Caching rule

Use `cache: 'default'`. JavaScript does not manage validators because the current PubAPI CORS preflight does not allow conditional-request headers, and `ETag` is not guaranteed readable. The browser may reuse/revalidate its HTTP cache. Application freshness comes from IndexedDB `archiveSync` records:

- current UTC month: stale after 15 minutes;
- completed month: stale after 30 days;
- archive-list planning metadata: stale after 15 minutes;
- manual refresh: ignore the application timer and issue a normal browser fetch.

Do not claim that a request was an HTTP cache hit unless the platform exposes trustworthy evidence; report only application-cache reuse versus a browser fetch.

### Tests first

- Assert exact origin/path encoding for valid usernames, years, and months, plus rejection of an unexpected final redirect origin/path.
- Prove arbitrary URL/path injection is impossible.
- Assert method, CORS mode, omitted credentials, allowed request headers, abort signal, and fetch-cache mode.
- Cover 200, 404, 410, 429, 5xx, network/CORS failure, timeout, cancellation, wrong content type, malformed JSON, schema failure, lying/missing `Content-Length`, streamed overflow, and raw-count overflow.
- Test serial job scheduling and mocked Web Lock acquisition/release.
- Assert diagnostics/telemetry never contain full usernames, username-bearing URLs, response bodies, or PGNs.

### Acceptance

- No application endpoint can be abused as a Chess.com proxy because none exists.
- Every request completes, aborts, or times out with exactly one typed result.
- A real preview-browser smoke request confirms `Access-Control-Allow-Origin: *` behavior without custom headers.
