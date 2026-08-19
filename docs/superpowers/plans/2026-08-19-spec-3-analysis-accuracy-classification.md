# Analysis Accuracy & Move Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct local game accuracy calculations with a nonlinear expected-points model, stabilize move-quality classification (Best/Excellent/Brilliant/Great/Mate), replace Book with orthogonal Repertoire metadata, preserve optional Chess.com upstream accuracies, and update version identities.

**Architecture:** A pure nonlinear expected-points to accuracy transform replaces the linear formula; Stockfish adapter enforces coherent MultiPV candidate depths; sound piece sacrifices are verified through PV analysis; Repertoire tagging is decoupled from primary engine quality classifications; upstream Chess.com accuracy is ingested, validated, persisted, and displayed as separate metadata.

**Tech Stack:** TypeScript, Next.js 15 (App Router), React 19, Vitest, chess.js, IndexedDB.

## Global Constraints

- Local accuracy formula: `accuracy = 100 * (exp(-5 * loss) - exp(-5)) / (1 - exp(-5))` clamped to `[0, 100]`.
- Label local estimates as "Local estimate" in user-facing UI.
- Upstream Chess.com accuracies: optional `SideAccuracy = { white: number; black: number }`, values in `[0, 100]`.
- Version constants: `ACCURACY_HEURISTIC_VERSION = 'analyzer-accuracy-v3'`, `ENGINE_EVALUATION_CACHE_VERSION = 'engine-evaluation-v2'`, `NORMALIZER_VERSION = 3`.
- Deterministic fixture for game `173037119764`: PGN/evaluations checked in, asserting Black local accuracy materially below 96.4% and below White, with no live API calls and no assertion of exact parity to Chess.com.
- Engine score convention remains White-relative; mover perspective conversion inverts score for Black.

---

### Task 1: Invariant Tests and Deterministic Game Fixture

**Files:**
- Create: `tests/fixtures/game173037119764Fixture.ts`
- Create: `tests/unit/engine/invariants.test.ts`
- Modify: `tests/unit/engine/accuracy.test.ts`

**Interfaces:**
- Consumes: `EvaluationScore`, `scoreToMoverWinProbability`, `classifyMoveAccuracy`, `toMoverPerspective`
- Produces: Deterministic test fixture and invariant test suite guarding score perspective, ply pairing, loss clamping, monotonic mate ordering, and primary/MultiPV separation.

- [ ] **Step 1: Write the failing invariant tests and fixture**

Create `tests/fixtures/game173037119764Fixture.ts` containing the minimal parsed game data and recorded evaluation results for game `173037119764` (cmzulu vs iamSheyBoiCarti, including the 8.Nc3 move).
Create `tests/unit/engine/invariants.test.ts` testing:
1. Score sign remains White-relative at the engine boundary.
2. Mover expected points invert correctly for Black.
3. Before and after evaluations are paired with the same move/ply.
4. Loss is `clamp(before - after, 0, 1)`.
5. Monotonic mate scoring for both colors.
6. MultiPV lines do not affect the primary score used for accuracy.

- [ ] **Step 2: Run invariant tests to verify baseline**

Run: `npx vitest run tests/unit/engine/invariants.test.ts`
Expected: PASS

- [ ] **Step 3: Commit invariant tests and fixture**

```bash
git add tests/fixtures/game173037119764Fixture.ts tests/unit/engine/invariants.test.ts
git commit -m "test(engine): add evaluation invariants and game 173037119764 fixture"
```

---

### Task 2: Nonlinear Expected-Points to Accuracy Model and Rating Plumbing

**Files:**
- Modify: `lib/engine/winProbability.ts`
- Modify: `lib/engine/accuracy.ts`
- Modify: `tests/unit/engine/winProbability.test.ts`
- Modify: `tests/unit/engine/accuracy.test.ts`

**Interfaces:**
- Consumes: `EvaluationScore`, `PlayerColor`
- Produces:
  - `lossToAccuracyEstimate(loss: number): number`
  - `scoreToMoverExpectedPoints(score: EvaluationScore, mover: PlayerColor, ratingContext?: { moverRating?: number | null }): number | null`
  - `scoreToMoverWinProbability` (backwards-compatible alias)

- [ ] **Step 1: Write failing tests for nonlinear lossToAccuracyEstimate and rating context**

Test `lossToAccuracyEstimate`:
- `lossToAccuracyEstimate(0) === 100`
- `lossToAccuracyEstimate(1) === 0`
- `lossToAccuracyEstimate(0.02)` is approx 90.48%
- `lossToAccuracyEstimate(0.05)` is approx 77.88%
- `lossToAccuracyEstimate(0.10)` is approx 60.65%
- `lossToAccuracyEstimate(0.20)` is approx 36.79%
- Monotonicity: `loss1 < loss2 => acc(loss1) >= acc(loss2)`
- Negative loss is clamped to 0 (acc = 100); loss > 1 is clamped to 1 (acc = 0)
Test rating context:
- Accepts `ratingContext` and falls back to neutral model.

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run tests/unit/engine/accuracy.test.ts tests/unit/engine/winProbability.test.ts`
Expected: FAIL due to missing `lossToAccuracyEstimate` and old linear accuracy formula.

- [ ] **Step 3: Implement nonlinear accuracy helper and expected points contract**

In `lib/engine/winProbability.ts`:
- Implement `scoreToMoverExpectedPoints` accepting rating context (neutral fallback documented).
- Map mate scores monotonically: positive mate = 1.0, negative mate = 0.0.
- Keep `scoreToMoverWinProbability` as alias.

In `lib/engine/accuracy.ts`:
- Implement `lossToAccuracyEstimate(loss: number): number`.
- Update `classified()` to calculate `accuracyEstimate = lossToAccuracyEstimate(probabilityLoss)`.
- Update `MoveContext` to accept optional `moverRating?: number | null`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/engine/accuracy.test.ts tests/unit/engine/winProbability.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/engine/winProbability.ts lib/engine/accuracy.ts tests/unit/engine/winProbability.test.ts tests/unit/engine/accuracy.test.ts
git commit -m "feat(engine): implement nonlinear accuracy estimate and rating plumbing"
```

---

### Task 3: Mate-Transition Precedence and Best/Excellent Stabilization

**Files:**
- Modify: `lib/engine/accuracy.ts`
- Modify: `tests/unit/engine/accuracy.test.ts`

**Interfaces:**
- Consumes: `MoveContext`, `classifyMoveAccuracy`, `classifyMateTransition`
- Produces:
  - Corrected mate precedence: opponent mate conceded checked before mover mate missed.
  - Stable exact-best move classification (engine best move `uci === bestMoveUci` is Best without child-search epsilon drift).

- [ ] **Step 1: Write failing tests for mate precedence and Best/Excellent**

In `tests/unit/engine/accuracy.test.ts`:
- Test transition where mover had mate-in-2, plays blunder allowing opponent mate-in-1: classifies as `conceded` / `blunder` (NOT `missed` / `miss`).
- Test Black mate-to-mate transition.
- Test exact best move with child-search noise (`bestMoveUci === uci`, `loss = 0.015`): classifies as `best`.
- Test non-best move with `loss = 0.015`: classifies as `excellent`.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/engine/accuracy.test.ts`
Expected: FAIL on mate precedence and search noise Best test.

- [ ] **Step 3: Implement mate-transition precedence and Best stabilization**

In `lib/engine/accuracy.ts`:
- In `classifyMateTransition`: check `!beforeOpponentMate && afterOpponentMate` (`'conceded'`) BEFORE `beforeOwnMate && !afterOwnMate` (`'missed'`).
- In `classifyMoveAccuracy`: when `uci === bestMoveUci`, classify as `'best'` without requiring `loss <= Number.EPSILON`, provided no terminal blunder/corruption exists. Non-best moves with `loss <= 0.02` become `'excellent'`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/engine/accuracy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/engine/accuracy.ts tests/unit/engine/accuracy.test.ts
git commit -m "fix(engine): correct mate transition precedence and stabilize best move classification"
```

---

### Task 4: MultiPV Coherence in StockfishAdapter and Great Move Classification

**Files:**
- Modify: `lib/engine/stockfishAdapter.ts`
- Modify: `tests/unit/stockfish/adapter.test.ts`
- Modify: `lib/engine/accuracy.ts`
- Modify: `tests/unit/engine/accuracy.test.ts`

**Interfaces:**
- Consumes: `UciInfo`, `EvaluationResult`, `EvaluationLine`
- Produces:
  - `StockfishAdapter.evaluate` returning `lines` strictly from a single coherent depth when MultiPV > 1.
  - If no complete depth snapshot exists, returns deepest primary line alone.
  - Great move classification requiring coherent MultiPV comparison.

- [ ] **Step 1: Write failing tests for coherent MultiPV snapshots**

In `tests/unit/stockfish/adapter.test.ts`:
- Test complete MultiPV at depth 12 followed by only MultiPV 1 at depth 13: adapter returns all lines at depth 12.
- Test no complete MultiPV set at any depth: returns deepest primary line only.
- Test all returned lines in `EvaluationResult.lines` share the same `depth`.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/stockfish/adapter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement coherent MultiPV snapshot selection**

In `lib/engine/stockfishAdapter.ts`:
- Track `snapshotsByDepth: Map<number, Map<number, EvaluationLine>>` and `deepestPrimary: EvaluationLine | undefined`.
- At `bestmove`, find maximum depth `d` where `snapshotsByDepth.get(d)?.size === requestedMultiPv`.
- If found, return lines from depth `d` sorted by `multiPv`. Otherwise return `[deepestPrimary]` (if exists) or available lines.
- Ensure all returned multi-lines share identical depth.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/stockfish/adapter.test.ts tests/unit/engine/accuracy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/engine/stockfishAdapter.ts tests/unit/stockfish/adapter.test.ts
git commit -m "feat(engine): enforce coherent same-depth MultiPV snapshots in Stockfish adapter"
```

---

### Task 5: PV-Aware Sound Sacrifice Predicate for Brilliant Classification

**Files:**
- Modify: `lib/engine/accuracy.ts`
- Modify: `tests/unit/engine/accuracy.test.ts`

**Interfaces:**
- Consumes: `fenBefore`, `uci`, `bestMoveUci`, `loss`, `beforeProb`, `afterProb`, `pv`
- Produces: `detectSoundPieceSacrifice` replacing shallow `detectOfferedPieceSacrifice`.

- [ ] **Step 1: Write failing tests for Brilliant classification**

In `tests/unit/engine/accuracy.test.ts`:
- Test `8.Nc3` from fixture: NOT Brilliant.
- Test constructed sound piece sacrifice where mover gives up material in PV, position was not already won (`beforeProb < 0.95`), and mover retains advantage (`afterProb >= 0.50`): classified as Brilliant.
- Test immediate tactical recapture sequence (forced trade): NOT Brilliant.
- Test absent or 1-ply PV: NOT Brilliant.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/engine/accuracy.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement sound piece sacrifice detection**

In `lib/engine/accuracy.ts`:
- Replace `detectOfferedPieceSacrifice` with `detectSoundPieceSacrifice(fenBefore: string, uci: string, pv?: readonly string[])`.
- Verify played move is non-pawn sacrifice where mover gives up material voluntarily in the principal variation line after the opponent's reply.
- Require `beforeProb < 0.95`, `afterProb >= 0.50`, `loss <= 0.02`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/engine/accuracy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/engine/accuracy.ts tests/unit/engine/accuracy.test.ts
git commit -m "feat(engine): implement PV-aware sound sacrifice detection for Brilliant moves"
```

---

### Task 6: Decouple Book into Orthogonal Repertoire Metadata

**Files:**
- Modify: `lib/engine/accuracy.ts`
- Modify: `features/stockfish-analysis/bookMoves.ts`
- Modify: `features/stockfish-analysis/analyzeGame.ts`
- Modify: `features/stockfish-analysis/presentation.ts`
- Modify: `components/board/MoveClassificationBadge.tsx`
- Modify: `components/analysis/GameReviewSummaryCard.tsx`
- Modify: `components/analysis/AnalysisMoveList.tsx`
- Modify: `tests/unit/stockfish-analysis/bookMoves.test.ts`
- Modify: `tests/unit/stockfish-analysis/analyzeGame.test.ts`
- Modify: `tests/unit/engine/accuracy.test.ts`
- Modify: `tests/dom/components/MoveClassificationBadge.test.tsx`
- Modify: `tests/dom/components/AnalyzerWorkspace.test.tsx`
- Modify: `tests/dom/workspace/workspaceController.test.ts`
- Modify: `tests/fixtures/longAnalysisFixture.ts`

**Interfaces:**
- Consumes: `SerializedOpeningGraph`, `GameAnnotation`, `MoveQuality`
- Produces:
  - `REVIEW_MOVE_QUALITIES` with 10 engine qualities (without 'book').
  - `MoveTag = 'repertoire'`, with `tags?: readonly MoveTag[]` on annotations and classified accuracy.
  - Repertoire helpers: `repertoireMoveKey`, `collectPersonalRepertoireMoveKeys` (with backwards compatibility aliases).
  - UI updated to display Repertoire orthogonally without distorting move quality totals.

- [ ] **Step 1: Write failing tests for Repertoire decoupling**

- Update `accuracy.test.ts`: verify `REVIEW_MOVE_QUALITIES` has 10 items without `'book'`. Repertoire move receives primary quality (e.g. `'best'`) and `tags: ['repertoire']`.
- Update `analyzeGame.test.ts`: repertoire moves retain engine quality and have `tags: ['repertoire']`.
- Update `bookMoves.test.ts`: test `repertoireMoveKey` and `collectPersonalRepertoireMoveKeys`.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/unit/stockfish-analysis/bookMoves.test.ts tests/unit/stockfish-analysis/analyzeGame.test.ts tests/unit/engine/accuracy.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement Repertoire tagging and update UI/types**

- Update `lib/engine/accuracy.ts`: remove `'book'` from `REVIEW_MOVE_QUALITIES`, add `MoveTag = 'repertoire'`, `tags?: readonly MoveTag[]` to `ClassifiedMoveAccuracy` and `MoveContext` (`isRepertoire?: boolean`).
- Update `features/stockfish-analysis/bookMoves.ts`: export `repertoireMoveKey`, `collectPersonalRepertoireMoveKeys`, and aliases.
- Update `features/stockfish-analysis/analyzeGame.ts`: thread `repertoireMoveKeys`, assign engine quality and `tags: ['repertoire']`.
- Update `features/stockfish-analysis/presentation.ts`: update metadata without `'book'`.
- Update `components/board/MoveClassificationBadge.tsx`, `GameReviewSummaryCard.tsx`, `AnalysisMoveList.tsx`.
- Update all tests and fixtures that previously expected `breakdown.book`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/unit/stockfish-analysis/bookMoves.test.ts tests/unit/stockfish-analysis/analyzeGame.test.ts tests/unit/engine/accuracy.test.ts tests/dom/components/MoveClassificationBadge.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/engine/accuracy.ts features/stockfish-analysis/bookMoves.ts features/stockfish-analysis/analyzeGame.ts features/stockfish-analysis/presentation.ts components/board/MoveClassificationBadge.tsx components/analysis/GameReviewSummaryCard.tsx components/analysis/AnalysisMoveList.tsx tests/
git commit -m "feat(analysis): decouple book into orthogonal repertoire metadata"
```

---

### Task 7: Upstream Chess.com Accuracy Ingestion, Persistence, and Display

**Files:**
- Modify: `lib/api/contracts.ts`
- Modify: `lib/api/chesscomSchemas.ts`
- Modify: `lib/db/schema.ts`
- Modify: `features/ingestion/ingestionService.ts`
- Modify: `components/analysis/GameReviewSummaryCard.tsx`
- Modify: `components/analysis/AnalyzerWorkspace.tsx`
- Modify: `components/workspace/ChessWorkspace.tsx`
- Modify: `tests/dom/ingestion/ingestionService.test.ts`
- Modify: `tests/dom/db/schema.test.ts`
- Modify: `tests/dom/components/AnalyzerWorkspace.test.tsx`

**Interfaces:**
- Consumes: `RawChesscomGame`, `SideAccuracy`
- Produces:
  - Validated optional `accuracies?: SideAccuracy` on `RawChesscomGame`, `NormalizedGameSummary`, and `GameRecord`.
  - Display of separate "Chess.com accuracy" and "Local estimate" in `GameReviewSummaryCard`.

- [ ] **Step 1: Write failing tests for upstream accuracy validation, persistence, and display**

In `tests/dom/ingestion/ingestionService.test.ts`:
- Ingest raw game with `accuracies: { white: 93.11, black: 72.15 }` -> normalized game has `accuracies: { white: 93.11, black: 72.15 }`.
- Ingest raw game without accuracies -> normalized game has `accuracies: undefined`.
- Ingest raw game with partial/invalid accuracies (e.g. non-finite or > 100) -> normalized game has `accuracies: undefined`.
In `tests/dom/db/schema.test.ts`:
- `isValidGameRecord` validates game with or without valid `accuracies`.
In `tests/dom/components/AnalyzerWorkspace.test.tsx`:
- Renders "Chess.com accuracy" when upstream accuracies are present, alongside "Local estimate".
- Renders only "Local estimate" when upstream accuracies are absent.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/dom/ingestion/ingestionService.test.ts tests/dom/db/schema.test.ts tests/dom/components/AnalyzerWorkspace.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement upstream accuracy validation, persistence, and UI display**

- In `lib/api/contracts.ts`: export `SideAccuracy = { white: number; black: number }`, add `accuracies?: SideAccuracy` to `NormalizedGameSummary`.
- In `lib/api/chesscomSchemas.ts`: validate optional `accuracies` with finite numbers in `[0, 100]`.
- In `lib/db/schema.ts`: add `accuracies?: SideAccuracy` to `GameRecord`, validate in `isValidGameRecord`.
- In `features/ingestion/ingestionService.ts`: normalize `raw.accuracies` in `normalizeRawGame`.
- In `components/analysis/GameReviewSummaryCard.tsx`: accept `upstreamAccuracies?: SideAccuracy`, display "Chess.com accuracy" and "Local estimate".
- In `components/analysis/AnalyzerWorkspace.tsx` and `ChessWorkspace.tsx`: pass `upstreamAccuracies` from selected game record.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/dom/ingestion/ingestionService.test.ts tests/dom/db/schema.test.ts tests/dom/components/AnalyzerWorkspace.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/api/contracts.ts lib/api/chesscomSchemas.ts lib/db/schema.ts features/ingestion/ingestionService.ts components/analysis/GameReviewSummaryCard.tsx components/analysis/AnalyzerWorkspace.tsx components/workspace/ChessWorkspace.tsx tests/
git commit -m "feat(ingestion): persist and display upstream Chess.com accuracy metadata"
```

---

### Task 8: Version Identity Bumps and Full Pipeline Verification

**Files:**
- Modify: `lib/engine/accuracy.ts` (`ACCURACY_HEURISTIC_VERSION = 'analyzer-accuracy-v3'`)
- Modify: `features/workspace/browserServices.ts` (`ENGINE_EVALUATION_CACHE_VERSION = 'engine-evaluation-v2'`)
- Modify: `lib/db/schema.ts` (`NORMALIZER_VERSION = 3`)
- Modify: `features/ingestion/ingestionService.ts`
- Create: `tests/unit/engine/game173037119764Regression.test.ts`
- Modify: Any test checking old version strings

**Interfaces:**
- Consumes: All updated components, deterministic fixture `173037119764`
- Produces:
  - Version constants updated at their independent boundaries.
  - End-to-end regression test for game `173037119764` confirming:
    - Black local estimate materially lower than 96.4% and below White.
    - 8.Nc3 is not Brilliant.
    - Upstream accuracy (93.11 / 72.15) preserved verbatim.

- [ ] **Step 1: Update version constants and write regression test**

- Update `ACCURACY_HEURISTIC_VERSION = 'analyzer-accuracy-v3'`.
- Update `ENGINE_EVALUATION_CACHE_VERSION = 'engine-evaluation-v2'`.
- Update `NORMALIZER_VERSION = 3`.
- Create `tests/unit/engine/game173037119764Regression.test.ts` running the full analysis pipeline on the checked-in fixture.

- [ ] **Step 2: Run regression test and complete test suite**

Run: `npx vitest run`
Expected: ALL test suites PASS.

- [ ] **Step 3: Run type check and lint**

Run: `npm run lint` and `npx tsc --noEmit`
Expected: No type or lint errors.

- [ ] **Step 4: Commit**

```bash
git add lib/engine/accuracy.ts features/workspace/browserServices.ts lib/db/schema.ts features/ingestion/ingestionService.ts tests/
git commit -m "chore(version): bump heuristic, cache, and normalizer versions and verify regression fixture"
```
