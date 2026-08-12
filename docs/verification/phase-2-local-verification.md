# Phase 2 local verification

## Recorded graph baselines

Reference machine: `DESKTOP-MAPUMVJ` (Windows), Node `v24.19.0`, Vitest `3.2.7`.
Command: `npm test -- tests/unit/benchmarks/openingGraph.benchmark.test.ts`.

The deterministic legal Ruy Lopez fixture is replayed at a 10-ply horizon. It intentionally reuses the same move order, so these figures measure per-game aggregation throughput and transfer size rather than worst-case graph breadth.

| Workload                         | Duration | Positions | Edges | Path nodes | Serialized bytes | Heap delta |
| -------------------------------- | -------: | --------: | ----: | ---------: | ---------------: | ---------: |
| 1,000 games (supported baseline) |  7.67 ms |        11 |    10 |         11 |            7,682 | +4,406,016 |
| 10,000 games (stress baseline)   | 54.98 ms |        11 |    10 |         11 |            7,840 | +8,637,624 |

The worker’s end-to-end 1,000-game parsing and aggregation baseline was **2,439.94 ms** on the same machine. This includes strict PGN replay, position-key normalization, worker scheduling yields, and graph construction; it does not block React or the browser main thread.

Heap deltas are process snapshots, so garbage collection can make them negative. They are recorded as diagnostic context rather than a regression threshold.

## Worker guarantees covered locally

- A graph job emits typed acceptance, throttled monotonic progress, and exactly one terminal response.
- The worker receives normalized game records and performs strict PGN parsing itself; malformed records are excluded with a bounded diagnostic count.
- The builder yields every 25 games; a cancellation message received at a yield point resolves the job as `CANCELLED` without a late completion.
- Oversize deterministic snapshots retain their in-memory DTO and carry `SNAPSHOT_TOO_LARGE_TO_PERSIST`, preventing a persistence caller from writing them.
- Worker-client tests ignore stale job IDs and settle only the active request.
