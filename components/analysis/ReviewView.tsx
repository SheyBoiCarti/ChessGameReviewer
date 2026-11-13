'use client';

import dynamic from 'next/dynamic';
import type { AnalyzerWorkspaceProps } from './AnalyzerWorkspace';

const LazyAnalyzerWorkspace = dynamic(
  () => import('./AnalyzerWorkspace').then((module) => module.AnalyzerWorkspace),
  { loading: () => <p role="status">Loading the local analyzer…</p>, ssr: false }
);

export function ReviewView(props: AnalyzerWorkspaceProps) {
  return <LazyAnalyzerWorkspace {...props} />;
}
