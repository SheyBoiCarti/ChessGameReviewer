'use client';

import { useEffect, useRef, useState } from 'react';

import { GraphWorkerClient } from '@/features/opening-tree/graphWorkerClient';
import type { NormalizedGameSummary } from '@/lib/api/contracts';

const WORKER_FIXTURE_GAMES: readonly NormalizedGameSummary[] = Array.from(
  { length: 1_000 },
  (_, index) => ({
    id: `worker-fixture-${index}`,
    url: `https://example.test/worker-fixture-${index}`,
    usernameKey: 'fixture',
    userColor: 'white',
    result: 'win',
    endedAt: 0,
    timeClass: 'blitz',
    rated: true,
    userRating: 1500,
    opponentRating: 1600,
    rules: 'chess',
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 1-0',
  })
);

export function Phase2WorkerHarness() {
  const client = useRef<GraphWorkerClient | null>(null);
  const [status, setStatus] = useState('idle');
  const [mainThreadHeartbeat, setMainThreadHeartbeat] = useState(false);

  useEffect(() => {
    const worker = new Worker(new URL('../workers/analysis-data.worker.ts', import.meta.url));
    const graphClient = new GraphWorkerClient(worker);
    client.current = graphClient;
    return () => graphClient.dispose();
  }, []);

  async function buildGraph(): Promise<void> {
    if (!client.current) return;
    setStatus('building');
    setMainThreadHeartbeat(false);
    setTimeout(() => setMainThreadHeartbeat(true), 0);
    try {
      const result = await client.current.build(WORKER_FIXTURE_GAMES, {
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
      <output data-testid="main-thread-heartbeat">{String(mainThreadHeartbeat)}</output>
      <button onClick={() => void buildGraph()}>Build 1,000 games in worker</button>
    </main>
  );
}
