# Phase 5 — Advanced Metrics and Production Verification

**Status:** Ready for implementation after the production MVP gate  
**Depends on:** Complete Phases 1–4 and their recorded baselines  
**Produces:** Evidence-based advanced opening insights and an audited production release.

## 1. Phase outcomes

At completion:

- all six advanced features derive from real, perspective-correct data and disclose sample/coverage limits;
- theory/repertoire data has explicit provenance and licensing or the feature is disabled;
- performance, security, accessibility, compatibility, privacy, operational, and deployment gates are recorded;
- release and rollback are repeatable;
- documentation matches the shipped feature set.

## 2. Global metric rules

Every advanced metric must:

1. define its perspective and denominator;
2. display sample size and any analysed-game coverage;
3. return `insufficient-data` rather than a fabricated number;
4. have configurable, versioned thresholds;
5. avoid causal language when it only describes correlation;
6. preserve filter context in its cache/snapshot key;
7. be reproducible from persisted source records;
8. have unit, fixture, and UI tests for missing data and threshold boundaries.

Default minimum path/move sample is 10 games. The UI allows stricter thresholds but not less than a documented absolute floor of 3, and labels low-sample exploratory views.

## 3. Task 5.1 — Statistical primitives

### Files

- Create `lib/metrics/statistics.ts`.
- Create `lib/metrics/config.ts` with a versioned schema.
- Create statistical unit/property tests.

### Requirements

Implement:

- expected score `(wins + 0.5 * draws) / games`;
- Wilson intervals for binomial views and a documented interval method for expected score where used;
- weighted means with explicit missing-value counts;
- sample qualification;
- stable ranking with ties and `insufficient-data` results;
- config serialization/versioning.

Avoid pseudo-precision. UI view models choose display rounding while domain metrics retain numeric precision.

### Tests first

- Empty, all-win, all-draw, all-loss, tiny, and large samples.
- Interval monotonicity and known reference values.
- Missing rating/evaluation data.
- Deterministic ranking and config migration.

### Acceptance

- All later metrics reuse these primitives rather than reimplementing denominators or confidence logic.

## 4. Task 5.2 — Repertoire leak ranking

### Files

- Create `lib/metrics/repertoireLeak.ts`.
- Create `components/tree/RepertoireLeakPanel.tsx`.
- Create metric and interaction tests.

### Definition

```text
moveScore = (userWins + 0.5 × draws) / games
leakPoints = max(0, baselineScore - moveScore) × games
```

Supported baseline modes:

- best qualified sibling move;
- weighted parent average;
- optional imported repertoire target.

Requirements:

- Exclude unqualified baselines and moves.
- Show baseline mode, move score, baseline score, game count, interval, and estimated leak points.
- Describe results as study-priority indicators, not guaranteed points caused by the move.
- Preserve query filters and user perspective.

### Tests first

- Draws contribute half a point.
- Better-than-baseline results clamp leak to zero.
- Unqualified best sibling does not become the baseline.
- Mixed player colours remain user-perspective correct.
- UI explains insufficient data.

### Acceptance

- No raw win-rate-only “EV” calculation remains.

## 5. Task 5.3 — Move-order vulnerability

### Files

- Create `lib/metrics/moveOrderVulnerability.ts`.
- Create `components/tree/MoveOrderComparison.tsx`.
- Create legal transposition fixtures with controlled outcomes.

### Definition

Compare qualified `arrivalsByPath` aggregates on the same normalized target position. For each pair, report expected-score difference, intervals, sample sizes, average opponent-rating difference, and configured practical threshold.

A path is flagged only when:

- both samples meet the minimum;
- the absolute expected-score difference meets the practical threshold, initially 0.15;
- the configured evidence rule is met;
- neither path result is hard-coded or inferred from frequency.

The result is an association. The UI must mention common confounders such as opponent strength, time control, era, and subsequent play.

### Tests first

- Two legal move orders reach one real FEN with distinct recorded outcomes.
- Frequency alone cannot produce a vulnerability result.
- Below-sample, below-effect, qualified, tie, and missing-rating cases.
- Reversing insertion order does not change comparison.

### Acceptance

- Comparison reads target arrival-path aggregates, not an outgoing edge’s path list.

## 6. Task 5.4 — Pragmatic matrix and analysed coverage

### Files

- Create `lib/metrics/pragmaticMatrix.ts`.
- Create `components/tree/PragmaticMatrixView.tsx`.
- Create tests joining graph moves to evaluation records.

### Requirements

- Join a move edge to an exact engine evaluation using position before, played move/target, engine build, and settings.
- Express engine value from the mover/user perspective as labelled.
- Use human expected score, not win rate alone.
- Require qualified human sample and a non-bound compatible engine evaluation.
- Put category thresholds in versioned config; initial labels may be pragmatic weapon, difficult practical choice, strong performer, and unclassified.
- Display engine settings and human sample with every category detail view.
- Report what fraction of candidate moves has compatible analysis.

### Tests first

- White and Black perspective joins.
- Missing/stale/different-settings evaluation.
- Threshold boundaries and overlapping rules resolved by explicit precedence.
- Inadequate human sample.

### Acceptance

- Category output is impossible without both real engine and human data.

## 7. Task 5.5 — Opening error heatmap

### Files

- Create `lib/metrics/errorHeatmap.ts`.
- Create board/tree heatmap overlays and coverage legend.
- Create tests for move-square aggregation and partial batches.

### Requirements

- Consume only eligible Phase 3 annotations.
- Aggregate by source position, move UCI, origin square, destination square, classification, and user/opponent actor as selected.
- Expose analysed games/eligible games and analysed moves/eligible moves.
- Never count unknown, bound, cancelled, or incompatible-version annotations as zero-error moves.
- Allow minimum-sample and classification filters.
- Use an accessible table alternative and non-colour-only legend.

### Tests first

- Promotions, castling, en passant, repeated squares, partial analysis, mixed accuracy versions, and perspective selection.
- Coverage changes when cached analysis is added.

### Acceptance

- A partial engine batch is visibly partial in every heatmap presentation.

## 8. Task 5.6 — Theory and repertoire departure

### Files

- Create `lib/theory/types.ts` and `TheoryProvider`.
- Create user-repertoire PGN provider.
- Optionally create bundled ECO provider and build-time index.
- Create `components/tree/TheoryDeparture.tsx`.
- Add data provenance/license records and tests.

### Provider contract

```typescript
interface TheoryProvider {
  id: string;
  version: string;
  find(positionKey: string): Promise<TheoryPosition | null>;
  metadata(): TheoryMetadata;
}
```

### Requirements

- User-imported repertoire PGN is parsed locally through the validated parser and is never uploaded.
- Bundled data, if shipped, has source URL, retrieval date, transformation script, content hash, compatible license, attribution, and update policy.
- Departure is the first ply whose resulting normalized position is absent from the selected provider after a provider-known parent.
- Distinguish “departure,” “provider has no coverage,” and “invalid/incomplete repertoire.”
- Recommendations come only from provider candidate moves or explicit engine analysis; they are labelled by source.
- If no compliant provider is configured, hide/disable the feature with an explanation. Do not synthesize theory.

### Tests first

- Known line, first-ply departure, transposed theory position, provider coverage ending, imported invalid PGN, and provider-version cache invalidation.
- License manifest/checksum required for bundled provider build.

### Acceptance

- No unlicensed master database or undocumented external API is introduced.

## 9. Task 5.7 — Rating-tier dynamics

### Files

- Create `lib/metrics/ratingTiers.ts`.
- Create tier controls/comparison view.
- Create tests for boundaries and missing ratings.

### Requirements

- Default tiers are configurable and non-overlapping: under 1400, 1400–1599, 1600–1799, and 1800+.
- Boundary semantics are explicit and tested.
- Missing opponent ratings belong to `unknown`, never zero.
- Each tier reports sample, expected score, interval, and average rating.
- Comparisons below sample threshold are descriptive-only or hidden according to config.
- Tier config participates in view/snapshot fingerprints.

### Acceptance

- Changing tiers recomputes from underlying records and cannot corrupt the base graph.

## 10. Task 5.8 — Security and privacy audit

### Checklist

- Threat-model direct cross-origin ingestion, upstream content, worker messages, IndexedDB, exports, dependencies, engine/data supply chain, and deployment configuration.
- Verify fixed URL construction, username/year/month validation, omitted credentials, CSP `connect-src`, timeout, streamed size caps, serial/cross-tab coordination, bounded 429 recovery, and normalized errors.
- Verify CSP, COOP/COEP, content type, referrer, and framing headers on production responses.
- Verify exported PGN/filenames cannot inject markup or unsafe filesystem characters.
- Verify no PGN, complete username, username-bearing request URL, or engine line enters telemetry by default.
- Run dependency audit and resolve exploitable production findings; document accepted risk with owner/expiry.
- Verify Stockfish and theory-data licenses/notices/source offers.
- Test clear-all and per-user deletion.
- Review Chess.com trademark/asset usage and unaffiliated disclaimer.

### Acceptance

- Audit report records scope, tools/manual checks, findings, owner, disposition, and date.
- No unresolved Critical or High security finding is released.

## 11. Task 5.9 — Performance and compatibility audit

### Reference workloads

- 1,000 and 10,000 typical games for parsing/graph build.
- A high-transposition synthetic/legal corpus for path-store stress.
- 40-, 80-, and 160-ply selected games for engine scheduling/cancellation.
- Warm/cold IndexedDB and evaluation-cache flows.

### Measurements

- worker duration, peak transferred/persisted graph size, UI long tasks, memory where supported, initial/lazy bundle sizes, cache hit rate, engine startup, time-to-first-evaluation, cancellation latency, and mobile thermal/resource behaviour.
- desktop Chromium/Firefox/WebKit and supported mobile browsers.
- threaded and forced single-thread engine modes.

### Gates

- No graph work creates a UI-thread task over 50 ms.
- Progress/cancel interaction remains responsive during the largest supported query.
- Regressions over 20% from the recorded reference baseline require investigation and explicit approval.
- Unsupported engine environments retain fully working ingestion/tree features.
- Storage pressure and eviction recover without data corruption.
- At the fixed node, edge, path, or 40-ply boundary, graph construction stops at a complete-game boundary and returns a correctly labelled `limited` result; 10,000 games remains a stress test outside the 5,000-game product cap.

### Acceptance

- Store a versioned benchmark report with machine/browser/build/settings.

## 12. Task 5.10 — Accessibility and E2E release suite

### Required browser journeys

1. Valid query → complete ingestion → tree navigation → transposition dialog.
2. Valid query → partial month failure → retry → complete.
3. Start query → cancel → submit new query without stale overwrite.
4. Offline reload → cached games/tree available with notice.
5. Select game → analyse → cancel → resume from cached evaluations.
6. Threaded capability and forced single-thread fallback.
7. Engine unavailable while tree remains usable.
8. Import repertoire → theory departure, and no-provider disabled state.
9. Advanced metric insufficient-data and qualified-data states.
10. Delete one username and then all local data.

Run axe against primary states and complete keyboard-only journeys. Verify zoom, reduced motion, focus restoration, live-region behaviour, non-colour classification, and mobile layouts.

Run the same primary journeys interactively with Playwright MCP against the release-candidate preview. Use it to inspect accessibility-tree output, focus movement, console/page errors, network failures, IndexedDB state transitions, worker/WASM startup, and responsive layouts. Record the revision and environment. Convert reproducible findings into committed Playwright/Vitest regressions; MCP observations do not replace the automated Chromium/Firefox/WebKit suite.

### Acceptance

- No serious/critical axe finding, console error, page error, or unhandled rejection.
- Tests assert meaningful results, not only that a heading exists.
- Playwright MCP verification notes are attached to the release evidence, with all material findings linked to a regression test or explicit disposition.

## 13. Task 5.11 — Deployment and operations

### Requirements

- Confirm the primary hosting plan and its current commercial-use/usage terms; record budget owner and capacity assumptions.
- Configure local, preview, and production environments without browser-exposed secrets.
- Configure CSP for the fixed PubAPI origin and any explicitly enabled redacted telemetry endpoint; no public PubAPI proxy or durable rate-limit service is deployed.
- Add health/smoke checks for document headers, direct PubAPI CORS connectivity, IndexedDB flow, graph worker, WASM asset, and single-thread fallback.
- Configure dependency/security update automation and scheduled live Chess.com contract test.
- Define alert ownership for client-reported PubAPI error/rate-limit spikes and deployment failure when optional redacted telemetry is enabled; otherwise document the manual monitoring process.
- Record immutable deployment revision and rollback procedure.
- Add a user-visible build/engine version in diagnostics/about UI.

### Acceptance

- Preview passes the exact production smoke suite.
- Playwright MCP verifies the same preview revision used by the release suite and records console/network/worker observations without using stored credentials or private data.
- Production post-deploy smoke passes and prior deployment rollback is verified/documented.
- Quota exhaustion returns a controlled user-facing error rather than an unexplained outage where platform facilities permit.

## 14. Final release gate

Release is approved only when:

- all global and phase tests pass from a clean lockfile install;
- implementation matches the canonical design and no superseded snippet remains in use;
- all advanced outputs are real, perspective-correct, sample-qualified, and coverage-labelled;
- no fixed analysis values or empty placeholder feature panels remain;
- security, privacy, dependency, engine-license, data-license, performance, browser, mobile, and accessibility reports are recorded;
- no unresolved Critical/High defect exists and Medium exceptions have owners and dates;
- hosting limits/budget, operational owner, post-deploy smoke, and rollback target are recorded;
- Playwright MCP release-candidate verification is recorded, while release approval remains grounded in committed automated tests;
- user documentation explains local storage, engine estimates, limitations, deletion, and lack of Chess.com affiliation.
