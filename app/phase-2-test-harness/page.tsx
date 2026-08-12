import type { Metadata } from 'next';

import { Phase2WorkerHarness } from '@/components/Phase2WorkerHarness';

export const metadata: Metadata = {
  title: 'Phase 2 Worker Test Harness',
  robots: { index: false, follow: false },
};

export default function Phase2TestHarnessPage() {
  return <Phase2WorkerHarness />;
}
