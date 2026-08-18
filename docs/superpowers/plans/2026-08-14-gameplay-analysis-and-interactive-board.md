# Gameplay Analysis & Interactive Chessboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-defined Game Review classifications, destination-square badges, a typed White/Black review summary, and controlled interactive board exploration for analysed games and opening-tree positions without claiming Chess.com parity.

**Architecture:** Keep Stockfish evaluation in the existing worker-backed engine service, then classify each move on the main thread after normalizing all required MultiPV candidate scores. Keep the board controlled by a parent-owned FEN: a pure chess.js move helper produces typed applied moves, a react-chessboard 5.12 wrapper owns only transient interaction state, and `ChessWorkspace` maps accepted moves into main-game, analysis-variation, or opening-navigation state. Compute review counts once in the analysis domain, preserve the existing accessible `ChessboardView` shell, and keep opening novelties as a single reversible local position rather than inserting them into the persisted graph.

**Tech Stack:** Next.js 16.3, React 19, `react-chessboard` 5.12.0, `chess.js` 1.4.0, TypeScript 5.7, Vitest 3.2, Testing Library, Playwright.

## Global Constraints

- Read the relevant guides in `node_modules/next/dist/docs/` before changing Client Component or lazy-loading boundaries. `InteractiveChessboard.tsx` must be an explicit `'use client'` boundary.
- Pin `react-chessboard` to exactly `5.12.0`; use its v5 `options` object API. Do not use v4 props such as `customSquareStyles`, `customArrows`, or `customBoardProps`.
- Preserve the existing board's labelled grid, eight rows, 64 gridcells, orientation semantics, local piece artwork, keyboard history navigation, invalid-FEN recovery, evaluation meter, and PV-arrow accessible name.
- `chess.js` is the only legality/FEN authority. react-chessboard renders interaction and must never own the canonical game position.
- Every accepted board move must include complete `fenBefore` and `fenAfter` values. Opening graph four-field keys must never be passed to engine or board APIs as complete FENs.
- All current 445 unit/DOM tests and all new tests must pass; do not assert that the final count remains exactly 445.
- Game Review copy must continue to identify scores as the project's “Analyzer accuracy estimate”; do not claim Chess.com affiliation, parity, or identical heuristics.
- Partial/cancelled analysis summaries must show their coverage and must not look complete.
- Invalid FENs, illegal moves, missing MultiPV candidates, discontinued PGNs, rejected parent moves, and stale graph references must produce controlled fallback behavior with no unhandled exceptions.
- Reuse `app/globals.css`, existing `.surface-panel`, `.modal`, `.modal-backdrop`, board sizing, focus-visible, responsive, high-contrast, and reduced-motion conventions.

---

### Task 1: Pin and Verify react-chessboard 5.12

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `package.json`

**Interfaces:**

- Consumes: React 19.0.0 and React DOM 19.0.0.
- Produces: `Chessboard`, `ChessboardOptions`, `PieceRenderObject`, `SquareRenderer`, and handler argument types from `react-chessboard` 5.12.0.

- [ ] **Step 1: Record the clean dependency baseline**

Run:

```powershell
npm test
npm run typecheck
```

Expected: the existing 445 tests pass and TypeScript exits with code 0 before the dependency is added.

- [ ] **Step 2: Install the exact package version**

Run:

```powershell
npm install --save-exact react-chessboard@5.12.0
```

Expected: `package.json` contains `"react-chessboard": "5.12.0"` and `package-lock.json` records its `@dnd-kit` transitive dependencies.

- [ ] **Step 3: Verify the installed v5 type surface**

Inspect `node_modules/react-chessboard/dist/index.d.ts` and confirm the implementation tasks below use this shape:

```tsx
<Chessboard
  options={{
    position: fen,
    boardOrientation: orientation,
    squareStyles,
    arrows,
    squareRenderer,
    onSquareClick: ({ square, piece }) => undefined,
    onPieceDrop: ({ sourceSquare, targetSquare, piece }) => false,
  }}
/>
```

Run:

```powershell
npm run typecheck
npm test
```

Expected: TypeScript exits with code 0 and all pre-existing tests pass.

- [ ] **Step 4: Commit the dependency pin**

```powershell
git add package.json package-lock.json
git commit -m "build: add react chessboard v5"
```

---

### Task 2: Define Analyzer Accuracy v2 and Deterministic Classification Rules

**Files:**

- Modify: `lib/engine/accuracy.ts`
- Modify: `tests/unit/engine/accuracy.test.ts`

**Interfaces:**

- Consumes: `EvaluationScore`, `PlayerColor`, `scoreToMoverWinProbability`, and legal move generation from `chess.js`.
- Produces:

```ts
export const ACCURACY_HEURISTIC_VERSION = 'analyzer-accuracy-v2';

export const REVIEW_MOVE_QUALITIES = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'blunder',
  'miss',
  'forced',
] as const;

export type MoveQuality = (typeof REVIEW_MOVE_QUALITIES)[number];
export type MateTransition = 'gained' | 'retained' | 'conceded' | 'missed';

export interface MoveContext {
  beforeScore: EvaluationScore;
  afterScore: EvaluationScore;
  mover: PlayerColor;
  fenBefore: string;
  uci: string;
  bestMoveUci?: string;
  secondBestScore?: EvaluationScore;
  isBook: boolean;
}

export interface ClassifiedMoveAccuracy {
  status: 'classified';
  quality: MoveQuality;
  mateTransition?: MateTransition;
  probabilityLoss: number;
  accuracyEstimate: number;
  heuristicVersion: typeof ACCURACY_HEURISTIC_VERSION;
}

export function classifyMoveAccuracy(
  input: MoveContext | ScoreComparison | ProbabilityComparison
): MoveAccuracy;
```

`ScoreComparison` and `ProbabilityComparison` remain supported so the existing probability-threshold and perspective tests stay valid.

**Classification rules, in order:**

1. Return `indeterminate` for bound, non-finite, or non-convertible scores exactly as v1 does.
2. Calculate and retain `mateTransition` independently of the display quality.
3. If the complete `fenBefore` has exactly one legal move and `uci` is that move, classify `forced`. A mate transition may still be attached.
4. If a forced mate for the mover was lost, classify `miss` with `mateTransition: 'missed'`.
5. If the move newly concedes mate, classify `blunder` with `mateTransition: 'conceded'`.
6. Classify `book` only when `isBook === true`, probability loss is at most 0.02, and no harmful mate transition occurred.
7. Classify `brilliant` only when the move equals `bestMoveUci`, loss is at most 0.02, mover probability after the move is at least 0.5, and `detectOfferedPieceSacrifice` returns true.
8. Classify `great` only when the move equals `bestMoveUci`, loss is at most 0.02, and the mover win probability of the root `beforeScore` is at least 0.15 higher than the mover win probability of a supplied exact `secondBestScore`. Comparing these two scores from the same root search avoids mixing separate-search noise. Missing MultiPV 2 means “not great.”
9. Classify `best` only when the move equals `bestMoveUci` and loss is at most `Number.EPSILON`. A zero-loss non-best move is `excellent`.
10. Use the existing exhaustive loss thresholds for `excellent`, `good`, `inaccuracy`, `mistake`, and `blunder`.
11. Also classify `miss` when mover probability before was at least 0.85 and loss is greater than 0.15, before the generic `blunder` result.

`detectOfferedPieceSacrifice(fenBefore, uci)` must:

- Parse and legally apply the UCI move, including promotion suffixes.
- Return false for invalid FEN, invalid UCI, illegal moves, pawns, kings, castling, and promotions.
- Record the moved piece value and captured piece value before applying the move.
- After the move, enumerate legal opponent captures whose destination is the moved piece's destination square.
- Return true only when at least one such capture exists and the offered piece value is greater than the value captured by the played move.
- Leave soundness to the best-move and evaluation-preservation requirements; do not attempt recursive exchange evaluation in v2.

- [ ] **Step 1: Write failing classification tests**

Add typed cases to `tests/unit/engine/accuracy.test.ts`:

```ts
it('detects the offered bishop in Bxh7+ instead of comparing immediate material totals', () => {
  expect(
    classifyMoveAccuracy({
      beforeScore: { kind: 'cp', value: 350 },
      afterScore: { kind: 'cp', value: 380 },
      mover: 'white',
      fenBefore: 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 1',
      uci: 'd3h7',
      bestMoveUci: 'd3h7',
      isBook: false,
    })
  ).toMatchObject({ quality: 'brilliant' });
});

it('does not call an offered piece brilliant when it was not the engine best move', () => {
  expect(
    classifyMoveAccuracy({
      beforeScore: { kind: 'cp', value: 350 },
      afterScore: { kind: 'cp', value: 380 },
      mover: 'white',
      fenBefore: 'r1bq1rk1/ppp2ppp/2n1pn2/3p4/2PP4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 1',
      uci: 'd3h7',
      bestMoveUci: 'c4d5',
      isBook: false,
    })
  ).not.toMatchObject({ quality: 'brilliant' });
});

it('does not infer great without a second candidate', () => {
  expect(
    classifyMoveAccuracy({
      beforeScore: { kind: 'cp', value: 300 },
      afterScore: { kind: 'cp', value: 300 },
      mover: 'white',
      fenBefore: '8/8/4k3/8/8/4K3/4R3/8 w - - 0 1',
      uci: 'e2e1',
      bestMoveUci: 'e2e1',
      isBook: false,
    })
  ).toMatchObject({ quality: 'best' });
});
```

Add cases for forced move, book loss guard, great with MultiPV 2, zero-loss non-best move, mate gained/retained/conceded/missed metadata, 85%-probability miss, invalid FEN, illegal UCI, black perspective, exact threshold boundaries, promotion, and ordinary material-winning captures.

- [ ] **Step 2: Run the focused test and observe failure**

```powershell
npx vitest run tests/unit/engine/accuracy.test.ts
```

Expected: failures mention missing v2 qualities/context and mate-transition behavior.

- [ ] **Step 3: Implement the v2 classifier and offered-piece detector**

Keep score validation and probability conversion as separate helpers. Parse UCI with:

```ts
const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
```

Wrap FEN construction and `chess.move` in a controlled `try/catch`; heuristic helpers return false for malformed board context rather than throwing.

- [ ] **Step 4: Run classification and engine-domain tests**

```powershell
npx vitest run tests/unit/engine/accuracy.test.ts tests/unit/engine/engineDomainCoverage.test.ts tests/unit/engine/winProbability.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the classifier domain**

```powershell
git add lib/engine/accuracy.ts tests/unit/engine/accuracy.test.ts
git commit -m "feat: define analyzer accuracy v2"
```

---

### Task 3: Feed MultiPV and Personal-Book Evidence Through Real Game Analysis

**Files:**

- Create: `features/stockfish-analysis/bookMoves.ts`
- Modify: `features/stockfish-analysis/analyzeGame.ts`
- Modify: `lib/chess/graph/openingGraph.ts`
- Modify: `features/workspace/createWorkspaceController.ts`
- Modify: `features/workspace/browserServices.ts`
- Modify: `tests/unit/stockfish-analysis/analyzeGame.test.ts`
- Create: `tests/unit/stockfish-analysis/bookMoves.test.ts`
- Modify: `tests/unit/chess/graph/openingGraph.test.ts`
- Modify: `tests/dom/workspace/workspaceController.test.ts`

**Interfaces:**

- Consumes: cached/live `EvaluationResult.lines`, selected-game UCI/FEN data, and the serialized personal opening graph.
- Produces:

```ts
export interface PositionCandidate {
  multiPv: number;
  score: EvaluationScore;
  depth: number;
  pv: readonly string[];
}

export interface PositionEvaluation {
  score: EvaluationScore;
  depth: number;
  pv: readonly string[];
  bestMove: string;
  candidates: readonly PositionCandidate[];
}

export type MoveBreakdown = Record<MoveQuality, number>;

export interface ColorAnalysisSummary {
  accuracyEstimate: number | null;
  eligibleMoves: number;
  excludedMoves: number;
  breakdown: MoveBreakdown;
}

export function bookMoveKey(positionKey: string, uci: string): string;
export function collectPersonalBookMoveKeys(
  snapshot: SerializedOpeningGraph | null,
  minimumGames?: number
): readonly string[];
```

Personal-book policy: first make `MoveEdge.aggregate.games` a distinct-game count by allowing each source-position/UCI edge to receive at most one aggregate visit from a given game. An edge then qualifies only when `edge.aggregate.games >= 2`. If the selected game was included it contributes at most one, so the threshold requires at least one other ingested game; if it was omitted by a resource limit, the edge already represents two other games. Missing/limited graphs are allowed, and only included edges qualify. The key is `${fourFieldPositionKey}\u0000${uci}`.

Change `WorkspaceServices.analysis.analyze` to accept this context before the abort signal:

```ts
context: { bookMoveKeys: readonly string[] }
```

`analyzeGame` accepts `bookMoveKeys?: ReadonlySet<string>`. It derives the key from `ply.positionBefore` and `ply.uci` and passes `isBook` to `classifyMoveAccuracy`.

- [ ] **Step 1: Write failing personal-book tests**

In `bookMoves.test.ts`, create a serialized fixture with one edge at one game and one edge at two games:

```ts
expect(collectPersonalBookMoveKeys(snapshot)).toEqual([`${snapshot.rootKey}\u0000e2e4`]);
expect(collectPersonalBookMoveKeys(null)).toEqual([]);
```

Also assert deterministic sorting and that a limited snapshot still returns only its included qualifying edges.

- [ ] **Step 2: Write a failing distinct-game edge aggregation test**

In `openingGraph.test.ts`, build one legal game that returns to the same position and traverses the same source/UCI edge twice inside the opening horizon. Assert that the edge aggregate has `games === 1`, while two different games traversing it produce `games === 2`. Candidate sample sizes must represent games, not repeated visits from one game.

- [ ] **Step 3: Write failing analysis-pipeline tests**

Extend the engine fixture so the root result contains MultiPV 1 and 2 with distinct scores. Assert:

```ts
expect(result.annotations[0]?.before.candidates).toHaveLength(2);
expect(result.annotations[0]?.accuracy).toMatchObject({ quality: 'great' });
expect(result.summary.white.breakdown.great).toBe(1);
```

Add a separate one-line result asserting the same best move becomes `best`, not `great`. Add typed assertions for book evidence, zero-filled breakdown keys, partial results, indeterminate exclusions, and terminal positions with `candidates: []`.

- [ ] **Step 4: Run the focused tests and observe failure**

```powershell
npx vitest run tests/unit/chess/graph/openingGraph.test.ts tests/unit/stockfish-analysis/bookMoves.test.ts tests/unit/stockfish-analysis/analyzeGame.test.ts tests/dom/workspace/workspaceController.test.ts
```

Expected: failures mention missing book helpers, candidates, breakdown, and analysis context.

- [ ] **Step 5: Count every graph edge at most once per game**

In `OpeningGraphBuilder.addGame`, keep a per-game `visitedEdges` set keyed by `${source.key}\u0000${ply.uci}`. Call `addVisit(edge.aggregate, visit)` only the first time that game traverses the edge. Continue to intern every path move and preserve existing node behavior; this change only makes the edge “Games” metric truthful.

- [ ] **Step 6: Normalize every usable MultiPV line**

Replace `normalizePrimaryLine` with a normalizer that:

- Requires a valid MultiPV 1 line for non-terminal positions.
- Normalizes every exact line to White perspective using the root FEN.
- Sorts candidates by `multiPv`.
- Preserves primary `score`, `depth`, and `pv` fields for existing UI consumers.
- Treats a missing/unusable MultiPV 2 as absent rather than failing analysis.

Pass this exact classification context:

```ts
const secondBestScore = before.candidates.find(({ multiPv }) => multiPv === 2)?.score;
const accuracy = classifyMoveAccuracy({
  beforeScore: before.score,
  afterScore: after.score,
  mover,
  fenBefore: ply.fenBefore,
  uci: ply.uci,
  bestMoveUci: before.bestMove,
  ...(secondBestScore ? { secondBestScore } : {}),
  isBook: input.bookMoveKeys?.has(bookMoveKey(ply.positionBefore, ply.uci)) ?? false,
});
```

- [ ] **Step 7: Compute the breakdown once in the analysis domain**

Initialize every `REVIEW_MOVE_QUALITIES` key to zero and increment only classified annotations for the matching mover. Keep accuracy means and eligible/excluded counts in the same `summarizeColor` pass. Do not add a second aggregation function to `presentation.ts`.

- [ ] **Step 8: Wire graph evidence through the workspace service**

In `startAnalysis`, compute `collectPersonalBookMoveKeys(state.graph.snapshot)` and pass the array to the service. In `browserServices`, convert it to `new Set(context.bookMoveKeys)` for `analyzeGame`.

Do not use the new `ACCURACY_HEURISTIC_VERSION` as the raw Stockfish cache identity. Preserve the existing serialized cache value behind a separately named legacy constant so current raw engine evaluations remain reusable:

```ts
// Legacy serialized value retained only as the raw evaluation cache identity.
const ENGINE_EVALUATION_CACHE_VERSION = 'analyzer-accuracy-v1';
```

Pass `ENGINE_EVALUATION_CACHE_VERSION` to `settings.analysisVersion`; the annotation's `accuracy.heuristicVersion` independently carries `analyzer-accuracy-v2`. A future cache-schema migration may rename the field without coupling it to classifier releases.

- [ ] **Step 9: Run the focused tests**

```powershell
npx vitest run tests/unit/chess/graph/openingGraph.test.ts tests/unit/stockfish-analysis/bookMoves.test.ts tests/unit/stockfish-analysis/analyzeGame.test.ts tests/unit/stockfish-analysis/evaluationCache.test.ts tests/dom/workspace/workspaceController.test.ts
```

Expected: all focused tests pass, including cache-resume behavior.

- [ ] **Step 10: Commit the real analysis integration**

```powershell
git add features/stockfish-analysis/bookMoves.ts features/stockfish-analysis/analyzeGame.ts lib/chess/graph/openingGraph.ts features/workspace/createWorkspaceController.ts features/workspace/browserServices.ts tests/unit/chess/graph/openingGraph.test.ts tests/unit/stockfish-analysis/bookMoves.test.ts tests/unit/stockfish-analysis/analyzeGame.test.ts tests/dom/workspace/workspaceController.test.ts
git commit -m "feat: classify analysed games with multipv context"
```

---

### Task 4: Add Typed Review Presentation and the Summary Card

**Files:**

- Create: `components/board/MoveClassificationBadge.tsx`
- Create: `components/analysis/GameReviewSummaryCard.tsx`
- Modify: `components/analysis/AnalyzerWorkspace.tsx`
- Modify: `components/analysis/EngineAnnotationPanel.tsx`
- Modify: `features/stockfish-analysis/presentation.ts`
- Modify: `app/globals.css`
- Modify: `tests/unit/stockfish-analysis/presentation.test.ts`
- Create: `tests/dom/components/MoveClassificationBadge.test.tsx`
- Modify: `tests/dom/components/AnalyzerWorkspace.test.tsx`

**Interfaces:**

- Consumes: `MoveQuality`, `GameAnalysisSummary`, and typed `GameAnnotation` fixtures.
- Produces:

```ts
export interface MoveQualityDetails {
  label: string;
  symbol: string;
  colorClass: string;
  description: string;
}

export function moveQualityDetails(quality: MoveQuality): MoveQualityDetails;

export function MoveClassificationBadge(props: {
  quality: MoveQuality;
  size?: 'inline' | 'square' | 'summary';
}): React.JSX.Element;

export function GameReviewSummaryCard(props: { result: GameAnalysisResult }): React.JSX.Element;
```

Required qualities and symbols: Brilliant `!!`, Great `!`, Best `★`, Excellent `✓✓`, Good `✓`, Book `♟` with accessible label “Book move”, Inaccuracy `?!`, Mistake `?`, Blunder `??`, Miss `✕`, Forced `□`. Avoid emoji rendering differences in visual snapshots.

- [ ] **Step 1: Write failing metadata and badge tests**

Use `it.each(REVIEW_MOVE_QUALITIES)` to assert non-empty label, symbol, class, and description. Render every badge and assert `role="img"` and `${label} move` accessible text. Do not use `as any`; create a typed `GameAnnotation` fixture helper.

- [ ] **Step 2: Write failing summary-card tests**

Extend `AnalyzerWorkspace.test.tsx` with a complete result and a partial result. Assert all eleven rows, White/Black accuracy, zero counts, partial coverage text, and inline badges in annotation headings.

- [ ] **Step 3: Run the focused tests and observe failure**

```powershell
npx vitest run tests/unit/stockfish-analysis/presentation.test.ts tests/dom/components/MoveClassificationBadge.test.tsx tests/dom/components/AnalyzerWorkspace.test.tsx
```

- [ ] **Step 4: Implement presentation-only metadata and components**

Keep aggregation out of `presentation.ts`. `GameReviewSummaryCard` receives the already-computed `GameAnalysisResult`, renders a semantic table with `White` and `Black` column headers, and shows:

```tsx
Coverage: {result.analyzedPlies} of {result.totalPlies} eligible plies
```

when `result.status !== 'complete'`.

- [ ] **Step 5: Add design-system styles**

Add `.move-classification-badge`, size modifiers, per-quality color classes, `.game-review-summary`, responsive table overflow, visible focus behavior, and forced-colors fallbacks to `app/globals.css`. Use text/symbol plus color; color alone must not convey quality.

- [ ] **Step 6: Run the focused tests**

```powershell
npx vitest run tests/unit/stockfish-analysis/presentation.test.ts tests/dom/components/MoveClassificationBadge.test.tsx tests/dom/components/AnalyzerWorkspace.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit review presentation**

```powershell
git add components/board/MoveClassificationBadge.tsx components/analysis/GameReviewSummaryCard.tsx components/analysis/AnalyzerWorkspace.tsx components/analysis/EngineAnnotationPanel.tsx features/stockfish-analysis/presentation.ts app/globals.css tests/unit/stockfish-analysis/presentation.test.ts tests/dom/components/MoveClassificationBadge.test.tsx tests/dom/components/AnalyzerWorkspace.test.tsx
git commit -m "feat: present typed game review summaries"
```

---

### Task 5: Create the Pure Controlled-Board Move Domain

**Files:**

- Create: `features/board/moves.ts`
- Create: `tests/unit/board/moves.test.ts`

**Interfaces:**

- Consumes: complete six-field FENs and `chess.js`.
- Produces:

```ts
import type { Square } from 'chess.js';

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface BoardMoveIntent {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}

export interface AppliedBoardMove extends Required<Pick<BoardMoveIntent, 'from' | 'to'>> {
  promotion?: PromotionPiece;
  uci: string;
  san: string;
  fenBefore: string;
  fenAfter: string;
}

export function legalDestinations(fen: string, from: Square): readonly Square[];
export function promotionRequired(
  fen: string,
  intent: Pick<BoardMoveIntent, 'from' | 'to'>
): boolean;
export function applyBoardMove(fen: string, intent: BoardMoveIntent): AppliedBoardMove | null;
```

All three functions catch invalid FEN and illegal move failures. They return `[]`, `false`, or `null`; they never mutate a shared `Chess` instance.

- [ ] **Step 1: Write failing move-domain tests**

Cover these exact positions:

```ts
const initial = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const castling = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
const enPassant = '8/8/8/3pP3/8/8/8/K6k w - d6 0 2';
const promotion = '7k/P7/8/8/8/8/8/K7 w - - 0 1';
```

Assert e2→e4 produces UCI `e2e4`, SAN `e4`, and a complete changed FEN; e1→g1 moves the rook; e5→d6 captures en passant; a7→a8 requires promotion and `a7a8q` succeeds; illegal and malformed inputs return null. Also assert legal destinations are deduplicated across the four promotion variants.

- [ ] **Step 2: Run the focused test and observe failure**

```powershell
npx vitest run tests/unit/board/moves.test.ts
```

- [ ] **Step 3: Implement the pure helpers**

Build a fresh `Chess(fen)` per call. For `applyBoardMove`, return the original canonical `chess.fen()` as `fenBefore`, apply one move, and return the resulting `chess.fen()` as `fenAfter`. UCI is `${from}${to}${promotion ?? ''}`.

- [ ] **Step 4: Run the focused test**

```powershell
npx vitest run tests/unit/board/moves.test.ts tests/unit/board/position.test.ts tests/unit/chess/fen.test.ts
```

Expected: all focused board/FEN tests pass.

- [ ] **Step 5: Commit the board domain**

```powershell
git add features/board/moves.ts tests/unit/board/moves.test.ts
git commit -m "feat: add controlled board move domain"
```

---

### Task 6: Integrate an Accessible react-chessboard Surface and Promotion Flow

**Files:**

- Create: `components/board/InteractiveChessboard.tsx`
- Create: `components/board/AccessibleBoardGrid.tsx`
- Create: `components/board/PromotionDialog.tsx`
- Modify: `components/board/ChessboardView.tsx`
- Modify: `components/board/Piece.tsx` only if a typed react-chessboard piece adapter cannot reuse it unchanged
- Modify: `app/globals.css`
- Create: `tests/dom/components/InteractiveChessboard.test.tsx`
- Create: `tests/dom/components/PromotionDialog.test.tsx`
- Modify: `tests/dom/components/ChessboardView.test.tsx`

**Interfaces:**

- Consumes: `AppliedBoardMove`, `applyBoardMove`, `legalDestinations`, `promotionRequired`, `MoveClassificationBadge`, and react-chessboard v5 options.
- Produces:

```ts
export interface InteractiveChessboardProps {
  fen: string;
  orientation: 'white' | 'black';
  isInteractive?: boolean;
  onMove?(move: AppliedBoardMove): boolean;
  lastMove?: { from: Square; to: Square };
  lastMoveBadge?: { square: Square; quality: MoveQuality };
  pvArrow?: { from: Square; to: Square };
}

export interface MoveHistoryModel {
  currentPly: number;
  totalPlies: number;
  onPlyChange(ply: number): void;
}

export interface ChessboardViewProps extends InteractiveChessboardProps {
  history?: MoveHistoryModel;
  evaluationScore?: EvaluationScore;
}
```

`InteractiveChessboard` owns only the aria-hidden visual board, selected square, legal-target highlights, and pending promotion. `AccessibleBoardGrid` retains the existing semantic rows/cells/piece labels without duplicating interaction state. `ChessboardView` continues to own the labelled focusable grid, board region, evaluation bar, keyboard history handler, invalid-FEN fallback, legal-destination live text, and optional history controls.

- [ ] **Step 1: Write the failing wrapper tests using the v5 options contract**

Mock `react-chessboard` with a test component that renders 64 buttons from the supplied `options.position`, calls `options.squareRenderer`, and invokes object-shaped `onSquareClick`/`onPieceDrop` arguments. Do not use `getByRole(...) || getByTestId(...)`.

Assert:

- Clicking e2 then e4 emits one complete `AppliedBoardMove`.
- Clicking a non-mover or illegal destination emits nothing.
- Legal dots clear after FEN, orientation, or interactivity changes.
- A parent returning false leaves the controlled FEN unchanged.
- Drag and click paths emit the same applied move.
- `targetSquare: null` returns false.
- The visual destination badge and PV arrow use v5 `squareRenderer` and `arrows`.
- `allowDragging` and `canDragPiece` prevent interaction when read-only or when the piece is not the side to move.

- [ ] **Step 2: Write failing promotion-dialog tests**

Assert a7→a8 without a suffix opens a modal and the drop callback returns false. Selecting Knight emits UCI `a7a8n`; Escape emits nothing; focus returns to the invoking square; Tab stays inside the four promotion choices and Cancel control. Repeat with a black capture-promotion fixture.

- [ ] **Step 3: Run the focused tests and observe failure**

```powershell
npx vitest run tests/dom/components/InteractiveChessboard.test.tsx tests/dom/components/PromotionDialog.test.tsx tests/dom/components/ChessboardView.test.tsx
```

- [ ] **Step 4: Implement the explicit Client Component wrapper**

Start `InteractiveChessboard.tsx` with `'use client'`. Pass one v5 `options` object:

```tsx
<Chessboard
  options={{
    id: 'analysis-board',
    position: fen,
    boardOrientation: orientation,
    pieces: localPieceRenderers,
    squareStyles,
    arrows: pvArrow
      ? [{ startSquare: pvArrow.from, endSquare: pvArrow.to, color: 'var(--board-arrow)' }]
      : [],
    squareRenderer,
    allowDragging: isInteractive,
    allowDragOffBoard: false,
    allowDrawingArrows: false,
    canDragPiece,
    onSquareClick,
    onPieceDrop,
  }}
/>
```

Adapt all twelve react-chessboard piece codes to the existing local `ChessPieceSvg`/`Piece` assets. The visual react-chessboard subtree is wrapped in `aria-hidden="true"`; accessible piece names come from `AccessibleBoardGrid`, avoiding duplicate announcements from the visual drag-and-drop DOM.

- [ ] **Step 5: Preserve board accessibility in `ChessboardView`**

Keep one outer focusable `role="grid"` with `aria-label="Chess board"`. Inside it:

- Render `AccessibleBoardGrid` using the existing `boardSquares` mapping, eight `role="row"` elements, 64 `role="gridcell"` elements, orientation-aware coordinates, local labelled piece images, last-move state, selected-square state, and the classification badge in the semantic destination cell.
- Visually clip the semantic rows/cells with a dedicated class that remains in the accessibility tree; do not use `display: none`, `visibility: hidden`, or `aria-hidden` on the semantic grid.
- Wrap the visible react-chessboard subtree in `aria-hidden="true"` so its unlabelled divs and drag sensors are not announced as a second board.
- Add an `aria-live="polite"` status such as `Selected e2. Legal destinations: e3, e4.` so legal targets are not communicated only by colored dots.

Preserve Home/End/ArrowLeft/ArrowRight only when `history` exists. Render `MoveHistoryControls` only when `history` exists. Because react-chessboard's arrow SVG is hidden with the visual subtree, render a semantic `role="img"` whose accessible name is `Principal variation ${pvArrow.from} to ${pvArrow.to}` whenever a PV arrow is supplied.

- [ ] **Step 6: Implement promotion as a deferred controlled move**

When promotion is required, save `{ from, to }`, return false to react-chessboard, and open `PromotionDialog`. On selection, call `applyBoardMove(fen, { from, to, promotion })`, pass the result to `onMove`, clear pending state, and restore focus. Cancel clears pending state without changing FEN.

- [ ] **Step 7: Add board, legal-dot, badge, and modal styles**

Extend existing board selectors rather than replacing board sizing. Add the visually clipped semantic-grid class, selected-square and legal-target styles, top-right square badge positioning, local piece sizing, promotion layout, focus-visible outlines, forced-colors borders, touch targets of at least 44px in the modal, and reduced-motion overrides.

- [ ] **Step 8: Run the focused tests**

```powershell
npx vitest run tests/dom/components/InteractiveChessboard.test.tsx tests/dom/components/PromotionDialog.test.tsx tests/dom/components/ChessboardView.test.tsx
```

Expected: all focused tests pass and the existing five ChessboardView contracts remain covered, including eight rows and 64 cells in both orientations.

- [ ] **Step 9: Commit the interactive board surface**

```powershell
git add components/board/InteractiveChessboard.tsx components/board/AccessibleBoardGrid.tsx components/board/PromotionDialog.tsx components/board/ChessboardView.tsx components/board/Piece.tsx app/globals.css tests/dom/components/InteractiveChessboard.test.tsx tests/dom/components/PromotionDialog.test.tsx tests/dom/components/ChessboardView.test.tsx
git commit -m "feat: add accessible interactive chessboard"
```

---

### Task 7: Add a Tested Analysis Variation State Machine

**Files:**

- Create: `features/board/variation.ts`
- Create: `tests/unit/board/variation.test.ts`
- Create: `components/analysis/VariationSandboxBanner.tsx`
- Modify: `components/workspace/ChessWorkspace.tsx`
- Modify: `app/globals.css`
- Create: `tests/dom/components/VariationSandboxBanner.test.tsx`
- Modify: `tests/e2e/workspace.spec.ts`

**Interfaces:**

- Consumes: a main-game base ply/FEN and `AppliedBoardMove` values.
- Produces:

```ts
export interface AnalysisVariationState {
  basePly: number;
  baseFen: string;
  moves: readonly AppliedBoardMove[];
  cursor: number;
}

export function startVariation(
  basePly: number,
  baseFen: string,
  firstMove: AppliedBoardMove
): AnalysisVariationState;

export function appendVariationMove(
  state: AnalysisVariationState,
  move: AppliedBoardMove
): AnalysisVariationState;

export function moveVariationCursor(
  state: AnalysisVariationState,
  cursor: number
): AnalysisVariationState;

export function variationFen(state: AnalysisVariationState): string;
```

Appending at a cursor before the tail truncates the old tail. `variationFen` returns `baseFen` at cursor 0 and `moves[cursor - 1].fenAfter` otherwise.

- [ ] **Step 1: Write failing state-machine tests**

Assert start, append, step backward/forward, boundary clamping, branch-tail truncation, discontinuous `fenBefore` rejection, and base-FEN restoration at cursor 0. A discontinuous move must return the unchanged state or throw a documented `DISCONTINUOUS_VARIATION_MOVE` caught by the caller; choose the explicit error and test its code.

- [ ] **Step 2: Run the reducer test and observe failure**

```powershell
npx vitest run tests/unit/board/variation.test.ts
```

- [ ] **Step 3: Implement the pure variation functions**

Do not store SAN/UCI strings separately; `AppliedBoardMove` is the complete variation record. Clamp cursor with `Math.min(Math.max(cursor, 0), state.moves.length)`.

- [ ] **Step 4: Write and implement banner DOM tests**

Render a two-move state and assert the banner shows `Exploration from ply 14`, SAN breadcrumbs, Previous/Next disabled boundaries, and `Return to main game`. Assert every callback receives the exact target cursor or close event.

- [ ] **Step 5: Integrate Analysis mode in `ChessWorkspace`**

Keep `variation` as local state. For an accepted board move while `tab === 'analysis'`:

- If no variation exists and the move UCI equals `parsedGame.plies[state.selection.ply]?.uci`, call `controller.selectPly(state.selection.ply + 1)` and do not start a variation.
- Otherwise start a variation from the currently displayed main-game FEN.
- While variation exists, append/truncate through `appendVariationMove`.
- Derive the board FEN from `variationFen` and do not dispatch main-game ply changes for variation controls.
- Hide main-line `evaluationScore`, `pvArrow`, and `lastMoveBadge` while variation exists.
- Outside a variation, pass `lastMoveBadge` only when `tab === 'analysis'` and the annotation ply equals the displayed main-game ply; use the played move's destination square and classified quality.
- Pass `isInteractive={true}` only for Analysis and Opening modes. The Games and Settings board remains read-only.
- Gate `evaluationScore` and `pvArrow` on `tab === 'analysis'` so an existing analysis result can never leak onto Games or Opening positions.
- Clear variation on Return to main game, selected-game change, leaving Analysis, and an external main-ply selection.

Use refs/effects only for reset detection; the variation FEN itself must remain a pure derivation.

- [ ] **Step 6: Add sandbox styles and actual-browser E2E coverage**

Add a compact `.variation-sandbox-banner` with wrapping breadcrumbs and responsive controls. Extend the existing fixture E2E flow to enter Analysis, play a divergent legal move by click, assert the banner and changed board position, step back/forward, return to game, and assert the original selected ply/FEN and analysis overlays are restored.

- [ ] **Step 7: Run focused tests**

```powershell
npx vitest run tests/unit/board/variation.test.ts tests/dom/components/VariationSandboxBanner.test.tsx
npx playwright test tests/e2e/workspace.spec.ts --project=chromium
```

Expected: reducer, banner, and Chromium workspace flow pass.

- [ ] **Step 8: Commit analysis variations**

```powershell
git add features/board/variation.ts components/analysis/VariationSandboxBanner.tsx components/workspace/ChessWorkspace.tsx app/globals.css tests/unit/board/variation.test.ts tests/dom/components/VariationSandboxBanner.test.tsx tests/e2e/workspace.spec.ts
git commit -m "feat: add analysis variation sandbox"
```

---

### Task 8: Add Observed and Reversible Unobserved Opening Board Moves

**Files:**

- Modify: `features/opening-tree/navigation.ts`
- Modify: `components/tree/OpeningTreeTable.tsx`
- Create: `components/tree/UnobservedMoveNotice.tsx`
- Modify: `components/workspace/ChessWorkspace.tsx`
- Modify: `app/globals.css`
- Modify: `tests/unit/opening-tree/navigation.test.ts`
- Create: `tests/dom/components/UnobservedMoveNotice.test.tsx`
- Modify: `tests/dom/components/OpeningTreeTable.test.tsx`
- Modify: `tests/e2e/workspace.spec.ts`

**Interfaces:**

- Consumes: current `OpeningGraphSnapshot`, `GraphNavigationState`, and `AppliedBoardMove` from the currently displayed complete opening FEN.
- Produces:

```ts
export type OpeningBoardMoveResolution =
  | { kind: 'observed'; navigation: GraphNavigationState }
  | {
      kind: 'unobserved';
      sourceNavigation: GraphNavigationState;
      move: AppliedBoardMove;
    };

export function resolveOpeningBoardMove(
  graph: OpeningGraphSnapshot,
  navigation: GraphNavigationState,
  move: AppliedBoardMove
): OpeningBoardMoveResolution;
```

An unobserved state is one local move only. The board shows `move.fenAfter` and becomes read-only until Step Back; it is not inserted into the graph, path store, workspace reducer, or persistence layer.

- [ ] **Step 1: Write failing navigation-unit tests**

Using a legal-FEN opening fixture, assert an outgoing UCI returns `observed` with the same result as `navigateCandidate`. Assert a legal missing UCI returns `unobserved` with the exact source navigation and applied move. Assert unknown source positions throw `UNKNOWN_GRAPH_POSITION` and stale edges retain existing controlled errors.

- [ ] **Step 2: Run the navigation test and observe failure**

```powershell
npx vitest run tests/unit/opening-tree/navigation.test.ts
```

- [ ] **Step 3: Implement `resolveOpeningBoardMove`**

Look up only:

```ts
const edge = graph.positions.get(navigation.positionKey)?.outgoing.get(move.uci);
```

Return `navigateCandidate` for an edge; otherwise return the reversible unobserved record. Do not search the graph globally by `normalizePositionKey(move.fenAfter)`, because a transposed position without the current outgoing edge is still unobserved from this path.

- [ ] **Step 4: Write and implement notice tests**

`UnobservedMoveNotice` must render `Unobserved move: 0 games in database`, the move SAN, and a `Step back to observed position` button. Test the callback and semantic `role="status"` without adding a fake candidate table row.

- [ ] **Step 5: Integrate opening board moves with one synchronized commit path**

Add local `unobservedOpeningMove` state and a helper:

```ts
const commitGraphNavigation = (next: GraphNavigationState) => {
  setNavigation(next);
  controller.navigateGraph(next.positionKey, next.pathId);
};
```

Use this helper for table buttons, breadcrumbs, and board moves. While unobserved, derive the board FEN from `move.fenAfter`, render the notice, disable board interaction, hide move-order controls, and keep the observed table/navigation unchanged. Step Back clears only the local unobserved state. Clear it when the graph changes or the user leaves Opening.

- [ ] **Step 6: Preserve the OpeningTreeTable component boundary**

Keep candidate sorting/table rendering in `OpeningTreeTable`. Do not move the board into that component and do not place board-interaction tests in `OpeningTreeTable.test.tsx`; its existing tests should continue to cover only table navigation and terminal/limit states.

- [ ] **Step 7: Add actual-browser observed/unobserved tests**

Extend `workspace.spec.ts` to:

- Play an observed root move on the board and assert candidate/path navigation changes.
- Step through an existing transposition and retain move-order behavior.
- Return to the root, play a legal unobserved move, assert the board changes and the 0-game notice appears.
- Assert further dragging/clicking is disabled until Step Back.
- Step back and assert the original graph FEN and candidates return.

- [ ] **Step 8: Run focused tests**

```powershell
npx vitest run tests/unit/opening-tree/navigation.test.ts tests/dom/components/OpeningTreeTable.test.tsx tests/dom/components/UnobservedMoveNotice.test.tsx
npx playwright test tests/e2e/workspace.spec.ts --project=chromium
```

Expected: all focused unit/DOM and Chromium workspace tests pass.

- [ ] **Step 9: Commit opening-board exploration**

```powershell
git add features/opening-tree/navigation.ts components/tree/OpeningTreeTable.tsx components/tree/UnobservedMoveNotice.tsx components/workspace/ChessWorkspace.tsx app/globals.css tests/unit/opening-tree/navigation.test.ts tests/dom/components/OpeningTreeTable.test.tsx tests/dom/components/UnobservedMoveNotice.test.tsx tests/e2e/workspace.spec.ts
git commit -m "feat: navigate openings from board moves"
```

---

### Task 9: Cross-Browser, Accessibility, Visual, and Full Quality Gate

**Files:**

- Modify: `tests/e2e/workspace-accessibility.spec.ts`
- Modify: `tests/e2e/workspace-responsive.spec.ts`
- Modify: `tests/e2e/workspace-visual.spec.ts`
- Modify intentionally changed snapshots under: `tests/e2e/workspace-visual.spec.ts-snapshots/`
- Review: all files touched by Tasks 1–8

**Interfaces:**

- Consumes: the completed classification pipeline and all three board modes.
- Produces: verified production build and cross-browser evidence for the completed feature.

- [ ] **Step 1: Add accessibility scenarios before updating snapshots**

Test the interactive board in game, analysis sandbox, promotion dialog, opening observed, and opening unobserved states. For each applicable state assert:

- One labelled `role="grid"` and exactly 64 `gridcell`s.
- Keyboard history navigation remains boundary-safe on the main line.
- Promotion focus is trapped, Escape cancels, and focus returns.
- Badge symbols have accessible names.
- Legal targets are not conveyed only by color.
- `axe` reports no serious or critical violations.

- [ ] **Step 2: Add responsive interaction scenarios**

At the existing mobile and tablet projects, assert the board remains square, evaluation bar remains adjacent, promotion choices stay inside the viewport, summary table scrolls without page-width overflow, and sandbox/novelty controls wrap without covering the board.

- [ ] **Step 3: Run targeted unit and DOM suites**

```powershell
npx vitest run tests/unit/engine/accuracy.test.ts tests/unit/stockfish-analysis tests/unit/board tests/unit/opening-tree/navigation.test.ts tests/dom/components/ChessboardView.test.tsx tests/dom/components/InteractiveChessboard.test.tsx tests/dom/components/PromotionDialog.test.tsx tests/dom/components/AnalyzerWorkspace.test.tsx tests/dom/components/VariationSandboxBanner.test.tsx tests/dom/components/UnobservedMoveNotice.test.tsx
```

Expected: every targeted test passes.

- [ ] **Step 4: Run type, lint, format, and coverage gates**

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test:coverage
```

Expected: all tests pass and the configured coverage thresholds in `vitest.config.ts` are met. Do not describe this as “100% regression safety.”

- [ ] **Step 5: Build and run functional cross-browser E2E**

```powershell
npm run build
npm run test:e2e
```

Expected: the Next.js production build and all configured Chromium, Firefox, WebKit, mobile, and tablet projects pass.

- [ ] **Step 6: Review and update visual baselines only for intentional changes**

Run:

```powershell
npx playwright test tests/e2e/workspace-visual.spec.ts --update-snapshots
npx playwright test tests/e2e/workspace-visual.spec.ts
```

Inspect every changed image. Accept changes caused by the new controlled board/badges/summary; reject clipping, lost local artwork, layout movement outside the board region, or missing focus/contrast states.

- [ ] **Step 7: Run the repository aggregate verification**

```powershell
npm run verify
```

Expected: formatting, lint, typecheck, configured coverage, production build, and all E2E projects exit with code 0.

- [ ] **Step 8: Inspect the final diff for scope and generated-file noise**

```powershell
git status --short
git diff --check
git diff --stat
```

Expected: only the dependency lockfile, planned source/tests/styles, and intentionally reviewed visual snapshots are present. Do not commit `.next`, coverage HTML, Playwright reports, traces, or screenshots outside the approved snapshot directory.

- [ ] **Step 9: Commit the verification coverage**

```powershell
git add tests/e2e/workspace-accessibility.spec.ts tests/e2e/workspace-responsive.spec.ts tests/e2e/workspace-visual.spec.ts tests/e2e/workspace-visual.spec.ts-snapshots
git commit -m "test: verify interactive review workflows"
```
