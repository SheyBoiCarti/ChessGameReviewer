'use client';

import { useEffect, useRef, useState } from 'react';

import { GraphWorkerClient } from '@/features/opening-tree/graphWorkerClient';

export function Phase2WorkerHarness() {
  const client = useRef<GraphWorkerClient | null>(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    const worker = new Worker(new URL('../workers/analysis-data.worker.ts', import.meta.url));
    const graphClient = new GraphWorkerClient(worker);
    client.current = graphClient;
    return () => graphClient.dispose();
  }, []);

  async function buildGraph(): Promise<void> {
    if (!client.current) return;
    setStatus('building');
    try {
      const result = await client.current.build([], {
        maxOpeningPlies: 30,
        includeRepeatedPositions: true,
      });
      setStatus(result.status);
    } catch {
      setStatus('failed');
    }
  }

  return (
    <main>
      <h1>Phase 2 Worker Test Harness</h1>
      <output data-testid="graph-worker-status">{status}</output>
      <button onClick={() => void buildGraph()}>Build graph in worker</button>
    </main>
  );
}
