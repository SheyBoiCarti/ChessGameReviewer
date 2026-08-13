import type { EvaluationScore } from '@/lib/engine/evaluation';
import { normalizeEvaluationBar } from '@/features/board/evaluationBar';

export function EvaluationBar({ score }: { score?: EvaluationScore }) {
  const view = normalizeEvaluationBar(score);
  return (
    <div
      className="evaluation-bar"
      role="meter"
      aria-label="White-perspective evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(view.whitePercent)}
      aria-valuetext={view.text}
    >
      <span
        className="evaluation-bar__white"
        style={{ height: `${view.whitePercent}%` }}
        aria-hidden="true"
      />
      <span className="evaluation-bar__text">{view.text}</span>
    </div>
  );
}
