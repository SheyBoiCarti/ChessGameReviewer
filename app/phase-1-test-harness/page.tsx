import type { Metadata } from 'next';

import { Phase1TestHarness } from '@/components/Phase1TestHarness';

export const metadata: Metadata = {
  title: 'Phase 1 Test Harness',
  robots: { index: false, follow: false },
};

export default function Phase1TestHarnessPage() {
  return <Phase1TestHarness />;
}
