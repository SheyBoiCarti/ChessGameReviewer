import type { IngestionResult } from '@/features/ingestion/types';

export function DiagnosticSummary({
  result,
  onRetry,
  onViewGames,
  onEditUsername,
  onExpandDates,
  retainedCount = 0,
  retainedUsername,
  onKeepCurrent,
}: {
  result: IngestionResult;
  onRetry(): void;
  onViewGames?(): void;
  onEditUsername?(): void;
  onExpandDates?(): void;
  retainedCount?: number;
  retainedUsername?: string | undefined;
  onKeepCurrent?(): void;
}) {
  const urgent = result.status === 'partial' || result.status === 'failed';
  const empty = result.status === 'complete' && result.games.length === 0;
  const codes = new Set([
    ...result.diagnostics.map((d) => d.code),
    ...result.failedMonths.map((m) => m.error.code),
  ]);
  const notFound = codes.has('PLAYER_NOT_FOUND') || codes.has('INVALID_USERNAME');
  const diagnosis = codes.has('UPSTREAM_RATE_LIMITED')
    ? 'Chess.com is limiting requests. Wait a little, then retry.'
    : codes.has('TIMEOUT')
      ? 'The request timed out. Check your connection and retry.'
      : notFound
        ? 'This Chess.com username could not be found. Check its spelling.'
        : [...codes].some((code) => /STORAGE|QUOTA|SCHEMA_VERSION/.test(code))
          ? 'Games could not be saved on this device. Check local storage in Settings, then retry.'
          : result.status === 'failed'
            ? (result.diagnostics[0]?.message ??
              result.failedMonths[0]?.error.message ??
              'Games could not be loaded. Try again.')
            : null;
  return (
    <section className={`status-card status-${result.status}`} role={urgent ? 'alert' : 'status'}>
      <span className={`status-label status-label--${result.status}`}>
        {empty ? 'Empty search' : statusLabel(result.status)}
      </span>
      <h3>{heading(result)}</h3>
      <p>{result.status === 'failed' ? diagnosis : guidance(result)}</p>
      {result.status !== 'failed' && diagnosis ? <p>{diagnosis}</p> : null}
      {retainedCount > 0 ? (
        <p>
          {retainedCount} previously loaded games
          {retainedUsername ? ` for ${retainedUsername}` : ''} remain available with their original
          filters.
        </p>
      ) : null}
      {result.status === 'cancelled' && result.games.length > 0 && onViewGames ? (
        <button type="button" onClick={onViewGames}>
          View games
        </button>
      ) : null}
      {onEditUsername && (notFound || result.status === 'failed') ? (
        <button type="button" onClick={onEditUsername}>
          Edit username
        </button>
      ) : null}
      {empty && onExpandDates ? (
        <button type="button" onClick={onExpandDates}>
          Try all available dates
        </button>
      ) : null}
      {result.failedMonths.length > 0 ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={!result.failedMonths.some((month) => month.retryable)}
        >
          Retry failed months
        </button>
      ) : result.status === 'failed' && !notFound ? (
        <button type="button" onClick={onRetry}>
          Retry import
        </button>
      ) : null}
      {onKeepCurrent && retainedCount > 0 ? (
        <button type="button" onClick={onKeepCurrent}>
          Keep current games
        </button>
      ) : null}
      {result.failedMonths.length > 0 || result.diagnostics.length > 0 ? (
        <details className="diagnostic-details">
          <summary>Diagnostics</summary>
          {result.failedMonths.length > 0 ? (
            <>
              <h4>Failed archive months</h4>
              <ul>
                {result.failedMonths.map((month) => (
                  <li key={month.month}>
                    <strong>{month.month}</strong>: {month.error.message} ({month.attempts}{' '}
                    attempts)
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <ul>
            {result.diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${index}`}>{diagnostic.message}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function statusLabel(status: IngestionResult['status']): string {
  switch (status) {
    case 'partial':
      return 'Partial data';
    case 'cancelled':
      return 'Stopped';
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
      return 'Games could not be loaded. Try again.';
    case 'complete':
      return result.games.length === 0
        ? 'No games found for these filters.'
        : `${result.games.length} games are available${result.offlineCacheOnly ? ' from local cache' : ''}.`;
  }
}
