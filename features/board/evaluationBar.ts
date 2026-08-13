import type { EvaluationScore } from '@/lib/engine/evaluation';

export type EvaluationBarView =
  | { kind: 'unknown'; whitePercent: 50; text: 'Evaluation unavailable' }
  | { kind: 'cp'; value: number; whitePercent: number; text: string }
  | { kind: 'mate'; value: number; whitePercent: number; text: string };

export function normalizeEvaluationBar(score: EvaluationScore | undefined): EvaluationBarView {
  if (!score || !Number.isFinite(score.value)) {
    return { kind: 'unknown', whitePercent: 50, text: 'Evaluation unavailable' };
  }
  if (score.kind === 'mate') {
    const side = score.value >= 0 ? 'White' : 'Black';
    const distance = Math.abs(score.value);
    return {
      kind: 'mate',
      value: score.value,
      whitePercent: score.value > 0 ? 100 : score.value < 0 ? 0 : 50,
      text: `${side} has mate in ${distance}`,
    };
  }
  const whitePercent = 100 / (1 + Math.exp(-score.value / 400));
  const pawns = score.value / 100;
  return {
    kind: 'cp',
    value: score.value,
    whitePercent,
    text: `${pawns >= 0 ? 'White' : 'Black'} advantage ${Math.abs(pawns).toFixed(2)} pawns`,
  };
}
