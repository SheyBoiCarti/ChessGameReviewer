import type { Metadata } from 'next';

import { Phase3EngineHarness } from '@/components/Phase3EngineHarness';

export const metadata: Metadata = {
  title: 'Phase 3 Engine Test Harness',
  robots: { index: false, follow: false },
};

export default function Phase3TestHarnessPage() {
  return <Phase3EngineHarness />;
}
