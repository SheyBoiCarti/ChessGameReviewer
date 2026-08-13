# Workspace Layout Stability Design

## Goal

Keep the chessboard, evaluation bar, game list, and opening-candidate list geometrically stable as their content changes. Pieces and result counts must not resize the board or extend the page indefinitely.

## Scope

This change is limited to the current board-first workspace redesign. It preserves all chess navigation, game filtering and sorting, opening-tree navigation, accessibility semantics, themes, and responsive breakpoints. It does not add virtualization, pagination, or new user settings.

## Root Causes

- The chessboard declares eight equal columns but no explicit rows. CSS therefore creates content-sized automatic rows, and intrinsic piece-image dimensions make occupied rows taller than empty rows.
- The evaluation bar is a grid sibling of the complete board region, which includes move-history controls. It stretches beside the board and controls together. Its label also consumes a separate grid row, so the fill is not measured against the full board height.
- The game and opening-candidate collections have horizontal overflow handling but no bounded vertical result viewport. Every additional row increases the document height.

## Design

### Chessboard Geometry

The board remains a semantic 8-row grid with 64 grid cells. CSS will declare both `repeat(8, minmax(0, 1fr))` columns and rows on the square board. Board cells will allow zero minimum height and width, and piece images will be block-level, contained assets that cannot contribute a larger intrinsic track size.

Every square will therefore have the same computed width and height before a game is selected, after a game is selected, and after moving through history. Highlights, coordinate labels, pieces, and the principal-variation arrow remain overlays inside that fixed geometry.

### Evaluation Bar

The evaluation bar will move into the board-stage layout owned by `ChessboardView`. `ChessWorkspace` will pass the selected evaluation score to the board rather than laying out the bar beside the entire `BoardPanel`.

The board stage will contain exactly two aligned items when an evaluation exists: the bar and the framed chessboard. Move-history controls remain below that stage and do not affect the bar height. The bar itself will be a single full-height track with its White fill positioned from the bottom and its text layered over the track, so the percentage always uses the complete board height.

When no annotation is selected, the evaluation bar is omitted and the board retains its current full-width layout. Unknown evaluations continue to render the existing 50% neutral state and accessible meter text.

### Bounded Result Collections

`GameSelector` and `OpeningTreeTable` will each put only their dynamic collection into a dedicated result viewport. Headings, help text, breadcrumbs, filter controls, and sort controls remain outside the scrolling region and stay visible.

Each populated result viewport will use an item-count-independent block size of `clamp(16rem, 45dvh, 28rem)` with vertical scrolling and contained overscroll. The viewport may scroll horizontally when a table is wider than its container. This responsive fixed bound prevents the document from growing with additional games or candidate moves while retaining usable space on short and tall screens.

Table headers will remain visible at the top of their result viewport while rows scroll. Compact game cards use the same vertical viewport contract as the desktop table. Empty-state messaging remains visible without forcing an empty fixed-height region.

## Component Boundaries

- `ChessWorkspace` selects the current analysis annotation and passes only its evaluation score into `BoardPanel`.
- `BoardPanel` forwards the optional score to `ChessboardView`.
- `ChessboardView` owns the visual relationship between the evaluation bar, framed board, and move-history controls.
- `EvaluationBar` remains responsible for accessible meter semantics and normalized fill presentation.
- `GameSelector` owns the game-results viewport around either its table or compact list.
- `OpeningTreeTable` owns the candidate-results viewport around its table.
- `app/globals.css` defines the shared fixed-grid and bounded-scroll layout rules.

No data-processing or persistence flow changes.

## Accessibility and Failure Behaviour

The existing grid, row, grid-cell, table, list, button, and meter semantics remain intact. Each result viewport will be keyboard-focusable and labelled as either `Game results` or `Opening candidate results`, allowing keyboard users to scroll it directly without replacing the nested table or list semantics.

Invalid FEN handling, missing graph-position handling, empty candidate handling, and unavailable evaluation handling remain unchanged. Layout constraints must not clip focus outlines, selected-row indicators, board labels, or move highlights.

## Testing

Regression coverage will verify observable browser layout rather than source strings:

- All 64 chessboard cells have equal square bounding boxes in an initial position and after navigating to a move that changes piece occupancy.
- The board remains square and does not change dimensions merely because different rows contain pieces.
- A rendered evaluation bar has the same top and bottom coordinates as the framed chessboard, while move controls sit below both.
- Its White fill occupies the expected proportion of the full bar track for a known evaluation.
- A game fixture large enough to overflow keeps the game-results viewport height unchanged, exposes vertical scroll overflow, and does not increase the page by the sum of all rows.
- An opening graph with enough candidates behaves the same way, with the candidate table header remaining visible while rows scroll.
- Existing DOM, responsive, accessibility, visual-regression, typecheck, lint, and production-build checks remain green.

## Acceptance Criteria

1. Every visible chessboard square has identical width and height at all tested positions and supported viewport sizes.
2. Adding, removing, or moving a piece cannot alter any grid-track dimension.
3. The evaluation bar aligns only with the framed board and its fill measures against the full aligned height.
4. Game rows and compact game cards scroll inside a stable bounded viewport while game controls remain visible.
5. Opening candidates scroll inside a stable bounded viewport while opening controls remain visible.
6. Collection size no longer causes unbounded document-height growth.
7. The fixes preserve responsive layout, keyboard access, accessible semantics, and existing behavior.
