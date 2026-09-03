import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { convertPvToSan } from '@/features/stockfish-analysis/presentation';

export function PrincipalVariationList({
  annotation,
  startFen,
  onExplorePv,
}: {
  annotation: GameAnnotation;
  startFen: string | undefined;
  onExplorePv?: ((startFen: string, uciMoves: readonly string[]) => void) | undefined;
}) {
  if (!startFen) return <p>Principal variation start position is unavailable.</p>;
  const converted = convertPvToSan(startFen, annotation.before.pv);
  return (
    <div className="pv-container">
      <h5>Principal variation</h5>
      <p>{converted.moves.join(' ') || 'No principal variation was returned.'}</p>
      {converted.diagnostic ? <p role="status">{converted.diagnostic}</p> : null}
      {onExplorePv && annotation.before.pv.length > 0 ? (
        <button
          type="button"
          className="button-secondary pv-explore-button"
          onClick={() => onExplorePv(startFen, annotation.before.pv)}
        >
          Explore line on board
        </button>
      ) : null}
    </div>
  );
}
