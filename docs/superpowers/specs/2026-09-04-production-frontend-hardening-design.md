# Production Frontend Hardening Design

## Goal

Make the local chess reviewer dependable, understandable, and visually intentional for public users while preserving its local-first architecture.

## Product decisions

- The board remains the focal workspace once games are loaded; the newest returned game is selected automatically.
- Import settings are progressive: advanced controls are genuinely hidden until requested, and invalid input is always explained beside the relevant field.
- A stored search may be reloaded from the import rail, while user preferences persist locally.
- Game selection uses information-rich cards that expose date, colour, result, ratings, time class, and analysis status at every viewport size.
- Destructive local-data actions use a real modal with a visible danger action, a neutral escape action, keyboard handling, and inert background content.
- Gold indicates the primary next action or current workspace only. Secondary, row, and destructive actions have distinct treatments.
- Internal phase harness routes are removed from the public application.

## Constraints

- Preserve Chess.com ingestion, IndexedDB game storage, opening-tree calculations, Stockfish analysis, and keyboard board navigation.
- Do not add a dependency for visual icons or styling.
- Keep the public application entirely local-first: preference and recent-query metadata stay in browser local storage.
- The user asked not to run automated tests in this pass. Verification therefore uses static checks and manual browser inspection.

## Architecture

`useWorkspace` owns small local-storage adapters for persisted preferences and a recent query. The workspace reducer selects the newest returned game when an import completes. Presentational components own the new import summary, game cards, modal behavior, and visual hierarchy; controller and ingestion service interfaces remain stable.

## Acceptance criteria

1. The advanced import controls are not rendered visually while collapsed.
2. Invalid dates and invalid opening horizons have visible, accessible messages and prevent submission.
3. A completed non-empty import selects a game and displays the board without an extra selection step.
4. Preferences and a recent query survive a reload.
5. The game list is scannable at narrow and wide workspace widths.
6. Destructive deletion is an accessible modal, and clear-all remains available for orphaned local records even when no stored username is listed.
7. The document has one main landmark, an application-wide error fallback, and no phase harness routes.
8. Desktop, tablet, and mobile layouts keep actions legible without horizontal page overflow.
