import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { qualityLabel } from '@/features/stockfish-analysis/presentation';

import { PrincipalVariationList } from './PrincipalVariationList';

export function EngineAnnotationPanel({
  annotation,
  startFen,
  onSelectPly,
}: {
  annotation: GameAnnotation;
  startFen: string | undefined;
  onSelectPly(ply: number): void;
}) {
  return (
    <article className="annotation-panel">
      <h4>
        Ply {annotation.ply}: {annotation.san}
      </h4>
      <dl>
        <div>
          <dt>Quality</dt>
          <dd>{qualityLabel(annotation.accuracy)}</dd>
        </div>
        <div>
          <dt>Played move</dt>
          <dd>{annotation.san}</dd>
        </div>
        <div>
          <dt>Best move</dt>
          <dd>{annotation.before.bestMove}</dd>
        </div>
        <div>
          <dt>Depth</dt>
          <dd>{annotation.before.depth}</dd>
        </div>
      </dl>
      <button type="button" onClick={() => onSelectPly(annotation.ply)}>
        Show this position on board
      </button>
      <PrincipalVariationList annotation={annotation} startFen={startFen} />
    </article>
  );
}
