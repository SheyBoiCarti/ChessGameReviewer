import type { IngestionResult } from '@/features/ingestion/types';

export function DiagnosticSummary({
  result,
  onRetry,
  onViewGames,
}: {
  result: IngestionResult;
  onRetry(): void;
  onViewGames?(): void;
}) {
  const urgent = result.status === 'partial' || result.status === 'failed';
  return (
    <section className={`status-card status-${result.status}`} role={urgent ? 'alert' : 'status'}>
      <span className={`status-label status-label--${result.status}`}>
        {statusLabel(result.status)}
      </span>
      <h3>{heading(result)}</h3>
      <p>{guidance(result)}</p>
      {result.status === 'cancelled' && result.games.length > 0 && onViewGames ? (
        <button type="button" onClick={onViewGames}>
          View games
        </button>
      ) : null}
      {result.failedMonths.length > 0 ? (
        <>
          <h4>Failed archive months</h4>
          <ul>
            {result.failedMonths.map((month) => (
              <li key={month.month}>
                <strong>{month.month}</strong>: {month.error.message} ({month.attempts} attempts)
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onRetry}
            disabled={!result.failedMonths.some((month) => month.retryable)}
          >
            Retry failed months
          </button>
        </>
      ) : null}
      {result.diagnostics.length > 0 ? (
        <ul>
          {result.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}-${index}`}>{diagnostic.message}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function statusLabel(status: IngestionResult['status']): string {
  switch (status) {
    case 'partial':
      return 'Partial data';
    case 'cancelled':
      return 'Import cancelled.';
    case 'failed':
      return 'Load failed';
    case 'complete':
      return 'Complete data';
  }
}

function heading(result: IngestionResult): string {
  switch (result.status) {
    case 'partial':
      return 'Partial results';
    case 'cancelled':
      return 'Import cancelled.';
    case 'failed':
      return 'Games could not be loaded';
    case 'complete':
      return result.games.length === 0 ? 'No games found' : 'Games loaded';
  }
}

function guidance(result: IngestionResult): string {
  switch (result.status) {
    case 'partial':
      return `${result.games.length} games are available, but one or more archive months failed.`;
    case 'cancelled':
      return result.games.length === 0
        ? 'No completed games were retained. Start a new query.'
        : `${result.games.length} games from completed archive months were retained and remain available.`;
    case 'failed':
      return 'No complete result is available. Review the guidance below and try again.';
    case 'complete':
      if (result.games.length === 0) {
        return 'No games found for these filters.';
      }
      return `${result.games.length} games are available${result.offlineCacheOnly ? ' from local cache' : ''}.`;
  }
}
