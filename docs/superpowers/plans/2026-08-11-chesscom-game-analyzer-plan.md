# Chess.com Game Analyzer — Implementation Plan Index

**Version:** 2.2  
**Date:** 2026-08-11  
**Status:** Superseded as a monolithic code plan; retained as a stable entry point.

The former version of this file duplicated complete source snippets across the phase plans. Those snippets were internally inconsistent and included placeholders for core behavior. Version 2 deliberately uses one canonical design and focused phase plans so implementation and documentation can evolve without copying entire source files into several documents.

## Authoritative documents

1. [Product and technical requirements](../../Chess.com%20Game%20Analyzer%20&%20Opening%20Tree%20Technical%20Spec.md)
2. [Production design specification](../specs/2026-08-11-chesscom-game-analyzer-design.md)
3. [Master implementation plan](master-implementation-plan.md)

## Execution order

1. [Phase 1 — Foundation, direct PubAPI ingestion, and persistence](phase-1-direct-ingestion-persistence.md)
2. [Phase 2 — PGN parsing, position graph, and move-order aggregation](phase-2-opening-tree-engine.md)
3. [Phase 3 — Stockfish WASM and accuracy analysis](phase-3-stockfish-wasm-engine.md)
4. [Phase 4 — Accessible application workspace](phase-4-ui-workspace-components.md)
5. [Phase 5 — Advanced metrics and production verification](phase-5-advanced-features-verification.md)

## Implementation policy

- Follow the canonical design when resolving ambiguity.
- Complete each phase’s tests and exit gate before starting dependent work.
- Implement production source in the repository; do not copy obsolete code from document history.
- Add architecture decisions to `docs/adr/` when a material decision changes.
- Keep external service, engine artifact, data-set, security, performance, and license decisions explicit and versioned.
- Never satisfy a planned feature with a hard-coded analytical value, fixed evaluation, empty placeholder panel, or smoke test that asserts only a heading.

The complete implementation task breakdown is now in the linked phase plans.
