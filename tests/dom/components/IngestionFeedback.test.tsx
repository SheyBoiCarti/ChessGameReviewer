import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DiagnosticSummary } from '@/components/feedback/DiagnosticSummary';
import { IngestionProgress } from '@/components/feedback/IngestionProgress';
import { OfflineCacheNotice } from '@/components/feedback/OfflineCacheNotice';

describe('ingestion feedback', () => {
  it('announces progress politely and provides keyboard-operable cancellation', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <IngestionProgress
        progress={{
          jobId: 'job-1',
          phase: 'fetching',
          monthsPlanned: 4,
          monthsCompleted: 2,
          recordsFetched: 30,
          recordsAccepted: 24,
          recordsExcluded: 6,
          recordsFailed: 0,
          diagnostics: [],
        }}
        onCancel={onCancel}
      />
    );

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
    expect(screen.getByText(/2026-05/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry failed months/i })).toBeEnabled();
  });

  it('identifies offline cache reuse without presenting it as fresh data', () => {
    render(<OfflineCacheNotice />);
    expect(screen.getByRole('status')).toHaveTextContent(/saved on this device/i);
    expect(screen.getByRole('status')).toHaveTextContent(/could not be refreshed/i);
  });
});
