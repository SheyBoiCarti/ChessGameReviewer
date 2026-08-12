import type { EvaluationScore } from '@/lib/engine/evaluation';
import { normalizeEvaluationBar } from '@/features/board/evaluationBar';

export function EvaluationBar({ score }: { score?: EvaluationScore }) {
  const view = normalizeEvaluationBar(score);
  return (
    <div className="evaluation-bar" role="meter" aria-label="White-perspective evaluation">
      <span className="evaluation-text">{view.text}</span>
      <span className="evaluation-track" aria-hidden="true">
        <span className="evaluation-white" style={{ height: `${view.whitePercent}%` }} />
      </span>
    </div>
  );
}
