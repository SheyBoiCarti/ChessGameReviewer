export function MoveHistoryControls({
  currentPly,
  totalPlies,
  onPlyChange,
}: {
  currentPly: number;
  totalPlies: number;
  onPlyChange(ply: number): void;
}) {
  return (
    <div className="move-history-controls" aria-label="Move history controls">
      <button type="button" onClick={() => onPlyChange(0)} disabled={currentPly === 0}>
        First position
      </button>
      <button
        type="button"
        onClick={() => onPlyChange(Math.max(0, currentPly - 1))}
        disabled={currentPly === 0}
      >
        Previous move
      </button>
      <span aria-live="polite">
        Ply {currentPly} of {totalPlies}
      </span>
      <button
        type="button"
        onClick={() => onPlyChange(Math.min(totalPlies, currentPly + 1))}
        disabled={currentPly >= totalPlies}
      >
        Next move
      </button>
      <button
        type="button"
        onClick={() => onPlyChange(totalPlies)}
        disabled={currentPly >= totalPlies}
      >
        Last position
      </button>
    </div>
  );
}
