# Ingestion / Result Normalization Implementation Spec

**Status:** Planning only  
**Source of truth:** `C:\Users\sheha\OneDrive\Desktop\report.md`, Issue 1  
**Cross-spec sequence:** Spec 1 of 4

## 1. Objective

Recognize Chess.com's documented `timevsinsufficient` result token as a draw, stop excluding otherwise valid games that contain it, and force stale account syncs to re-run under the corrected normalizer.

## 2. Current behavior

- `lib/chess/results.ts` parses the White and Black result strings through `CHESSCOM_RESULT_TOKENS` and `determineGameOutcome`.
- `timevsinsufficient` is absent from the token set. `determineGameOutcome` therefore returns an unknown-token result and ingestion logs `Unknown White player result token: 'timevsinsufficient'` (or the equivalent Black-side warning).
- `features/ingestion/ingestionService.ts` excludes a game when normalization cannot determine a supported outcome.
- A fresh sync marker can suppress a network refresh for up to 30 days, but `isSyncFresh` also compares the stored normalizer version with `NORMALIZER_VERSION`.
- Excluded games were never persisted, so they cannot be repaired from IndexedDB alone.

## 3. Root cause

The application's allow-list is incomplete. Chess.com documents `timevsinsufficient` as the result used when a player runs out of time but the opponent has insufficient mating material. The game is a draw. Because the parser is intentionally allow-list based, omission of that valid token makes it indistinguishable from an unsupported or malformed upstream value.

The investigation found no other documented Chess.com result token missing from `CHESSCOM_RESULT_TOKENS` at the time of the report. This is therefore a focused mapping defect, not a reason to weaken unknown-token validation.

## 4. Desired behavior

- `timevsinsufficient` is recognized for either color.
- Its outcome is always `draw`, independent of which player's result field contains the token.
- Truly unknown tokens remain rejected and continue to produce a diagnostic warning.
- A prior fresh sync performed by an older normalizer is treated as stale, causing an online refetch and recovery of previously excluded games.
- Offline behavior is explicit: previously excluded games remain unavailable until a later successful online sync.

## 5. Scope

- Add the missing Chess.com token mapping.
- Add unit and ingestion-level regression coverage for both player colors and token combinations found in Chess.com payloads.
- Increment the persisted normalizer version.
- Verify that version mismatch bypasses the 30-day freshness shortcut and that a successful sync writes the new version.
- Document the recovery behavior for previously excluded/cached account data in code comments or tests where the behavior is not self-evident.

## 6. Out of scope

- Retrofitting games that were never stored without contacting Chess.com.
- Accepting arbitrary result strings or converting the parser to a permissive default.
- Changing result semantics, win/loss statistics, or the database schema version.
- Persisting excluded raw API payloads for future reprocessing; that would be a separate ingestion resilience feature.
- Player metadata work from Spec 4, even though it later touches the same normalized record.

## 7. Affected files/components

Confirmed direct changes:

- `lib/chess/results.ts`
  - `CHESSCOM_RESULT_TOKENS`
  - `determineGameOutcome`
- `lib/db/schema.ts`
  - `NORMALIZER_VERSION`
- `features/ingestion/ingestionService.ts`
  - `isSyncFresh`
  - `normalizeRawGame`
  - sync marker persistence path
- `tests/unit/results.test.ts`

Expected regression-test updates, using the repository's existing test boundaries:

- ingestion DOM/service tests under `tests/dom/`
- schema/repository tests if they assert the normalizer constant or construct `GameRecord` fixtures
- shared game fixture builders that hard-code `normalizerVersion`

No change is expected in `lib/db/openDatabase.ts` because this is a normalization/cache invalidation change, not an IndexedDB object-store migration.

## 8. Data model/state changes

- Add `timevsinsufficient` to the existing result-token representation as a draw-producing token.
- Bump `NORMALIZER_VERSION` from `1` to `2` when this spec is implemented first.
- Do not bump `SCHEMA_VERSION`; the stored record shape is unchanged.
- New successful sync markers and normalized records use normalizer version `2`.

If another spec has already increased `NORMALIZER_VERSION`, use the next monotonic value rather than resetting it to `2`. The important invariant is that the corrected result mapping has a strictly newer version than every cache entry produced without it.

## 9. Detailed implementation approach

1. Extend the explicit token set in `lib/chess/results.ts` with `timevsinsufficient`.
2. Extend the draw branch in `determineGameOutcome` so the new token resolves to `draw` for either the White or Black result field. Preserve the current order of terminal-result checks and unknown-token reporting.
3. Do not add a generic fallback such as "all non-win/non-loss tokens are draws." The allow-list is useful protection against upstream changes and malformed data.
4. Increment `NORMALIZER_VERSION`. The existing `isSyncFresh` comparison then invalidates sync freshness without special-case deletion or database migration logic.
5. On the next online sync, let the existing archive fetch and normalization loop ingest the missing games and overwrite the sync marker with the new version.
6. Preserve current failure behavior when offline. Do not mark an old-version sync as current merely because the refetch failed; otherwise the omitted games could remain hidden for another freshness period.

**Design decision — token representation:** Keep the existing explicit token set and outcome logic rather than introducing a new mapping abstraction for one token. A token-to-semantic enum map could be useful later, but it is unnecessary churn for this focused fix.

## 10. Step-by-step implementation tasks

1. Add focused failing tests to `tests/unit/results.test.ts` for `timevsinsufficient` on White and on Black.
2. Add a test proving an unrelated unknown token is still rejected.
3. Update `CHESSCOM_RESULT_TOKENS` and the draw resolution in `determineGameOutcome`.
4. Add or update an ingestion fixture containing the new token and assert the game is included with `outcome: "draw"`.
5. Bump `NORMALIZER_VERSION` in `lib/db/schema.ts`.
6. Add or update freshness tests so an otherwise-fresh marker with the previous version triggers a network fetch.
7. Assert that the completed sync persists the new normalizer version.
8. Run the focused unit and ingestion suites, followed by the full test suite and type check.

## 11. Testing strategy

Unit tests:

- White `timevsinsufficient`, Black companion token from a representative payload: outcome is `draw`.
- Black `timevsinsufficient`, White companion token: outcome is `draw`.
- Unknown synthetic token: remains unknown and is not silently mapped to a draw.
- Existing win, loss, resignation, timeout, agreement, repetition, stalemate, and insufficient-material cases remain unchanged.

Ingestion tests:

- A raw Chess.com game with the token is normalized and included.
- The normalized record contributes a draw to downstream statistics.
- A fresh marker with normalizer version `1` is stale under version `2` and causes archive retrieval.
- A marker written after the successful run has the new version.
- A failed/offline refetch does not claim recovery or advance the marker incorrectly.

Verification commands should use the project's existing package scripts from `package.json`; do not introduce a one-off runner.

## 12. Regression cases

- Token appears on White, matching the observed warning.
- Token appears on Black.
- Both player result fields are otherwise valid but use different draw vocabulary.
- Case and whitespace behavior remains exactly as currently defined; do not silently normalize values unless existing contracts already do so.
- A genuinely new future Chess.com token still creates a visible diagnostic rather than becoming a draw.
- Previously persisted valid games are not duplicated when archives are refetched.
- The account that previously loaded 460 games may load additional recovered games; tests must not assume 460 is the correct final total.

## 13. Migration/versioning considerations

This fix relies on normalization version invalidation, not a database schema migration:

- Existing stored games remain valid and need no in-place rewrite.
- Previously excluded games do not exist in the database and require an online archive refetch.
- The old 30-day sync marker is bypassed because its `normalizerVersion` no longer matches.
- On a successful refetch, normal repository upsert behavior should add the recovered games without duplicating existing records.
- Users who remain offline will not see recovered games; the UI should retain its existing sync error behavior rather than pretending recovery occurred.

Spec 4 is expected to bump the normalizer again for player metadata, and Spec 3 may bump it again for optional upstream accuracy. Implementations must use monotonic values and update fixtures accordingly.

## 14. Dependencies

- No prerequisite production change.
- Shares `lib/db/schema.ts`, normalized game construction, ingestion fixtures, and cache-version expectations with Spec 4.
- Should land before Spec 4 so the intended version sequence is unambiguous: result normalization first, player metadata second.
- Spec 3's optional upstream accuracy ingestion should be versioned after both if implemented in the recommended overall order.

## 15. Risks and edge cases

- Bumping the version increases Chess.com archive traffic for users with otherwise-fresh caches. This is intentional and should occur once per account/version.
- Rate limiting or offline use can delay recovery; do not erase valid locally stored games before a successful replacement sync.
- Tests or fixtures that hard-code `NORMALIZER_VERSION === 1` will need mechanical updates.
- A permissive parser would conceal future upstream vocabulary changes. Preserve explicit validation.
- The exact pair of White/Black tokens in a draw payload can vary; outcome logic must not depend on the new token appearing on one fixed color.

## 16. Acceptance criteria

- No valid game is excluded solely because either player result is `timevsinsufficient`.
- The result is recorded as a draw.
- Both color positions are covered by automated tests.
- Unknown result tokens are still rejected and diagnosed.
- `NORMALIZER_VERSION` is strictly newer than the version that omitted this mapping.
- A previous-version fresh marker causes an online refetch; a successful refetch stores the current version.
- Existing result-token tests, ingestion tests, type checking, and the full relevant test suite pass.
- No production behavior outside result normalization and its intended cache refresh changes.

## 17. Recommended implementation order

Within this spec: tests for token semantics, mapping change, version bump, freshness/recovery tests, then full verification.

Across all four specs: implement this first. It is small, independently testable, and establishes the initial normalizer-version increment that Specs 4 and 3 must build on.
