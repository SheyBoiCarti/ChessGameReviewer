import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { convertPvToSan } from '@/features/stockfish-analysis/presentation';

export function PrincipalVariationList({
  annotation,
  startFen,
}: {
  annotation: GameAnnotation;
  startFen: string | undefined;
}) {
  if (!startFen) return <p>Principal variation start position is unavailable.</p>;
  const converted = convertPvToSan(startFen, annotation.before.pv);
  return (
    <div>
      <h5>Principal variation</h5>
      <p>{converted.moves.join(' ') || 'No principal variation was returned.'}</p>
      {converted.diagnostic ? <p role="status">{converted.diagnostic}</p> : null}
    </div>
  );
}
