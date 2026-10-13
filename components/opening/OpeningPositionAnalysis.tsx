'use client';

import { useEffect, useState } from 'react';
import { EngineService } from '@/features/stockfish-analysis/engineService';
import { convertPvToSan } from '@/features/stockfish-analysis/presentation';
import { normalizeUciScoreToWhite } from '@/lib/engine/evaluation';

export function OpeningPositionAnalysis({ fen }: { fen: string }) {
  const [enabled, setEnabled] = useState(false);
  return (
    <section className="surface-panel" aria-label="Opening Stockfish analysis">
      <label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />{' '}
        Stockfish analysis
      </label>
      {enabled ? <PositionSearch fen={fen} /> : null}
    </section>
  );
}

function PositionSearch({ fen }: { fen: string }) {
  const [session] = useState(() => ({
    engine: new EngineService(),
    ready: null as ReturnType<EngineService['initialize']> | null,
  }));
  const [result, setResult] = useState<{ fen: string; text: string } | null>(null);
  useEffect(() => {
    // Create a fresh engine on effect setup, including React's development remount.
    const engine = new EngineService();
    let active = true;
    session.engine = engine;
    session.ready = engine.initialize().then((capability) => {
      if (!active) engine.dispose();
      return capability;
    });
    return () => {
      active = false;
      engine.dispose();
    };
  }, [session]);
  useEffect(() => {
    const abort = new AbortController();
    const engine = session.engine;
    void session.ready
      ?.then(async (capability) => {
        if (abort.signal.aborted) return;
        if (capability.mode === 'unavailable')
          throw new Error('Stockfish is unavailable on this device.');
        const evaluation = await engine.evaluate({
          id: `opening-${crypto.randomUUID()}`,
          priority: 1,
          relevanceToken: fen,
          deadlineAt: Date.now() + 30000,
          fen,
          limit: { movetimeMs: 1000 },
          multiPv: 1,
          signal: abort.signal,
        });
        if (abort.signal.aborted) return;
        const line = evaluation.lines[0];
        const score = line ? normalizeUciScoreToWhite(line.score, fen) : null;
        const value = score
          ? score.kind === 'mate'
            ? `Mate ${score.value}`
            : `${score.value >= 0 ? '+' : ''}${(score.value / 100).toFixed(2)}`
          : 'No evaluation';
        const moves = convertPvToSan(fen, line?.pv ?? []).moves.join(' ');
        setResult({
          fen,
          text: `${value} (White perspective) · Depth ${line?.depth ?? 0}${moves ? ` · ${moves}` : ''}`,
        });
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setResult({
            fen,
            text: error instanceof Error ? error.message : 'Stockfish analysis failed.',
          });
      });
    return () => abort.abort();
  }, [fen, session]);
  return <p role="status">{result?.fen === fen ? result.text : 'Analysing this position…'}</p>;
}
