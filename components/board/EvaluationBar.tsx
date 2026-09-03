import type { EvaluationScore } from '@/lib/engine/evaluation';
import { normalizeEvaluationBar } from '@/features/board/evaluationBar';

export function EvaluationBar({
  score,
  orientation = 'white',
}: {
  score?: EvaluationScore;
  orientation?: 'white' | 'black';
}) {
  const view = normalizeEvaluationBar(score);
  const whiteStyle =
    orientation === 'black'
      ? { top: 0, bottom: 'auto', height: `${view.whitePercent}%` }
      : { bottom: 0, top: 'auto', height: `${view.whitePercent}%` };

  return (
    <div
      className="evaluation-bar"
      role="meter"
      aria-label="White-perspective evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(view.whitePercent)}
      aria-valuetext={view.text}
      data-orientation={orientation}
    >
      <span className="evaluation-bar__white" style={whiteStyle} aria-hidden="true" />
      <span className="evaluation-bar__text">{view.text}</span>
    </div>
  );
}
