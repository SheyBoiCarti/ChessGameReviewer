'use client';

import { useEffect, useRef, useState } from 'react';
import { EngineService } from './engineService';
import type { EvaluationResult } from '@/lib/engine/stockfishAdapter';
import { normalizeUciScoreToWhite } from '@/lib/engine/evaluation';

export function usePositionAnalysis(fen: string | null) {
  const enabled = fen !== null;
  const session = useRef<{
    engine: EngineService;
    ready: ReturnType<EngineService['initialize']>;
  } | null>(null);
  const [result, setResult] = useState<{
    fen: string;
    evaluation?: EvaluationResult;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const engine = new EngineService();
    session.current = { engine, ready: engine.initialize() };
    return () => {
      session.current = null;
      engine.dispose();
    };
  }, [enabled]);

  useEffect(() => {
    const current = session.current;
    if (!fen || !current) return;
    const abort = new AbortController();
    void current.ready
      .then(async (capability) => {
        if (abort.signal.aborted) return;
        if (capability.mode === 'unavailable')
          throw new Error('Stockfish is unavailable on this device.');
        const evaluation = await current.engine.evaluate({
          id: `position-${crypto.randomUUID()}`,
          priority: 1,
          relevanceToken: fen,
          deadlineAt: Date.now() + 30000,
          fen,
          limit: { movetimeMs: 1000 },
          multiPv: 3,
          signal: abort.signal,
        });
        if (!abort.signal.aborted) setResult({ fen, evaluation });
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setResult({
            fen,
            error: error instanceof Error ? error.message : 'Stockfish analysis failed.',
          });
      });
    return () => abort.abort();
  }, [fen]);

  const current = enabled && result?.fen === fen ? result : null;
  const lines = [...(current?.evaluation?.lines ?? [])].sort((a, b) => a.multiPv - b.multiPv);
  // Candidate moves belong to the current FEN, but the bar keeps its last
  // completed evaluation while the next search runs. Normalize using that
  // result's own side to move so advancing a ply never reverses the old score.
  const primary = enabled
    ? result?.evaluation?.lines.find((line) => line.multiPv === 1)
    : undefined;
  return {
    lines,
    score:
      primary && result
        ? (normalizeUciScoreToWhite(primary.score, result.fen) ?? undefined)
        : undefined,
    error: current?.error,
    loading: enabled && current === null,
  };
}

export type PositionAnalysis = ReturnType<typeof usePositionAnalysis>;
