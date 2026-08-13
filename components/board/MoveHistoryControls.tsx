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
      <button
        type="button"
        aria-label="First position"
        onClick={() => onPlyChange(0)}
        disabled={currentPly === 0}
      >
        <span aria-hidden="true">↞</span>
        <span>Start</span>
      </button>
      <button
        type="button"
        aria-label="Previous move"
        onClick={() => onPlyChange(Math.max(0, currentPly - 1))}
        disabled={currentPly === 0}
      >
        <span aria-hidden="true">‹</span>
        <span>Back</span>
      </button>
      <span className="move-history-controls__ply" aria-live="polite">
        Ply {currentPly} of {totalPlies}
      </span>
      <button
        type="button"
        aria-label="Next move"
        onClick={() => onPlyChange(Math.min(totalPlies, currentPly + 1))}
        disabled={currentPly >= totalPlies}
      >
        <span>Next</span>
        <span aria-hidden="true">›</span>
      </button>
      <button
        type="button"
        aria-label="Last position"
        onClick={() => onPlyChange(totalPlies)}
        disabled={currentPly >= totalPlies}
      >
        <span>End</span>
        <span aria-hidden="true">↠</span>
      </button>
    </div>
  );
}
