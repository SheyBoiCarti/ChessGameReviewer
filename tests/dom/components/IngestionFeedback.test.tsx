import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DiagnosticSummary } from '@/components/feedback/DiagnosticSummary';
import { IngestionProgress } from '@/components/feedback/IngestionProgress';
import { OfflineCacheNotice } from '@/components/feedback/OfflineCacheNotice';

const baseProgress = {
  jobId: 'job-1',
  phase: 'fetching' as const,
  monthsPlanned: 4,
  monthsCompleted: 2,
  recordsFetched: 30,
  recordsAccepted: 24,
  recordsExcluded: 6,
  recordsFailed: 0,
  diagnostics: [],
};

describe('ingestion feedback', () => {
  it('shows indeterminate archive discovery before a total is known', () => {
    render(
      <IngestionProgress
        progress={{ ...baseProgress, phase: 'planning', monthsPlanned: 0 }}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(/finding game archives/i);
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value');
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('max');
  });

  it('identifies the archive month being loaded and exposes completed work', () => {
    render(
      <IngestionProgress
        progress={{ ...baseProgress, currentMonth: '2026-07' }}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(/loading july 2026/i);
    expect(screen.getByRole('status')).toHaveTextContent(
      /2 of 4 archive months complete.*24 games found/i
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '2');
    expect(screen.getByRole('progressbar')).toHaveAttribute('max', '4');
  });

  it.each([
    ['loading-cache', /checking saved games/i],
    ['filtering', /organizing loaded games/i],
  ] as const)('uses clear copy for %s', (phase, heading) => {
    render(<IngestionProgress progress={{ ...baseProgress, phase }} onCancel={vi.fn()} />);

    expect(screen.getByRole('status')).toHaveTextContent(heading);
  });

  it('announces progress politely and provides keyboard-operable cancellation', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<IngestionProgress progress={baseProgress} onCancel={onCancel} />);

    expect(screen.getByRole('status')).toHaveTextContent(/2 of 4 archive months/i);
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('makes a partial result visibly different and exposes failed months', () => {
    render(
      <DiagnosticSummary
        result={{
          jobId: 'job-1',
          fingerprint: 'query-1',
          status: 'partial',
          games: [],
          failedMonths: [
            {
              month: '2026-05',
              retryable: true,
              attempts: 3,
              error: {
                code: 'UPSTREAM_RATE_LIMITED',
                message: 'Please retry later.',
                retryable: true,
              },
            },
          ],
          diagnostics: [],
          offlineCacheOnly: false,
        }}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/partial results/i);
    expect(screen.getByText('Partial data')).toBeVisible();
    expect(screen.getByText(/2026-05/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry failed months/i })).toBeEnabled();
  });

  it('identifies offline cache reuse without presenting it as fresh data', () => {
    render(<OfflineCacheNotice />);
    expect(screen.getByText('Offline cache')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent(/saved on this device/i);
    expect(screen.getByRole('status')).toHaveTextContent(/could not be refreshed/i);
  });

  it('explains cancellation when no completed games were retained', () => {
    render(
      <DiagnosticSummary
        result={{
          jobId: 'job-1',
          fingerprint: 'query-1',
          status: 'cancelled',
          games: [],
          failedMonths: [],
          diagnostics: [],
          offlineCacheOnly: false,
        }}
        onRetry={vi.fn()}
      />
    );

    expect(screen.getByText('No completed games were retained. Start a new query.')).toBeVisible();
  });

  it('reports how many completed games remain available after cancellation', () => {
    render(
      <DiagnosticSummary
        result={{
          jobId: 'job-1',
          fingerprint: 'query-1',
          status: 'cancelled',
          games: [{ id: 'one' }, { id: 'two' }] as never,
          failedMonths: [],
          diagnostics: [],
          offlineCacheOnly: false,
        }}
        onRetry={vi.fn()}
      />
    );

    expect(
      screen.getByText('2 games from completed archive months were retained and remain available.')
    ).toBeVisible();
  });
});
