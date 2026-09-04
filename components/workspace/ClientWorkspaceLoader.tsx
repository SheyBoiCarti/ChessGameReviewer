'use client';

import dynamic from 'next/dynamic';

const ChessWorkspace = dynamic(
  () => import('./ChessWorkspace').then((module) => module.ChessWorkspace),
  {
    ssr: false,
    loading: () => (
      <div className="workspace-loading" role="status" aria-live="polite">
        <span className="workspace-loading__mark" aria-hidden="true" />
        <div>
          <strong>Preparing your review workspace</strong>
          <p>Your board, local games, and analysis tools are loading.</p>
        </div>
      </div>
    ),
  }
);

export function ClientWorkspaceLoader() {
  return <ChessWorkspace />;
}
