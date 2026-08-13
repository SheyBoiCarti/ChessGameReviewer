import type { IngestionProgress as Progress } from '@/features/ingestion/types';

export function IngestionProgress({
  progress,
  onCancel,
}: {
  progress: Progress;
  onCancel(): void;
}) {
  const maximum = Math.max(1, progress.monthsPlanned);
  return (
    <section className="status-card" role="status" aria-live="polite" aria-atomic="true">
      <h3>Loading game archives</h3>
      <p>
        {progress.monthsCompleted} of {progress.monthsPlanned} archive months complete.{' '}
        {progress.recordsAccepted} games accepted and {progress.recordsExcluded} excluded.
      </p>
      <progress value={progress.monthsCompleted} max={maximum}>
        {progress.monthsCompleted} of {progress.monthsPlanned}
      </progress>
      <button type="button" onClick={onCancel}>
        Cancel loading
      </button>
    </section>
  );
}
