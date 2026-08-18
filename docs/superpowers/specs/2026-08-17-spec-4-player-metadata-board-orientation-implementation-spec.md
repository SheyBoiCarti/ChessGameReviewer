# Player Metadata & Board Orientation UX Implementation Spec

**Status:** Planning only  
**Source of truth:** `C:\Users\sheha\OneDrive\Desktop\report.md`, Issues 4 and 5  
**Cross-spec sequence:** Spec 4 of 4

## 1. Objective

Persist explicit White and Black player identities, propagate them through the parsed-game/workspace flow, display the correctly oriented player username and rating above and below the board, and add an obvious board-adjacent Flip board control that reuses the existing orientation state without changing any chess or analysis state.

## 2. Current behavior

- Chess.com's raw game object already contains `white.username`, `white.rating`, `black.username`, and `black.rating` when provided.
- `normalizeRawGame` discards explicit color-based player identity. `GameRecord` retains a lowercased queried `username`, `userColor`, and `userRating`/`opponentRating`.
- `GameSelector` reconstructs the opponent's name with a PGN-header regular expression because it is not stored explicitly.
- `parseGamePgn`/`ParsedGame` discards White/Black header metadata, so the active board does not receive it.
- `ChessboardView` already accepts an orientation and correctly orients squares and arrows. `ChessWorkspace` already stores `preferences.boardOrientation`, defaulting to White, and Settings can dispatch `preferences/changed` to update it.
- There is no obvious board-adjacent flip control and no player rows around the active board.
- The orientation effect clears transient selection/focus/legal-target/promotion UI, but it does not alter the current FEN, PGN, ply, history, variation, or analysis.
- `InteractiveChessboard` also supports orientation but is not the active workspace board; the relevant component is the custom `ChessboardView`.

## 3. Root cause

Issue 4 is a data-loss/propagation problem: complete color-based player metadata exists at the API boundary but the normalized persisted schema collapses it into query-user-relative fields and the PGN parser drops the headers. The board therefore cannot render authoritative White/Black labels.

Issue 5 is a discoverability/wiring problem, not a board-library limitation. Orientation state, reducer behavior, square ordering, arrow transformation, and keyboard-aware orientation already exist. The active board lacks a nearby control, and player placement logic does not exist because player data is absent.

The issues must be implemented together: orientation determines which color's player belongs above and below the board.

## 4. Desired behavior

- Every newly normalized game preserves explicit White and Black player metadata with display-case username and optional rating.
- Existing records are safely backfilled where possible; missing values remain nullable rather than corrupting the database.
- `ParsedGame` and active workspace state expose the same color-based metadata.
- With White orientation, Black is above the board and White below it.
- With Black orientation, White is above the board and Black below it.
- Each available row shows username and rating; missing metadata has an accessible, non-misleading fallback.
- An obvious `Flip board` button adjacent to the board toggles the existing `boardOrientation` preference.
- The existing Settings orientation selector remains synchronized.
- Flipping is visual only: FEN, PGN, selected ply, move history, analysis, annotations, variations, and navigation state remain identical.

## 5. Scope

- Color-explicit player metadata type and persisted fields.
- Normalization of Chess.com White/Black username and rating.
- IndexedDB migration/backfill and record validation.
- Compatibility with existing query-user-relative ratings used by metrics/graphs.
- Parsed-game and workspace propagation.
- Player rows around the active board.
- A board-adjacent Flip board control wired to existing preference state/reducer behavior.
- Orientation-dependent row placement.
- Tests for schema migration, normalization, parsing, both orientations, interaction invariants, accessibility, and responsive layout.

## 6. Out of scope

- Replacing the custom board with `InteractiveChessboard` or another library.
- Rotating the underlying game state, rewriting FEN/PGN, reversing move arrays, or changing analysis perspective.
- Adding player avatars, country flags, titles, clocks, online status, profile links, or live ratings.
- Fetching missing historical usernames through additional network requests.
- Removing `userRating` and `opponentRating` from every downstream metric in this change.
- Showing a selected game's players on an aggregate opening-tree board where that matchup would be misleading.
- Spec 2 layout work; it is a prerequisite.

## 7. Affected files/components

Data/API/persistence:

- `lib/api/chesscomSchemas.ts`
  - raw Chess.com player fields already present
- `lib/api/contracts.ts`
  - normalized game summary contract
- `features/ingestion/ingestionService.ts`
  - `normalizeRawGame`
- `lib/db/schema.ts`
  - `GameRecord`
  - `SCHEMA_VERSION`
  - `NORMALIZER_VERSION`
- `lib/db/openDatabase.ts`
  - `onupgradeneeded` migration path
- game repository validator/save paths
- schema, migration, repository, normalization, and fixture-builder tests

Parsing/workspace/UI:

- `lib/chess/pgnParser.ts`
  - `ParsedGame`
  - `parseGamePgn`
- `components/workspace/ChessWorkspace.tsx`
  - `parseSelectedGame`
  - selected game/parsed game flow
  - `preferences.boardOrientation`
  - `preferences/changed` dispatch
  - `BoardPanel` props
- `components/board/ChessboardView.tsx` (exact path should follow the existing import)
  - existing orientation prop
  - `boardSquares`
  - `squareCenter`
  - transient-state orientation effect
- `components/analysis/GameSelector.tsx`
  - remove PGN-regex dependency for normal display
- `app/globals.css`
  - board shell, player rows, rating, and flip-toolbar styles
- workspace reducer/component tests, board interaction tests, responsive E2E, visual, and accessibility suites

`InteractiveChessboard` is not an affected production component unless repository navigation reveals it has become the active workspace board by implementation time.

## 8. Data model/state changes

### Persisted player metadata

Add a shared color-explicit type. Recommended shape:

```ts
type PlayerMetadata = {
  username: string | null;
  rating: number | null;
};
```

Add required container fields to normalized/persisted records:

```ts
whitePlayer: PlayerMetadata;
blackPlayer: PlayerMetadata;
```

Nullable members are required for compatibility with optional upstream fields, PGNs without headers, and old records whose opponent identity cannot always be reconstructed. Preserve the upstream username's trimmed display casing; comparisons may use a separate lowercase value but the rendered value must not.

**Design decision — property names:** Recommended `whitePlayer`/`blackPlayer`, rather than `white`/`black`, to avoid confusion with raw Chess.com player payloads and chess-piece/color values. Use the same names in `NormalizedGameSummary`, `GameRecord`, and `ParsedGame` to minimize translation layers.

### Compatibility fields

Retain existing `username`, `userColor`, `userRating`, and `opponentRating` in this implementation. Derive the relative ratings from `whitePlayer`/`blackPlayer` for new records and validate consistency where practical. Existing graph/metric code depends on these fields; removing them would expand this spec substantially. Mark them as compatibility/derived fields for a later cleanup.

### Workspace state

Do not add a second orientation state. Reuse `state.preferences.boardOrientation` and the existing `preferences/changed` reducer action.

Player data may remain derived from the selected `ParsedGame`/record rather than duplicated in reducer state. The board receives:

```ts
players?: {
  white: PlayerMetadata;
  black: PlayerMetadata;
};
```

and a flip callback. This is component data, not independent mutable state.

## 9. Detailed implementation approach

### A. Normalize explicit players

In `normalizeRawGame`:

- create `whitePlayer` from `raw.white.username` and `raw.white.rating`;
- create `blackPlayer` from the corresponding Black fields;
- trim usernames but preserve display casing;
- convert absent/empty username to `null`;
- accept only finite, plausible values under the repository's existing rating validation policy; otherwise use `null`;
- keep query username normalization for account identity and derive `userRating`/`opponentRating` from the color-explicit fields plus `userColor`.

Do not parse the PGN for new Chess.com records when authoritative raw player fields are present.

### B. Migrate old records

Bump `SCHEMA_VERSION` from `2` to `3`. In `openDatabase`'s upgrade transaction, cursor through the `games` store and add missing player objects:

1. Parse `[White "..."]` and `[Black "..."]` headers with one shared, tested PGN-header helper rather than leaving regexes embedded in `GameSelector`.
2. Map `record.username` to the known user color if a corresponding PGN header is absent.
3. Map `userRating` and `opponentRating` to White/Black according to `userColor`.
4. Use `null` for any identity/rating that cannot be recovered.
5. Update the record in the same upgrade transaction.

The migration must not abort because a PGN is empty, escaped unusually, or lacks one header. Repository validation after migration should require the two player containers but allow nullable members.

**Design decision — PGN extraction:** Recommended: place a small shared header parser beside the existing chess/PGN parsing utilities and use it both in migration and full game parsing. Do not retain multiple ad hoc regex implementations. If the installed chess parser already exposes headers in the repository's current version, use that verified API instead.

### C. Update normalization version

After Spec 1, bump `NORMALIZER_VERSION` from `2` to `3`. This refetches account archives so authoritative raw player metadata replaces best-effort backfill. The schema migration provides immediate offline compatibility; the later online normalization improves it.

If this spec lands in a different sequence, use the next normalizer version. Schema version remains independently `3` unless another migration has already advanced it.

### D. Propagate through parsing and selection

- Extend `ParsedGame` with `whitePlayer` and `blackPlayer`.
- `parseGamePgn` should populate these from the persisted/normalized selected-game values, using parsed headers only as a fallback at the parser boundary.
- Update `parseSelectedGame` in `ChessWorkspace` so the selected record's explicit metadata reaches the parsed game and board.
- Update `GameSelector` to use `whitePlayer`/`blackPlayer` directly for labels and opponent derivation. Retain a fallback only for transient pre-migration fixtures if required by tests; production records should be migrated.
- Do not show selected-game player rows in the opening-tree/aggregate board mode unless that board truly represents the selected game.

### E. Render oriented player rows

Have the active board wrapper render this vertical order:

1. compact board toolbar containing `Flip board`;
2. top player row;
3. board stage;
4. bottom player row.

Derive colors only from orientation:

```text
orientation white => top black, bottom white
orientation black => top white, bottom black
```

Each row shows the display username and, when present, rating in a secondary label such as `(1542)`. Use a stable fallback such as `White player`/`Black player` when username is missing; omit the rating fragment when unknown. Include the color in an accessible label even when visual proximity makes it obvious.

**Design decision — component ownership:** Recommended: keep player-row and toolbar composition in `ChessboardView` (or its immediate board shell) because both are orientation-dependent visual chrome. `ChessWorkspace` owns the data and callback, but should not independently calculate top/bottom order. This gives all arrows, coordinates, rows, and flip control one orientation source.

### F. Add Flip board control

- Add a visible text button labeled `Flip board` in the board toolbar, not an icon-only or Settings-only control.
- In `ChessWorkspace`, implement the callback by dispatching the existing `preferences/changed` action with the opposite of `state.preferences.boardOrientation`.
- Keep the Settings selector. Both controls read the same state, so either interaction updates the other automatically.
- Do not dispatch navigation, game-selection, analysis, or variation actions.

The existing orientation behavior already covers:

- square order via `boardSquares(fen, orientation)`;
- arrow transforms via `squareCenter`;
- orientation-aware keyboard navigation;
- board highlights because squares are addressed by chess coordinates rather than screen positions.

The existing orientation effect may clear transient focus, selected source square, legal targets, or a pending promotion. Preserve that safety behavior; it is visual interaction cleanup, not chess-state mutation.

## 10. Step-by-step implementation tasks

1. Add schema/normalization tests for explicit White/Black player metadata, display casing, missing usernames, and missing ratings.
2. Add migration tests for a full-header record, missing opponent header, both user colors, and empty/malformed header data.
3. Introduce `PlayerMetadata` and `whitePlayer`/`blackPlayer` on normalized, persisted, and parsed types.
4. Update `normalizeRawGame` and derive compatibility ratings.
5. Add the shared PGN-header fallback helper and replace `GameSelector`'s embedded name regex.
6. Implement the IndexedDB `SCHEMA_VERSION` migration and update strict record validation.
7. Increment `NORMALIZER_VERSION` monotonically and update fixtures/freshness expectations.
8. Propagate metadata through `parseGamePgn`, `parseSelectedGame`, and the active workspace/board props.
9. Add oriented top/bottom player rows and responsive CSS.
10. Add the board toolbar and visible Flip board button.
11. Wire flip to the existing preference action/state and keep Settings synchronized.
12. Add reducer/DOM/E2E assertions that only orientation changes.
13. Run migration, repository, ingestion, parsing, board interaction, workspace, responsive, visual, accessibility, type, and full test suites.

## 11. Testing strategy

### Normalization and persistence

- Raw mixed-case usernames are preserved for display.
- White and Black ratings stay attached to their colors regardless of queried account color.
- Missing raw username/rating becomes `null`, not an invalid record or fabricated value.
- Existing relative ratings are correctly derived for White-user and Black-user cases.
- Repository round-trip preserves player objects.

### Migration

- Version-2 record with both PGN headers backfills both names and both ratings.
- User as White and user as Black map ratings correctly.
- Missing opponent header yields `username: null` for that side and completes migration.
- Empty/malformed PGN does not abort database opening.
- Already-upgraded records are not overwritten or re-cased.
- Store/index definitions remain intact and repository validation succeeds after upgrade.

### Parsing/workspace

- Selected game metadata reaches `ParsedGame`, `ChessWorkspace`, and the board.
- `GameSelector` displays stored explicit metadata without depending on PGN regex recovery.
- Aggregate opening-board mode does not show a misleading selected matchup.

### Orientation UI

- White orientation: Black row above, White row below.
- Black orientation: White row above, Black row below.
- Username casing and ratings render correctly; null rating is omitted; null username has a color-specific fallback.
- Flip button toggles orientation and the Settings control reflects the result.
- Settings changes reorder the same rows and board.
- Button is keyboard accessible, has a visible focus state, and is not icon-only.

### Visual-only invariants

Before and after flip, assert equality for:

- FEN/current position;
- selected ply and move-history length/order;
- loaded PGN/game ID;
- analysis status, accuracy, annotations, and selected annotation;
- active variation and variation moves;
- last-move/check highlights by chess square.

Assert that visual square order, coordinates, arrows, and player-row positions do change appropriately.

## 12. Regression cases

- User is White versus user is Black.
- Username differs only by casing from the queried account.
- Guest/unknown player, missing rating, zero/invalid raw rating, and PGN without headers.
- Old IndexedDB record available offline before an archive refetch.
- Opening-tree tab versus game-review/analyzer tab.
- Flip at ply `0`, middle ply, final ply, during analysis, and while viewing an analysis variation.
- Flip with arrows, last-move highlight, check highlight, keyboard focus, a selected source square, and a pending promotion.
- Repeated rapid flips.
- Desktop after Spec 2's viewport-bound context, and narrow mobile where player names must wrap or truncate without horizontal overflow.
- Very long usernames and ratings with four or more digits.

## 13. Migration/versioning considerations

- Increment IndexedDB `SCHEMA_VERSION` from `2` to `3` to add/backfill required player containers on existing records.
- Increment `NORMALIZER_VERSION` from Spec 1's `2` to `3` so online sync obtains authoritative raw player data. Use monotonic next values if landing order differs.
- The schema migration must be sufficient for offline access; the normalization refetch is an enhancement, not a prerequisite for opening the app.
- Old records cannot always recover an opponent username. Nullable metadata is therefore part of the durable schema, not a temporary migration loophole.
- Do not change the reducer persistence format for orientation; it already exists.
- Spec 3 may add optional upstream accuracy later. That should normally require only the next normalizer bump, not another schema bump, unless its implementation changes IndexedDB indexes or required shape.

## 14. Dependencies

- Spec 1 should land first because both modify `NORMALIZER_VERSION`, `GameRecord` fixtures, and `normalizeRawGame`.
- Spec 2 must land before adding player rows/toolbar so the board/context viewport budget is established and the new board chrome can be verified against it.
- Issues 4 and 5 are intentionally one spec: orientation is the source of truth for player-row placement.
- Spec 3 benefits from these explicit color-based ratings for rating-context plumbing and should land afterward.
- No dependency on a new chessboard library; existing `ChessboardView` orientation support is sufficient.

## 15. Risks and edge cases

- IndexedDB upgrade transactions can abort on one thrown parse/validation error. Migration must be defensive and use nullable fallbacks.
- PGN headers can contain escaped quotes or be absent. Prefer a verified parser API; if a helper is needed, test escaping instead of copying the current one-off regex unchanged.
- Keeping both color-based and user-relative ratings creates temporary duplication. Centralize derivation and test consistency to prevent drift.
- A long username can widen the board shell. Use `min-width: 0`, controlled wrapping/ellipsis, and retain the full value in an accessible name/title where consistent with project patterns; do not hide the whole row.
- The flip callback must not close over stale orientation. Dispatch from the current render or use the reducer's established pattern.
- Clearing a pending promotion on flip is acceptable safety cleanup but should be documented/tested so it is not confused with history mutation.
- An opening-tree board represents aggregate data; showing selected-game names there would communicate a false association.
- Added vertical board chrome slightly reduces available board area. Verify after Spec 2 at the reference desktop and mobile viewports.

## 16. Acceptance criteria

- New normalized/persisted games contain explicit `whitePlayer` and `blackPlayer` metadata with display-case username and optional rating.
- Version-2 records migrate safely to the new schema, including when opponent metadata cannot be recovered.
- Existing user-relative rating consumers continue to work.
- The active game board shows the opponent above and oriented side below, with username and rating when available.
- White and Black orientations swap both board geometry and player-row placement correctly.
- An obvious visible `Flip board` control sits adjacent to the board and is keyboard accessible.
- The control and Settings reuse one `preferences.boardOrientation` value and reducer action.
- Flip changes no FEN, PGN, selected ply, move history, analysis, annotations, or variations.
- Arrows, highlights, coordinates, keyboard navigation, and interactive moves remain correct in both orientations.
- Schema, migration, ingestion, parsing, workspace, board, responsive, accessibility, visual, type, and full tests pass.

## 17. Recommended implementation order

Within this spec: establish types/tests, implement defensive migration and normalization, propagate metadata, render rows, then wire the existing orientation state to the new control and verify visual-only invariants.

Across all specs: implement third—after Spec 1's normalizer fix and Spec 2's layout restructuring, but before Spec 3 so analysis can consume explicit color-based ratings and the finalized analyzer/player UI surfaces.
