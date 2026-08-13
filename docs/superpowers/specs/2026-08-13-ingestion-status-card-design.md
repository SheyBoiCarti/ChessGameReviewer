# Ingestion Status Card Design

## Goal

Replace the generic, blocking-looking ingestion progress presentation with a compact status card that makes an active game load understandable and controllable.

## User experience

The game-query utility rail remains open while a load is active. The submitted filters remain visible but disabled, so the active request is clear without permitting a conflicting submission.

The status card appears beneath the form and contains:

- a concise phase heading derived from ingestion progress: finding archives, checking saved games, loading a named archive month, or filtering games;
- a plain-language detail line that states the current month when known, how many archive months have completed when that count is known, and the number of games found;
- an indeterminate activity indicator while archive discovery is still determining the total work;
- a determinate native progress bar after the archive plan is known;
- a visible Cancel loading action.

The card must not imply that the application is frozen. It must announce meaningful updates politely to assistive technology and preserve existing cancellation behavior.

## Data flow

`IngestionProgress` already exposes the phase, current month, planned and completed months, records accepted, data source, and retry state. The presentation component will map this existing data to display strings and progress mode. No ingestion-service or API behavior changes are required.

## Component boundaries

`IngestionProgress` owns the phase-to-copy mapping and accessible status output. `ChessWorkspace` continues to decide when the card is visible and to supply cancellation. Styling stays scoped to the existing feedback/status classes.

## Error handling and accessibility

The card will use a polite live region for changing status text. A progress element will expose a value and maximum only when the total number of months is known; otherwise it will omit these values to communicate indeterminate work. The cancel button remains keyboard accessible and retains its current handler.

## Testing

DOM tests will cover planning, archive loading, cache loading, filtering, the determinate and indeterminate progress states, and cancellation. Existing workspace coverage must continue to verify that loading disables duplicate query submission.
