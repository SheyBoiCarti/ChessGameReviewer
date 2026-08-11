# Phase 3 — Stockfish WASM and Accuracy Analysis

**Status:** Ready for implementation  
**Depends on:** Phase 1 persistence/contracts and Phase 2 parsed-game/full-FEN output  
**Produces:** Reproducible local Stockfish analysis with typed worker protocol, resource-aware scheduling, correct score perspective, caching, cancellation, and game annotations.

## 1. Phase outcomes

At completion:

- Stockfish artifacts have pinned provenance, checksums, license notices, and reproducible build instructions;
- the application performs real UCI initialization and position analysis in a browser worker;
- threaded mode is selected only after an actual cross-origin-isolation/engine probe;
- a single global scheduler prioritizes interactive work and avoids CPU oversubscription;
- evaluations are normalized to White and mover perspectives correctly;
- selected games can be analysed, cancelled, resumed from cache, and annotated;
- every engine error reaches a terminal, user-visible state.

## 2. Task 3.1 — Select, build, and verify Stockfish artifacts

### Files

- Add a pinned Stockfish/port source reference and build script under `scripts/stockfish/`.
- Add generated runtime artifacts under `public/stockfish/` according to repository policy.
- Add `public/stockfish/manifest.json` with engine build, source commit, network hash, file hashes, features, and license metadata.
- Add/update `THIRD_PARTY_NOTICES.md` and source-offer documentation.
- Add CI checksum/license verification.

### Requirements

1. Select one reviewed WebAssembly port compatible with the supported browsers and Stockfish’s GPLv3 license.
2. Pin the exact upstream commit, toolchain/container version, build flags, NNUE network, and output hashes.
3. Produce single-thread and threaded/SIMD variants if the selected port requires distinct artifacts.
4. Serve all artifacts from the application origin. Confirm WASM MIME type and worker/NNUE loading under COEP.
5. Include the GPLv3 license and a durable pointer to the exact corresponding source needed to reproduce the distributed binary.
6. Do not download mutable `latest` artifacts during application build or runtime.

### Tests first

- Manifest schema and file checksum verification.
- CI fails for a missing license, missing corresponding-source reference, hash mismatch, or untracked engine artifact.
- Browser smoke test loads the single-thread artifact and receives `uciok` and `readyok`.

### Acceptance

- A clean documented build reproduces the manifest hashes or documents the deterministic-build limitation with a verified trusted artifact path.
- License obligations are satisfied before any preview is public.

## 3. Task 3.2 — UCI parser and engine adapter

### Files

- Create `lib/engine/uci/types.ts`.
- Create `lib/engine/uci/parser.ts`.
- Create `lib/engine/stockfishAdapter.ts`.
- Create `workers/stockfish.worker.ts` and typed engine-worker messages.
- Create parser and adapter state-machine tests.

### UCI parsing requirements

Parse at minimum:

- `uciok`, `readyok`, `id`, `option`;
- `info` fields for depth, seldepth, multipv, cp/mate score, lowerbound/upperbound, nodes, nps, time, hashfull, and PV;
- `bestmove` plus optional ponder move;
- `Unknown command` and engine termination.

The parser must tolerate field order, omitted optional fields, repeated incremental `info` lines, extra whitespace, and unknown future fields. It must reject non-finite numeric values and never index tokens without bounds checks.

### Adapter state machine

States:

```text
new → loading → uci-initializing → ready → searching → stopping → ready
  └──────────────────────────── failure/disposed ─────────────────────┘
```

Required operations:

- `initialize(options, signal)`;
- `evaluate(fen, limit, multiPv, signal)`;
- `stop()`;
- `newGame()`;
- `dispose()`.

Initialization sends `uci`, waits for `uciok`, applies supported options, sends `isready`, and waits for `readyok`, each with a deadline. Evaluation sends a validated complete FEN, `go` limit, aggregates the deepest valid line per Multi-PV index, and resolves only after `bestmove` or a controlled stop.

### Worker contract

- Every request and response has protocol version and job ID.
- Worker catches initialization/search errors and returns safe typed failures.
- A cancelled search sends `stop` and drains through `bestmove` before the next position.
- No two searches share one engine simultaneously.
- Disposal terminates pending work exactly once.

### Tests first

- Table-driven UCI lines including cp, mate, bounds, Multi-PV, omitted PV, malformed values, and unknown fields.
- Full adapter transcripts for initialization, option setup, search, cancellation, timeout, error, restart, and disposal.
- Race tests for stop followed immediately by a new job.
- Browser integration with the real single-thread artifact.

### Acceptance

- There is no empty worker array or capability-only shell presented as a pool manager.
- Every adapter call settles successfully, fails, or cancels within a deadline.

## 4. Task 3.3 — Capability probe and resource policy

### Files

- Create `lib/engine/capabilities.ts`.
- Create `lib/engine/resourcePolicy.ts`.
- Create capability tests and deployed-browser probes.

### Capability result

```typescript
interface EngineCapability {
  mode: 'threaded' | 'single-thread' | 'unavailable';
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  simd: boolean;
  engineInitialized: boolean;
  reason?: string;
  threads: number;
  hashMb: number;
}
```

### Requirements

- Do not use `typeof SharedArrayBuffer` as the sole decision.
- Probe `window.crossOriginIsolated`, worker isolation, required WebAssembly features, and actual engine initialization.
- Default threaded count is `clamp(hardwareConcurrency - 1, 1, 4)` but must respect the memory/mobile policy.
- Default to one engine instance in all modes.
- Hash memory is bounded by device class; record the selected value in evaluation keys.
- Fall back to single-thread on probe failure without repeatedly downloading/restarting the threaded artifact.
- Return `unavailable` with actionable reason if both variants fail.

### Tests first

- All capability combinations including deceptive `SharedArrayBuffer` presence without isolation.
- Thread/hash clamping for missing, small, large, and privacy-rounded hardware values.
- Threaded initialization failure followed by one successful fallback.
- Both modes failing without an unhandled rejection.

### Acceptance

- Preview tests cover threaded mode where supported and forced single-thread fallback.
- Selected mode and limits are visible in the analyzer status UI contract.

## 5. Task 3.4 — Priority scheduler and lifecycle reliability

### Files

- Create `lib/engine/scheduler/types.ts`.
- Create `lib/engine/scheduler/engineScheduler.ts`.
- Create `features/stockfish-analysis/engineService.ts`.
- Create scheduler tests using a deterministic fake adapter and clock.

### Job types

- Priority 1: interactive current-position evaluation.
- Priority 2: user-selected game analysis.
- Priority 3: optional background precomputation, disabled by default.

Each job includes ID, position/game context, evaluation settings, creation time, deadline, abort signal, and relevance token.

### Scheduling rules

1. Only one job owns the engine.
2. A newer interactive job supersedes queued older interactive jobs for the same view.
3. Interactive work may preempt a batch search by issuing `stop` and waiting for adapter readiness.
4. Preempted batch work is requeued only if its parent analysis job remains active.
5. Queue order is stable within priority.
6. Hidden documents pause batch/background work; interactive work resumes only on user activity.
7. Adapter crash causes one clean reinitialization and retries the current job once if safe.
8. A second crash disables the session engine and fails all queued jobs with a typed error.
9. `dispose` aborts the active job, clears the queue, and terminates the worker.

### Tests first

- FIFO within priority and priority ordering.
- Interactive supersession and batch preemption.
- Cancellation while queued and active.
- Hidden/visible transitions.
- One restart, repeated crash, timeout, disposal, and no leaked promises.
- Jobs never receive another job’s UCI output.

### Acceptance

- At most one engine instance is active by default.
- Rapid board navigation does not grow an unbounded queue.
- Browser tab hiding reduces active analysis according to policy.

## 6. Task 3.5 — Score normalization and accuracy heuristic

### Files

- Create `lib/engine/evaluation.ts`.
- Create `lib/engine/winProbability.ts`.
- Create `lib/engine/accuracy.ts`.
- Create mathematical and fixture tests.

### Evaluation rules

1. Parse the active colour from the complete FEN.
2. Convert UCI score to White perspective:
   - White to move: retain the score sign.
   - Black to move: invert the score sign.
3. Convert White score to the mover perspective when comparing a played move.
4. Compare before and after values generated under equivalent limits/settings.
5. Clamp negative centipawn loss to zero only after correct perspective conversion.
6. Keep mate scores as mate values. Define terminal probability directly and distinguish forced mate gained, retained, missed, and conceded.
7. Do not treat lower/upper bounds as exact values for move classification.

### Accuracy heuristic

Version the formula as `analyzer-accuracy-v1`. Store the version with annotations and game summaries. The initial win-probability and accuracy transformations may follow the canonical formulas, but naming and UI copy must state that they are project estimates.

Move classification must be based on mover-perspective probability loss and have exhaustive, non-overlapping threshold boundaries. “Miss” is a separately defined forced-win transition, not a label that blindly precedes all other classifications.

### Tests first

- The same White-favouring position is positive after normalization regardless of side-to-move UCI convention.
- Equivalent White and Black mistakes yield equivalent mover loss.
- A good Black move is not mislabeled due to sign inversion.
- Threshold boundary table, non-finite inputs, extreme cp, and zero loss.
- Mate gained/lost/retained, mating side changes, checkmate, stalemate, and insufficient material.
- Bound scores do not produce definitive quality labels.

### Acceptance

- Every annotation records source settings and accuracy version.
- The UI can distinguish unavailable/indeterminate from a numeric zero.

## 7. Task 3.6 — Evaluation cache and selected-game analyzer

### Files

- Implement evaluation repository methods from Phase 1.
- Create `features/stockfish-analysis/analyzeGame.ts`.
- Create annotation and game-summary types.
- Create cache and game-analysis tests.

### Evaluation cache key

Serialize all fields from canonical `EvaluationKey` deterministically:

- complete FEN;
- engine build and network hash;
- limit type/value;
- Multi-PV;
- threads and hash memory;
- analysis/normalization version where output interpretation depends on it.

Normalized four-field opening keys are prohibited as evaluation keys.

### Game-analysis algorithm

1. Validate the complete ply chain.
2. Create one analysis job with progress and cancellation.
3. For each requested ply, load compatible before/after evaluations from cache or schedule them.
4. Avoid duplicate evaluation of a position/configuration within the job.
5. Calculate mover-perspective loss and annotation.
6. Persist successful exact evaluations incrementally so cancelled work can resume.
7. Return complete, partial, cancelled, or failed status plus analysed/total ply coverage.
8. Calculate White and Black summary estimates separately from only eligible classified moves; disclose excluded/indeterminate moves.

### Tests first

- Exact cache hit and miss for every differing key field.
- Deduplication of repeated positions.
- Resume after cancellation.
- Partial analysis retains coverage and cached completed work.
- Mixed cached/live results are ordered by ply.
- Engine version/network/settings change invalidates reuse.
- Cache quota failure leaves current session analysis usable.

### Acceptance

- Re-analysing with identical settings reuses persisted evaluations.
- No stale evaluation is reused across engine or setting changes.
- A selected legal fixture produces real non-empty annotations and PV lines in a browser.

## 8. Phase 3 exit gate

- Artifact provenance, hashes, GPL notice, and corresponding source are verified.
- Real browser initialization succeeds in single-thread mode and threaded mode where supported.
- UCI, scheduler, cancellation, crash recovery, perspective, mate, accuracy, and cache tests pass.
- Selected-game analysis displays real evaluations; fixed values and empty placeholder arrays are absent.
- CPU/thread/hash policy is measured on desktop and mobile-class profiles.
- No engine promise, worker, or timer remains after disposal tests.
- Playwright MCP verification on the tested browser build confirms real worker/WASM startup, non-empty analysis, console/network cleanliness, cancellation, and fallback UI; stable findings are covered by committed browser tests.
