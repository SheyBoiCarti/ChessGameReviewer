import type { GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import {
  convertPvToSan,
  qualityLabel,
  moveNotation,
} from '@/features/stockfish-analysis/presentation';
import { MoveClassificationBadge } from '@/components/board/MoveClassificationBadge';

import { EvaluationComparison } from './ReviewFeedback';
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
        <span>{moveNotation(annotation.ply, annotation.san, annotation.mover)}</span>
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
          <dd>{bestMoveSan}</dd>
        </div>
      </dl>
      <EvaluationComparison annotation={annotation} />
      <details>
        <summary>Advanced details</summary>
        <p>
          Depth {annotation.before.depth} · UCI {annotation.before.bestMove}
        </p>
      </details>
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
