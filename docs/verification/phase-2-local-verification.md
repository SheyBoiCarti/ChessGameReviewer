# Phase 2 local verification

## Recorded graph baselines

Reference machine: `DESKTOP-MAPUMVJ` (Windows), Node `v24.19.0`, Vitest `3.2.7`.
Command: `npm test -- tests/unit/benchmarks/openingGraph.benchmark.test.ts`.

The deterministic legal Ruy Lopez fixture is replayed at a 10-ply horizon. It intentionally reuses the same move order, so these figures measure per-game aggregation throughput and transfer size rather than worst-case graph breadth.

| Workload                         | Duration | Positions | Edges | Path nodes | Serialized bytes | Heap delta |
| -------------------------------- | -------: | --------: | ----: | ---------: | ---------------: | ---------: |
| 1,000 games (supported baseline) |  8.20 ms |        11 |    10 |         11 |            7,660 | +4,342,232 |
| 10,000 games (stress baseline)   | 52.13 ms |        11 |    10 |         11 |            7,818 | -1,339,136 |

Heap deltas are process snapshots, so garbage collection can make them negative. They are recorded as diagnostic context rather than a regression threshold.

## Worker guarantees covered locally

- A graph job emits typed acceptance, throttled monotonic progress, and exactly one terminal response.
- The builder yields every 25 games; a cancellation message received at a yield point resolves the job as `CANCELLED` without a late completion.
- Oversize deterministic snapshots retain their in-memory DTO and carry `SNAPSHOT_TOO_LARGE_TO_PERSIST`, preventing a persistence caller from writing them.
- Worker-client tests ignore stale job IDs and settle only the active request.
