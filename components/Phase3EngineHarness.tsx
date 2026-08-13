'use client';

import { useEffect, useState } from 'react';

import { EngineService } from '@/features/stockfish-analysis/engineService';

export function Phase3EngineHarness() {
  const [status, setStatus] = useState('Starting engine…');

  useEffect(() => {
    const forceSingle = new URLSearchParams(window.location.search).get('mode') === 'single';
    const service = new EngineService(
      forceSingle
        ? { capabilityProbe: { crossOriginIsolated: false, sharedArrayBuffer: false, simd: false } }
        : {}
    );
    void service
      .initialize()
      .then(async (capability) => {
        if (capability.mode === 'unavailable') {
          setStatus(`Unavailable: ${capability.reason ?? 'Engine could not start.'}`);
          return;
        }
        const result = await service.evaluate({
          id: 'phase-3-harness-start-position',
          priority: 1,
          relevanceToken: 'phase-3-harness',
          deadlineAt: Date.now() + 20_000,
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          limit: { depth: 4 },
          multiPv: 1,
        });
        const pv = result.lines.find((line) => line.multiPv === 1)?.pv.join(' ');
        if (!pv) throw new Error('Engine returned no principal variation.');
        setStatus(`Ready: ${capability.mode}; PV: ${pv}`);
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
