# Opening Graph Snapshot Format

Phase 2 persists graph snapshots only through the explicit DTO emitted by `serializeOpeningGraph`. In-memory graph state uses `Map` and `PathStore`; neither is persisted directly.

## Version 1

`formatVersion` is `1`. A snapshot stores the query fingerprint, source-game count, build timestamp, graph status, root key, included and remaining game counts, sorted position records, sorted edges, sorted arrival-path aggregates, and path nodes ordered by ID.

Position identity is the normalized four-field FEN key. Complete six-field FEN remains on parsed plies and is not replaced by the graph key.

The deserializer validates the format version, root reference, all edge targets, all arrival path IDs, and the complete parent chain of every path node before returning a graph. Invalid data is rejected without mutating an existing graph.

## Migration policy

Readers accept only known formats. A newer `formatVersion` is rejected as `UNSUPPORTED_GRAPH_FORMAT`; callers must retain the live graph for the current session and must not overwrite a compatible persisted snapshot. A future migration must add an explicit `vN -> vN+1` converter, validate its result through the current deserializer, and write the upgraded DTO atomically only after validation succeeds.

Snapshots larger than the configured 64 MiB serialized limit remain usable in memory but must not be persisted. A caller that adds persistence must surface this as `SNAPSHOT_TOO_LARGE_TO_PERSIST`.
