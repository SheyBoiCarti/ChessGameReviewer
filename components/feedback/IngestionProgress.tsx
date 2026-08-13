import type { IngestionProgress as Progress } from '@/features/ingestion/types';

export function IngestionProgress({
  progress,
  onCancel,
}: {
  progress: Progress;
  onCancel(): void;
}) {
  const { detail, determinate, heading } = statusCopy(progress);
  return (
    <section className="status-card" role="status" aria-live="polite" aria-atomic="true">
      <span className="status-label status-label--loading">Loading</span>
      <h3>{heading}</h3>
      <p>{detail}</p>
      {determinate ? (
        <progress value={progress.monthsCompleted} max={progress.monthsPlanned}>
          {detail}
        </progress>
      ) : (
        <progress>{detail}</progress>
      )}
      <button type="button" onClick={onCancel}>
        Cancel loading
      </button>
    </section>
  );
}

function statusCopy(progress: Progress): {
  heading: string;
  detail: string;
  determinate: boolean;
} {
  const month = progress.currentMonth ? formatMonth(progress.currentMonth) : null;
  const heading =
    progress.phase === 'planning'
      ? 'Finding game archives'
      : progress.phase === 'loading-cache'
        ? 'Checking saved games'
        : progress.phase === 'fetching'
          ? month
            ? `Loading ${month}`
            : 'Loading game archives'
          : 'Organizing loaded games';
  const determinate = progress.monthsPlanned > 0;
  const detail = determinate
    ? `${progress.monthsCompleted} of ${progress.monthsPlanned} archive months complete. ${progress.recordsAccepted} games found.`
    : `${progress.recordsAccepted} games found so far.`;

  return { heading, detail, determinate };
}

function formatMonth(month: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}
