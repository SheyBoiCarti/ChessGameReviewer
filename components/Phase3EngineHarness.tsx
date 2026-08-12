'use client';

import { useEffect, useState } from 'react';

import { EngineService } from '@/features/stockfish-analysis/engineService';

export function Phase3EngineHarness() {
  const [status, setStatus] = useState('Starting engine…');

  useEffect(() => {
    const service = new EngineService({
      capabilityProbe: { crossOriginIsolated: false, sharedArrayBuffer: false, simd: false },
    });
    void service
      .initialize()
      .then((capability) => {
        setStatus(
          capability.mode === 'unavailable'
            ? `Unavailable: ${capability.reason ?? 'Engine could not start.'}`
            : `Ready: ${capability.mode}`
        );
      })
      .catch((error: unknown) =>
        setStatus(
          `Unavailable: ${error instanceof Error ? error.message : 'Engine could not start.'}`
        )
      );
    return () => service.dispose();
  }, []);

  return <p data-testid="engine-status">{status}</p>;
}
