import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import { convertPvToSan, qualityLabel } from '@/features/stockfish-analysis/presentation';
import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';

import { PrincipalVariationList } from './PrincipalVariationList';

export function EngineAnnotationPanel({
  annotation,
  startFen,
  onSelectPly,
  onExplorePv,
}: {
  annotation: GameAnnotation;
  startFen: string | undefined;
  onSelectPly(ply: number): void;
  onExplorePv?: ((startFen: string, uciMoves: readonly string[]) => void) | undefined;
}) {
  const bestMoveSan = startFen
    ? (convertPvToSan(startFen, [annotation.before.bestMove]).moves[0] ??
      annotation.before.bestMove)
    : annotation.before.bestMove;

  return (
    <article className="annotation-panel">
      <h4>
        <span>
          Ply {annotation.ply}: {annotation.san}
        </span>
        {annotation.accuracy.status === 'classified' ? (
          <MoveClassificationBadge quality={annotation.accuracy.quality} size="inline" />
        ) : null}
      </h4>
      <dl>
        <div>
          <dt>Quality</dt>
          <dd>
            {annotation.accuracy.status === 'classified' ? (
              <MoveClassificationBadge
                quality={annotation.accuracy.quality}
                size="inline"
                ariaHidden
              />
            ) : null}
            <span>{qualityLabel(annotation.accuracy)}</span>
          </dd>
        </div>
        <div>
          <dt>Played move</dt>
          <dd>{annotation.san}</dd>
        </div>
        <div>
          <dt>Best move</dt>
          <dd>
            {bestMoveSan !== annotation.before.bestMove
              ? `${bestMoveSan} (${annotation.before.bestMove})`
              : bestMoveSan}
          </dd>
        </div>
        <div>
          <dt>Depth</dt>
          <dd>{annotation.before.depth}</dd>
        </div>
      </dl>
      <button type="button" onClick={() => onSelectPly(annotation.ply)}>
        Show this position on board
      </button>
      <PrincipalVariationList
        annotation={annotation}
        startFen={startFen}
        onExplorePv={onExplorePv}
      />
    </article>
  );
}
