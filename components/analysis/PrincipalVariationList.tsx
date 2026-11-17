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
  const firstMove = annotation.before.pv[0];
  const legalFirstMove = firstMove && !convertPvToSan(startFen, [firstMove]).diagnostic;
  return (
    <div className="pv-container">
      <h5>Principal variation</h5>
      <p>Alternative to the selected move, from the position before it.</p>
      <p>
        {converted.diagnostic
          ? 'The continuation is unavailable as chess notation.'
          : converted.moves.join(' ') || 'No principal variation was returned.'}
      </p>
      {converted.diagnostic ? (
        <details>
          <summary>Advanced variation details</summary>
          <p>UCI: {annotation.before.pv.join(' ')}</p>
          <p>{converted.diagnostic}</p>
        </details>
      ) : null}
      {onExplorePv && annotation.before.pv.length > 0 ? (
        <button
          type="button"
          className="button-secondary pv-explore-button"
          disabled={!legalFirstMove}
          onClick={() => onExplorePv(startFen, annotation.before.pv)}
        >
          Explore line on board
        </button>
      ) : null}
    </div>
  );
}
