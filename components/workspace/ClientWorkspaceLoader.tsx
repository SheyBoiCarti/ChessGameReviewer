'use client';

import dynamic from 'next/dynamic';

const ChessWorkspace = dynamic(
  () => import('./ChessWorkspace').then((module) => module.ChessWorkspace),
  { ssr: false, loading: () => <p role="status">Loading the local workspace…</p> }
);

export function ClientWorkspaceLoader() {
  return <ChessWorkspace />;
}
