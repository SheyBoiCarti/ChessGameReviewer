# Phase 2 — PGN Parsing, Position Graph, and Move-Order Aggregation

**Status:** Ready for implementation  
**Depends on:** Phase 1 contracts, persistence, and worker protocol conventions  
**Produces:** A deterministic, scalable opening-position graph built off the UI thread, with correct node/edge/path statistics and filterable view models.

## 1. Phase outcomes

At completion:

- validated games are converted to structured plies with complete and normalized FENs;
- transposed positions merge under a rigorously tested identity rule;
- every visited position, including the last position in the horizon, receives correct counts;
- arrival paths and their outcomes are stored at target positions through an interned path store;
- graph building runs in a cancellable worker and returns immutable snapshots;
- descriptive opening metrics use real aggregates and expose sample sizes.

## 2. Task 2.1 — PGN parser and result normalization

### Files

- Create `lib/chess/pgnParser.ts`.
- Create `lib/chess/fen.ts`.
- Extend `lib/chess/results.ts`.
- Create legal PGN fixtures for ordinary games, transpositions, promotions, castling, en passant, repetition, comments/variations, malformed PGN, and setup-FEN starts.
- Create parser and FEN property tests.

### Parser contract

```typescript
type ParseResult =
  { ok: true; game: ParsedGame } | { ok: false; gameId: string; errors: ParseDiagnostic[] };
```

No catch block may return partial plies as a successful parse. Recoverable PGN warnings are attached to an otherwise valid game; illegal move sequences are failures.

### Position identity rules

1. Parse a complete six-field FEN and reject malformed fields.
2. Retain piece placement, side to move, castling rights, and en-passant rights.
3. Canonicalize castling rights and use `-` when none remain.
4. Keep an en-passant square only when the side to move has a legal en-passant capture; otherwise use `-`.
5. Exclude halfmove/fullmove counters only from the opening graph key.
6. Preserve complete FEN on each ply for engine analysis.

Use the chess rules library to determine legality; do not infer en-passant legality with string operations.

### Replay requirements

- Obtain the initial position from PGN headers when `[SetUp "1"]` and `[FEN]` are valid; otherwise use the standard initial position.
- Replay the legal main line and ignore annotated variations for the game graph.
- Record SAN from the rules library and UCI as `from + to + promotion`.
- Verify continuity: each ply’s `fenBefore` equals the prior ply’s `fenAfter`.
- Preserve stable game ID and context in every diagnostic.

### Tests first

- FEN counters normalize to the same key.
- Positions differing by side to move, castling rights, or a legal en-passant right do not merge.
- Irrelevant en-passant targets normalize to `-`.
- Known alternative legal move orders reach exactly the same real normalized FEN.
- Malformed and illegal PGNs fail with stable diagnostic codes.
- Setup-FEN PGN replays from its declared start.
- Promotion UCI includes the promoted piece.
- Property tests generate legal move sequences and verify replay continuity.

### Acceptance

- No synthetic strings such as `target_fen` are used as the only transposition proof.
- Every fixture is a legal PGN with an independently asserted target FEN.
- Parsing 1,000 typical games in the data worker meets the recorded baseline and does not block React.

## 3. Task 2.2 — Graph and interned path data structures

### Files

- Create `lib/chess/graph/types.ts`.
- Create `lib/chess/graph/outcomes.ts`.
- Create `lib/chess/graph/pathStore.ts`.
- Create `lib/chess/graph/openingGraph.ts`.
- Create graph invariant and property tests.

### Required types

Use the `OutcomeAggregate`, `PositionNode`, `MoveEdge`, and `PathNode` contracts from the canonical design. Add only versioned/serialized equivalents needed for worker transfer.

`OutcomeAggregate` operations must be centralized:

- create empty;
- add one game visit;
- merge aggregates;
- calculate user score, White score, draw rate, average opponent rating, and sample size;
- validate invariants.

Never reuse `whiteWins` to mean user wins. UI labels must name the perspective they display.

### Path store

- Root path has a stable ID and no move.
- Intern path nodes by `(parentId, uci)`.
- Reconstruct SAN/UCI sequences on demand by following parent links.
- Protect against cycles and unknown parents during deserialization.
- Do not attach copied full-prefix arrays to every edge.
- Path aggregates are stored in `targetNode.arrivalsByPath`.

### Serialization

Browser structured cloning supports `Map`, but persisted snapshots require an explicit versioned DTO. Serialization must:

- sort positions, edges, and path IDs deterministically;
- include graph format version, query fingerprint, opening horizon, source game count, accepted/excluded counts, and build timestamp;
- validate all references when restoring;
- refuse unknown future versions without mutation.

### Tests first

- Path interning returns the same ID for the same prefix and distinct IDs for distinct prefixes.
- Sequence reconstruction is correct and cycle-safe.
- Serialization round-trip preserves aggregates and stable ordering.
- Invalid target/path references are rejected.
- Aggregate invariants hold after merge and round-trip.

### Acceptance

- Memory for unique path prefixes grows with the number of unique prefixes, not with copies on every edge.
- No graph field contains `any` or a mutable reference exposed directly to React.

## 4. Task 2.3 — Correct graph aggregation

### Files

- Implement `OpeningGraphBuilder` in `lib/chess/graph/openingGraph.ts`.
- Add fixture-based and generated invariant tests.

### Configuration

```typescript
interface GraphBuildOptions {
  maxOpeningPlies: number; // default 30, hard range 2..40
  includeRepeatedPositions: boolean; // true for visit counts
}

interface GraphBuildLimits {
  maxPositions: number; // fixed v1 value: 150_000
  maxEdges: number; // fixed v1 value: 200_000
  maxPathNodes: number; // fixed v1 value: 200_001 including root
  maxSnapshotBytes: number; // fixed v1 value: 64 MiB
}
```

The user-facing horizon is product configuration, but 40 plies is an absolute version-1 ceiling enforced again inside the worker. The structural values are product safety limits, not caller-controlled options. The 10,000-game corpus is a stress benchmark; supported user queries remain capped at 5,000 games.

### Algorithm

For each accepted game:

1. Validate the full ply chain before mutating the graph.
2. Increment the root node aggregate once.
3. For each included ply:
   - assert source continuity;
   - intern the new path prefix;
   - get or create the source edge using UCI as its key;
   - assert an existing edge has the same target key and canonical SAN semantics;
   - increment the edge aggregate once;
   - get or create the target node;
   - increment the target node aggregate once;
   - increment the target arrival-path aggregate once;
   - advance source/path state.
4. If any validation fails or the next game would exceed a structural limit, do not retain a partially aggregated game.

Implement per-game updates as a staged or reversible delta so validation and resource-limit failures cannot corrupt counts. If a hard node/edge/path limit would be exceeded, stop at the prior game boundary and return a usable `limited` result containing the exact limit, included game count, remaining game count, and bounded diagnostics. Never silently truncate plies or label this result complete.

Before snapshot persistence, measure the deterministic serialized DTO. A snapshot over 64 MiB remains usable for the current session but is not written to IndexedDB; emit a typed `SNAPSHOT_TOO_LARGE_TO_PERSIST` notice. The worker must release staging allocations between games and on cancellation.

### Required invariant suite

- Root count equals accepted game count.
- A four-ply accepted game contributes to five visited position occurrences.
- The final target position is counted.
- Node and edge outcome totals balance.
- Every edge target exists.
- Two legal transposition move orders merge at one node with two arrival paths.
- Arrival-path totals sum to the target total when the target is reachable only within the tested fixture set.
- Games from both player colours retain correct user and board-colour outcomes.
- Repeated positions in one game are counted according to configured visit semantics.
- Input order does not affect serialized output.
- A fixture that crosses each node/edge/path cap stops at a game boundary, preserves all invariants, and returns `limited`.
- Horizons below 2 or above 40 are rejected by both the public validator and worker boundary.

### Acceptance

- The previous contradiction—target node expected to have games but never incremented—is impossible under tests.
- Real Queen’s Gambit, English/Réti, and Sicilian move-order fixtures pass.
- Corrupt games produce diagnostics and no partial graph mutation.
- Resource limits produce an explicit usable limited graph without an out-of-memory best-effort retry.

## 5. Task 2.4 — Analysis-data worker

### Files

- Create `workers/protocol.ts`.
- Create `workers/analysis-data.worker.ts`.
- Create `features/opening-tree/graphWorkerClient.ts`.
- Create worker integration tests.

### Protocol

Every message includes `protocolVersion` and `jobId`.

Client messages:

- `BUILD_GRAPH` with validated normalized games and options;
- `CANCEL_JOB`;
- `DISPOSE`.

Worker messages:

- `JOB_ACCEPTED`;
- `PROGRESS` with parsed/built counts and bounded diagnostic summary;
- `COMPLETE` with serialized immutable snapshot;
- `LIMITED` with serialized immutable snapshot, reached limit, and included/remaining counts;
- `CANCELLED`;
- `FAILED` with stable error code and safe message.

### Requirements

- Validate messages even though the worker is same-origin.
- Check cancellation between games and before serialization.
- Throttle progress to at most once per 50 ms.
- Do not send raw exception stacks to the UI in production.
- Terminate obsolete workers during hot replacement/navigation.
- Ignore stale results from a superseded job ID.

### Tests first

- Complete, limited-at-each-cap, cancel-before-start, cancel-mid-build, malformed message, stale result, and worker exception.
- Progress is monotonic and throttled.
- The UI-thread client settles every promise exactly once.
- A browser test confirms graph construction does not create long UI-thread tasks.

### Acceptance

- Bulk parsing/aggregation is absent from React handlers.
- Cancellation of a large fixture completes promptly and leaves no unresolved client promise.

## 6. Task 2.5 — Opening statistics and view models

### Files

- Create `lib/metrics/descriptive.ts`.
- Create `features/opening-tree/selectors.ts`.
- Create tests for perspective, sorting, filtering, and insufficient samples.

### Requirements

Provide deterministic selectors for:

- candidate moves sorted by games, score, or SAN;
- user win/draw/loss and expected score;
- White/Draw/Black results when explicitly selected;
- average opponent rating with missing-rating count;
- arrival move orders reconstructed and sorted by frequency;
- configurable rating-tier and colour filters where underlying records are available.

Percentages derive from one shared denominator and preserve enough precision that displayed components can handle rounding without totals misleadingly exceeding or falling below 100.

Advanced classifications remain absent until Phase 5. Do not add placeholder cards.

### Tests first

- Mixed player-colour games display correct user-perspective values.
- Sorting is stable on ties.
- Empty aggregates return explicit `null` metrics rather than divide-by-one zeros.
- Missing ratings do not reduce outcome sample counts.
- Reconstructed move orders end at the selected position.

### Acceptance

- All displayed statistics identify their perspective and sample size.
- No metric uses hard-coded win rates.

## 7. Phase 2 exit gate

- All parser, FEN, graph, worker, property, serialization, and selector tests pass.
- Legal transposition fixtures prove correct merging and arrival-path statistics.
- The root, edge, node, and path invariants pass after randomized game order.
- A 1,000-game supported benchmark and 10,000-game stress benchmark are recorded on the reference machine with horizon, structural counts, serialized bytes, memory where available, and duration.
- React remains responsive during build and cancellation.
- The graph snapshot format and migration policy are documented.
