# Analysis Accuracy & Move Classification Implementation Spec

**Status:** Planning only  
**Source of truth:** `C:\Users\sheha\OneDrive\Desktop\report.md`, Issue 3  
**Cross-spec sequence:** Spec 3 of 4; highest regression risk

## 1. Objective

Correct the confirmed sources of overly generous local game accuracy, stabilize move-quality classification, tighten sacrifice and MultiPV heuristics, distinguish personal repertoire data from opening-book theory, preserve optional Chess.com accuracy as upstream metadata, and version all changed semantics without claiming to reproduce Chess.com's proprietary review algorithm.

## 2. Current behavior

For Chess.com game `173037119764` (`cmzulu` vs `iamSheyBoiCarti`), the local analyzer reports White 98.6% and Black 96.4%, while Chess.com's upstream `accuracies` field reports 93.11 and 72.15. The local classifications also disagree materially, including a Brilliant move that the report identified as a likely false positive.

The current pipeline:

- analyzes each position through Stockfish and stores White-relative scores;
- compares the position before and after a move from the mover's perspective;
- converts score to win probability with a fixed logistic curve;
- computes non-negative probability loss;
- converts each move to accuracy with the linear formula `100 * (1 - loss)`;
- averages move accuracy arithmetically per color;
- uses thresholds plus exact-best-move, MultiPV, mate, sacrifice, and personal-graph rules for the quality label;
- labels personal opening-graph frequency as `Book`;
- caches engine evaluations separately from the final review result.

The investigation found no evidence of a generic evaluation-sign inversion, side-to-move error, before/after reversal, ply offset, broken FEN chain, primary-PV UCI parsing defect, or incorrect centipawn-loss helper. The centipawn-loss helper is not the active game-accuracy calculation.

## 3. Root cause

### Confirmed accuracy cause

The active move formula is structurally too forgiving. A move that loses 0.10 expected-win probability still receives 90%, and the arithmetic mean lets many near-100 moves conceal a few consequential errors. This explains how Black can receive 96.4% despite multiple materially inferior moves. It is not merely a threshold mismatch.

The fixed score-to-probability curve also ignores player strength. Chess.com's current classifications use rating-aware expected-points concepts; therefore a fixed `400 cp = 10:1 odds` conversion cannot be assumed comparable across ratings.

### Confirmed or strongly evidenced classification causes

- **Best/Excellent instability:** exact engine-best UCI still requires an effectively zero independently searched child-position loss. Small search variance can demote the engine's named best move to Excellent.
- **Brilliant false positives:** `detectOfferedPieceSacrifice` only checks immediate capturability of a non-pawn and a simplistic material comparison. It does not establish a sound sacrifice, a best-line capture/recapture sequence, or compensation. This produced the suspicious `8.Nc3` Brilliant classification.
- **Great/MultiPV instability:** the adapter retains the deepest result for each PV index independently, while the classifier only accepts a second candidate at exactly the primary line's depth. A valid prior complete MultiPV set may be discarded in favor of an incomplete deepest snapshot.
- **Misleading Book label:** the category is derived from the user's personal opening graph and a frequency threshold of at least two occurrences, not a theoretical opening book.
- **Mate transition ordering:** a transition from a mate for the mover to a mate for the opponent can be reported as `missed` before `conceded`; the catastrophic outcome should take precedence.

### Not established as bugs

- Stockfish's primary evaluation parsing and White-relative score conversion.
- Mover-perspective conversion.
- Before/after move indexing or one-ply alignment.
- The existing centipawn-loss helper.
- Primary PV extraction.

These must be protected by tests, not rewritten without new evidence.

## 4. Desired behavior

- Local accuracy is explicitly named a **Local estimate** and responds nonlinearly to expected-points loss so consequential errors have meaningful weight.
- Score conversion has a documented expected-points contract and can accept rating context; no unvalidated coefficient is presented as Chess.com's formula.
- Exact engine-best UCI is stably classified Best unless a higher-priority terminal inconsistency makes the evaluation unusable.
- Brilliant requires evidence of a sound, voluntary material sacrifice in the engine line; simple en prise detection is insufficient.
- Great uses a coherent same-depth MultiPV candidate set.
- Personal opening familiarity is displayed as `Repertoire`, preferably as an orthogonal tag rather than replacing engine move quality.
- Optional Chess.com accuracies are preserved and displayed separately, never used as a prerequisite or input to local analysis.
- Mate transitions classify an opponent-mate concession before a missed own mate.
- Raw engine cache identity and analysis-heuristic identity are independently versioned.
- The investigated game becomes a deterministic regression fixture, but local output is not asserted to equal Chess.com exactly.

## 5. Scope

- Expected-points conversion and local move/game accuracy aggregation.
- Rating context plumbing where the model can use it honestly.
- Best, Excellent, Brilliant, Great, Repertoire, and mate-transition classification changes described above.
- Coherent MultiPV snapshot selection in the Stockfish adapter.
- Optional ingestion/persistence/display of Chess.com's `accuracies` field.
- User-facing terminology differentiating local estimates from upstream Chess.com values.
- Analysis heuristic and raw evaluation cache versioning.
- Unit, adapter, pipeline, UI, fixture, and cache regression tests.

## 6. Out of scope

- Exact cloning of Chess.com's proprietary algorithms, thresholds, labels, or UI.
- Treating Chess.com accuracy as ground truth for the local engine pipeline.
- Training or statistically fitting a rating-aware model without an approved calibration dataset.
- Changing Stockfish binary/build, search depth, thread count, hash size, or evaluation hardware assumptions unless targeted debugging later proves a defect.
- Reworking the FEN/PGN navigation pipeline without evidence.
- Persisting full completed analysis results if the current architecture only caches raw evaluations.
- Reclassifying historical Chess.com reviews server-side.

## 7. Affected files/components

Confirmed analysis files/functions from the investigation:

- `lib/engine/accuracy.ts`
  - move accuracy conversion
  - `classifyMove`
  - game accuracy aggregation
  - `ACCURACY_HEURISTIC_VERSION`
- `lib/engine/winProbability.ts`
  - score-to-probability conversion
  - mover-perspective probability and loss
- `lib/engine/stockfishAdapter.ts`
  - MultiPV line/depth collection and final snapshot selection
- `features/stockfish-analysis/analyzeGame.ts`
  - before/after evaluation pairing, second-PV construction, mate handling, and summary aggregation
- `lib/engine/evaluation.ts`
  - engine-score normalization
- `features/stockfish-analysis/bookMoves.ts`
  - personal opening-graph move keys
- analysis types defining `MoveQuality`, annotations, review summary/breakdown, evaluation lines, and heuristic metadata
- personal opening-graph helpers currently producing `bookMoveKeys`/Book classification
- `features/ingestion/ingestionService.ts`
  - `normalizeRawGame`, for optional upstream accuracy
- `lib/api/chesscomSchemas.ts`
  - raw Chess.com validation, which currently discards upstream `accuracies`
- `lib/api/contracts.ts`
  - normalized Chess.com game contracts
- `lib/db/schema.ts`
  - optional persisted accuracy and normalizer version
- repository validation/fixture builders for `GameRecord`
- `components/analysis/GameReviewSummaryCard.tsx`
- classification badges, legends, graph/list labels, and any review breakdown component using the `book` quality value
- `components/workspace/ChessWorkspace.tsx`, where the selected game and review summary are connected
- `features/workspace/browserServices.ts`
  - `ENGINE_EVALUATION_CACHE_VERSION = "analyzer-accuracy-v1"`

Expected tests include the existing accuracy, win-probability, analyzer, Stockfish adapter, cache, ingestion, schema/repository, and component suites plus new deterministic fixtures under the repository's test fixture structure.

Before implementation, the coding agent should use repository search to locate the exact analysis-orchestration and type filenames referenced by these confirmed function/type names. That lookup is navigation, not a new architectural investigation.

## 8. Data model/state changes

### Expected-points and accuracy model

Keep engine scores White-relative at the adapter/storage boundary. Introduce or clarify one canonical helper that returns expected points for the mover:

- inputs: `EngineScore`, mover color, and optional player rating/context;
- output: finite value in `[0, 1]`;
- mate scores: mapped monotonically to terminal expected points, without passing arbitrary mate integers through the centipawn logistic function.

Keep probability/expected-points loss as:

```text
loss = clamp(beforeExpectedPoints - afterExpectedPoints, 0, 1)
```

Replace the linear accuracy transform with a nonlinear, documented transform. Recommended initial function:

```text
accuracy = 100 * (exp(-5 * loss) - exp(-5)) / (1 - exp(-5))
```

Clamp to `[0, 100]`. This gives 100 at zero loss and 0 at total loss, while penalizing early loss more strongly. The constant `5` is a product/calibration choice, not a discovered Chess.com coefficient.

### Classification shape

Recommended representation:

- remove `book` from the mutually exclusive primary `MoveQuality` union;
- add an orthogonal annotation tag, initially `tags: Array<"repertoire">`;
- keep the engine-derived primary quality (`best`, `excellent`, `good`, `inaccuracy`, `mistake`, `blunder`, `great`, `brilliant`, etc.);
- count/display Repertoire separately from the primary-quality totals so totals still represent one quality per move.

This preserves the useful personal-history signal without concealing whether a familiar move was good or bad.

### Upstream accuracy

Add an optional value-object to raw/normalized/persisted game data, for example:

```ts
type SideAccuracy = {
  white: number;
  black: number;
};
```

Validate both values as finite numbers in `[0, 100]`. If the upstream object is absent or incomplete, store no object. Do not synthesize it and do not make it required in `GameRecord` validation.

### Version identities

- Increment `ACCURACY_HEURISTIC_VERSION` from `v2` to `v3` for new local accuracy and classification semantics.
- Keep heuristic version out of raw engine cache identity.
- Because coherent MultiPV snapshot selection changes the cached evaluation result shape/semantics, increment the raw engine-evaluation cache identity from the legacy `analyzer-accuracy-v1` value to a clearly named next value such as `engine-evaluation-v2`. If the existing cache schema calls this key `analysisVersion`, retain the persisted field name for compatibility but correct its comment and value semantics.
- Add optional upstream accuracy without an IndexedDB schema bump if no object-store/index change is needed. Bump `NORMALIZER_VERSION` so online refresh can populate the new optional field.

## 9. Detailed implementation approach

### A. Lock down invariants before changing formulas

Add tests proving, for both colors:

- score conversion remains White-relative at the engine boundary;
- mover expected points invert correctly for Black;
- before and after evaluations are paired with the same move/ply;
- loss is `before - after` from the mover's perspective and is clamped at zero;
- mate-for, mate-against, and centipawn transitions are monotonic;
- MultiPV does not affect the primary score used for accuracy.

These tests guard the areas the report found correct and prevent a speculative sign/index rewrite.

### B. Introduce a nonlinear local estimate

1. Rename internal concepts from generic `winProbability` where appropriate to expected points, while retaining compatibility wrappers if broad imports make a one-step rename risky.
2. Implement the nonlinear loss-to-accuracy transform as a pure tested helper.
3. Continue averaging per-move local estimates by color unless calibration work supplies evidence for a different aggregate. Include zero-move handling explicitly.
4. Label the result `Local estimate` in `GameReviewSummaryCard` and supporting text.
5. Do not tune the formula until the single investigated game equals 72.15. Verify general invariants and multiple fixtures instead.

**Design decision — nonlinear coefficient:** Recommended initial coefficient is `5`, with the formula above. It is transparent and materially corrects the linear compression, but it requires product approval or calibration against a broader fixture set before release. Changing it later requires another heuristic-version bump.

### C. Rating awareness

Thread White and Black rating context from normalized game metadata into the analysis request and expected-points conversion contract. Select the mover's rating per ply.

**Design decision — rating model:** Do not invent a rating coefficient in this implementation. Recommended first release: accept rating context in the API, record in tests that the neutral model is used when no validated calibration is configured, and keep behavior rating-neutral. A follow-up may add calibrated rating bands behind a new heuristic version. This is more honest than claiming rating awareness with fabricated constants. If the team already has an approved rating-to-expected-points model before implementation starts, substitute it and add calibration tests.

### D. Stabilize Best and Excellent

- After higher-priority terminal consistency checks and any special quality rules, classify `playedUci === bestMoveUci` as Best without also requiring epsilon-zero loss from a separately searched child position.
- Use expected-points loss thresholds to distinguish Excellent and lower categories for non-best moves.
- If the exact-best identity conflicts with an impossible mate transition or missing/corrupt evaluation, return the existing unknown/unavailable path rather than blindly awarding Best.
- Add search-noise fixtures in which exact best has a small positive child loss and remains Best.

### E. Tighten Brilliant

Replace immediate en-prise detection with a line-aware sound-sacrifice predicate. Recommended minimum evidence:

- the played move is exact best or within the accepted top band;
- the move does not lose enough expected points to be negative;
- the position was not already trivially won (recommended guard: before expected points below `0.95`);
- a non-pawn material concession is voluntary and visible after the opponent's best reply in the returned PV, not merely attackable on the first square;
- the mover retains meaningful compensation (recommended guard: after expected points at least `0.50`);
- material comparison includes the best-line reply and avoids mistaking a forced recapture sequence for a sacrifice.

If the PV is absent or too short to prove the sacrifice, do not classify Brilliant. The move can still be Best/Great.

This remains a heuristic improvement, not a guaranteed Chess.com Brilliant clone. The investigated `8.Nc3` must no longer be Brilliant under its deterministic fixture.

**Design decision — thresholds:** The `0.95` already-won guard and `0.50` compensation floor are recommended starting values. Treat them as named constants covered by fixtures, not hidden literals. Any later tuning bumps the heuristic version.

### F. Make MultiPV coherent for Great

In `stockfishAdapter.search`:

- track snapshots by search depth and MultiPV index;
- at `bestmove`, choose the deepest depth that contains all requested PV indices;
- if no complete set exists, return the deepest primary line and omit unavailable secondary lines rather than combining depths;
- guarantee that returned `EvaluationResult.lines` share one depth whenever more than one line is returned;
- keep the primary evaluation independent of secondary-line availability.

In `analyzeGame`, build Great/second-candidate context only from a coherent returned line set. Great can then compare the played move with the second line without an exact-depth race.

### G. Replace Book with Repertoire metadata

- Rename personal-graph collection helpers and UI vocabulary from Book to Repertoire.
- Preserve the existing frequency rule (at least two occurrences) unless separately specified; this spec changes meaning/representation, not frequency policy.
- Attach `repertoire` as an orthogonal tag before/alongside classification, rather than returning it as the primary quality.
- Display a Repertoire badge/tag and explain that it means previously seen in the loaded personal game set.
- Remove Book from the primary breakdown and add a separately labeled repertoire count if the summary needs it.

### H. Correct mate-transition precedence

Evaluate `after` terminal danger first: if a move changes the position to a forced mate for the opponent, classify it as mate conceded/the appropriate catastrophic quality. Only then check whether a prior mate for the mover was missed. Add both-color tests for mate-to-mate sign transitions.

### I. Preserve and display upstream accuracy

- Normalize Chess.com's optional `accuracies.white` and `.black` only when both are valid.
- Persist the optional object and pass it with the selected game's data to the summary UI.
- Show `Chess.com accuracy` separately from `Local estimate`, with White/Black labels.
- When absent, omit the upstream row without blocking analysis or showing an error.
- Never feed upstream values into local move accuracy, classifications, graph points, or completion status.

### J. Version and cache correctly

- New classification/formula semantics receive `ACCURACY_HEURISTIC_VERSION = v3`.
- Coherent MultiPV raw results receive the new raw evaluation cache version.
- Do not delete all cached Stockfish evaluations merely because presentation thresholds change; only the MultiPV semantic change requires raw-result invalidation here.
- If completed annotation summaries are later persisted, their cache key must include heuristic version. The current report indicates final classifications are recomputed while raw evaluations are cached.

## 10. Step-by-step implementation tasks

1. Add invariant tests for score sign, mover perspective, ply pairing, before/after loss, mate conversion, and primary-vs-MultiPV separation.
2. Add a checked-in, deterministic fixture for game `173037119764`: PGN/positions plus stable fake-engine `EvaluationResult` data for the reviewed plies. Do not call the live Chess.com API in tests.
3. Add targeted fixtures for exact-best search noise, sacrifice/recapture, incomplete MultiPV depth, and mate-to-mate transitions.
4. Implement the expected-points contract and pure nonlinear loss-to-accuracy helper.
5. Update per-move and per-color local aggregation; rename UI output to Local estimate.
6. Thread optional rating context without inventing a rating coefficient; document neutral fallback.
7. Stabilize exact-best classification and update Excellent tests.
8. Replace the Brilliant predicate with PV-aware sound-sacrifice evidence and add the `8.Nc3` regression.
9. Refactor Stockfish MultiPV collection to select the deepest complete snapshot; update Great construction/tests.
10. Convert personal Book classification into the orthogonal Repertoire tag and update types, collectors, badges, breakdowns, fixtures, and UI copy.
11. Correct mate-transition precedence.
12. Add optional Chess.com accuracy to contracts, normalization, persistence validation, selected-game flow, and summary display.
13. Increment heuristic, engine-evaluation cache, and normalizer versions at their appropriate boundaries.
14. Run focused pure-unit tests, adapter tests with mocked UCI streams, pipeline fixtures, ingestion/schema tests, component tests, type checks, and the complete suite.
15. Perform one non-gating manual comparison on the investigated game and record both local and upstream results; do not change constants solely to force equality.

## 11. Testing strategy

### Pure score and accuracy tests

- Zero loss is exactly 100; total loss is exactly 0; the function is finite, bounded, and strictly non-increasing.
- Representative losses such as `0.02`, `0.05`, `0.10`, and `0.20` match fixed snapshots for the approved coefficient.
- Black mover inversion mirrors White correctly.
- Improvement after a move produces zero loss, not accuracy above 100.
- Mate scores do not overflow, become `NaN`, or reverse ordering.
- Empty color move sets follow existing explicit behavior rather than dividing by zero.

### Classification tests

- Exact best remains Best with small independent-search loss.
- Non-best near-optimal move can be Excellent.
- `8.Nc3` from the investigated game is not Brilliant.
- A constructed sound, best-line non-pawn sacrifice can be Brilliant.
- An immediately attacked piece with a tactical recapture is not automatically Brilliant.
- Missing/short PV cannot prove Brilliant.
- Repertoire membership coexists with an engine primary quality.
- Mate conceded takes precedence over mate missed in the pathological transition.

### MultiPV adapter tests

- A complete depth `d` followed by only PV1 at `d+1` returns the complete set at `d` when multiple lines were requested.
- If no complete set ever arrives, the deepest primary line is returned alone.
- Returned multi-line depths match.
- Info lines arriving out of order do not mix depths.
- Accuracy uses the primary line and is unchanged by second-line absence; Great may be unavailable.

### Pipeline regression for game `173037119764`

- The fixture associates every evaluation with the intended FEN/ply and mover.
- Black's local estimate is materially below the old 96.4% and below White's for the fixture.
- The assertion does not require local Black accuracy to equal 72.15 or local White to equal 93.11.
- The known false Brilliant is removed.
- Known negative moves remain negative under reasonable heuristic changes.
- Upstream 93.11/72.15 is preserved and displayed verbatim to the chosen rounding precision under a Chess.com label.

### Persistence/UI tests

- Upstream accuracy present, absent, incomplete, non-finite, and out of range.
- Old records without accuracy remain valid.
- Local analysis completes without upstream accuracy.
- Summary clearly distinguishes the two sources.
- Heuristic version changes reclassify using available raw evaluations; raw cache version changes bypass incompatible MultiPV entries.

## 12. Regression cases

- White and Black move perspectives across positive and negative centipawn scores.
- Equal positions, improvements, small errors, large blunders, and already-lost positions.
- Centipawn-to-mate, mate-to-centipawn, mate shortened/lengthened, own-mate to opponent-mate, and both colors.
- Exact-best move with child-search drift.
- Two close MultiPV moves at complete and incomplete depths.
- Best line absent, PV too short, illegal/corrupt PV, and analysis cancellation.
- A personal repertoire move that is Best, and a repertoire move that is a Mistake.
- No player ratings, one missing rating, and both ratings available.
- Chess.com accuracy absent from older/archive payloads.
- Existing cached primary evaluations generated under the prior version.
- Determinism across repeated fake-engine runs.

## 13. Migration/versioning considerations

Three versions have distinct responsibilities:

1. **Normalizer version:** bump once to refetch/persist optional upstream `accuracies`. In the recommended overall sequence this follows Spec 4's player metadata bump, so it would move from `3` to `4`. If specs land in another order, use the next monotonic value.
2. **Accuracy heuristic version:** bump `v2` to `v3` because identical engine evaluations now produce different local estimates, primary labels, and tags.
3. **Raw engine-evaluation cache version:** bump to a clearly named `engine-evaluation-v2` identity because MultiPV snapshot selection changes which line set is stored/returned. Do not tie future threshold-only changes to this version.

Optional upstream accuracy does not require an IndexedDB `SCHEMA_VERSION` bump unless implementation adds an index or makes the field mandatory. Repository validation must accept old records with no field.

Previously cached raw evaluations may be reusable for pure formula/classification changes, but entries using old MultiPV semantics must be bypassed. Do not destructively clear unrelated caches if versioned lookup provides safe invalidation.

## 14. Dependencies

- Logically independent of Specs 1 and 2, but recommended after them due to complexity.
- Depends on explicit White/Black ratings from Spec 4 for clean rating-context plumbing. If implemented before Spec 4, use existing `userColor`, `userRating`, and `opponentRating` carefully and plan a follow-up simplification.
- Shares `lib/api/contracts.ts`, `lib/db/schema.ts`, ingestion normalization, repository validators, and fixture builders with Specs 1 and 4.
- Uses the compact classification/list UI introduced by Spec 2; Repertoire badge changes should target that component when Spec 2 is already complete.
- Chess.com upstream accuracy remains optional and cannot become a dependency for analysis start/completion.

## 15. Risks and edge cases

- A nonlinear formula can over-penalize ordinary inaccuracies or produce unintuitive averages. Approve/calibrate the coefficient across multiple games, not one comparison.
- Rating-aware modeling without validated coefficients would create false precision. The recommended neutral fallback is intentionally conservative.
- Stockfish output varies with build, search limits, hardware, and timing. Regression tests must use deterministic fake-engine data; live-engine comparisons are non-gating diagnostics.
- Exact best UCI can be unstable between searches. Stabilizing its label removes child-search epsilon drift but cannot make different searches choose the same best move.
- Sound sacrifice detection is inherently heuristic. Conservative false negatives are preferable to current false positives.
- Making Repertoire orthogonal changes breakdown totals and UI assumptions that currently expect exactly one `MoveQuality`. Update every exhaustive switch and snapshot.
- MultiPV completeness may cause Great to be omitted when the engine never supplies all requested lines. That is more accurate than combining incomparable depths.
- Upstream Chess.com accuracy can be absent, changed, or computed under a different engine/model. Display provenance and do not compare as a pass/fail gate.
- Version naming currently conflates analysis and engine cache identity; clarify comments without requiring a destructive database migration.
- The investigated game's PGN/evaluations may carry licensing or size concerns. Store only the minimal permitted fixture necessary for deterministic regression.

## 16. Acceptance criteria

- Local accuracy no longer uses `100 * (1 - loss)`.
- The approved nonlinear transform is pure, documented, bounded, monotonic, and comprehensively tested.
- UI calls the result Local estimate and never implies exact Chess.com equivalence.
- Optional upstream White/Black accuracy is persisted/displayed separately when present and ignored when absent.
- The investigated deterministic fixture produces Black materially below the former 96.4% and below White, without asserting exact 72.15 parity.
- Tests protect the confirmed-correct sign, perspective, before/after, ply, FEN, primary PV, and mate-score boundaries.
- Exact engine best is not demoted solely by tiny child-search loss.
- The investigated `8.Nc3` is not Brilliant; Brilliant requires PV-supported sound-sacrifice evidence.
- Returned MultiPV candidates are from one coherent depth, and Great handles missing secondary data safely.
- Personal graph membership is called Repertoire and does not replace primary engine quality.
- Mate-conceded precedence is correct for both colors.
- Heuristic, raw evaluation cache, and normalization versions are independently and monotonically updated.
- Focused, integration, UI, type, and full regression suites pass.

## 17. Recommended implementation order

Within this spec:

1. invariant and deterministic fixtures;
2. expected-points/local accuracy model;
3. Best/Excellent and mate precedence;
4. MultiPV/Great;
5. Brilliant;
6. Repertoire representation;
7. upstream accuracy persistence/display;
8. independent version bumps and full verification.

Across all specs: implement last, after Spec 4 provides explicit color-based ratings and Spec 2 provides the final annotation-list surface. This isolates the highest-risk semantic change from schema and layout work while still allowing it to consume their finished interfaces.
