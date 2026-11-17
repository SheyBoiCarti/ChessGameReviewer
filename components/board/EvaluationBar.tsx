import type { EvaluationScore } from '@/lib/engine/evaluation';
import { formatEvaluationScore, normalizeEvaluationBar } from '@/features/board/evaluationBar';

export type EvaluationBarMode = 'vertical' | 'horizontal';

export interface EvaluationBarProps {
  score?: EvaluationScore | undefined;
  orientation?: 'white' | 'black' | undefined;
  mode?: EvaluationBarMode | undefined;
  className?: string | undefined;
}

export function EvaluationBar({
  score,
  orientation = 'white',
  mode = 'vertical',
  className,
}: EvaluationBarProps) {
  const view = normalizeEvaluationBar(score);
  const pillScore = formatEvaluationScore(score);

  const containerStyle: React.CSSProperties =
    mode === 'horizontal'
      ? { width: '100%', height: '6px', borderRadius: '999px' }
      : { width: '28px', height: '100%', borderRadius: '6px' };

  const whiteStyle: React.CSSProperties =
    mode === 'horizontal'
      ? {
          top: 0,
          bottom: 0,
          height: '100%',
          ...(orientation === 'black' ? { right: 0, left: 'auto' } : { left: 0, right: 'auto' }),
          width: `${view.whitePercent}%`,
          transition: 'width 160ms cubic-bezier(0.4, 0, 0.2, 1)',
        }
      : {
          left: 0,
          right: 0,
          width: '100%',
          ...(orientation === 'black' ? { top: 0, bottom: 'auto' } : { bottom: 0, top: 'auto' }),
          height: `${view.whitePercent}%`,
          transition: 'height 160ms cubic-bezier(0.4, 0, 0.2, 1)',
        };

  return (
    <div
      className={`evaluation-bar evaluation-bar--${mode}${className ? ` ${className}` : ''}`}
      role="meter"
      aria-label="White-perspective evaluation"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(view.whitePercent)}
      aria-valuetext={view.text}
      data-orientation={orientation}
      data-mode={mode}
      style={
        {
          '--eval-percent': `${view.whitePercent}%`,
          ...containerStyle,
        } as React.CSSProperties
      }
    >
      <span className="evaluation-bar__white" style={whiteStyle} aria-hidden="true" />
      {mode === 'vertical' ? <span className="evaluation-bar__text">{pillScore}</span> : null}
    </div>
  );
}
