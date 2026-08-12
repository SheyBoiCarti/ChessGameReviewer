import { validateFen } from 'chess.js';

import { parseUciLine } from './uci/parser';
import type { UciInfo } from './uci/types';

export type EngineState =
  | 'new'
  | 'loading'
  | 'uci-initializing'
  | 'ready'
  | 'searching'
  | 'stopping'
  | 'failure'
  | 'disposed';
export interface EnginePort {
  post(command: string): void;
  onLine(listener: (line: string) => void): () => void;
  terminate(): void;
}
export interface EvaluationLimit {
  depth?: number;
  movetimeMs?: number;
  nodes?: number;
}
export interface EvaluationLine {
  multiPv: number;
  depth: number;
  score: NonNullable<UciInfo['score']>;
  pv: readonly string[];
}
export interface EvaluationResult {
  bestMove: string;
  lines: readonly EvaluationLine[];
}

export class StockfishAdapter {
  state: EngineState = 'new';
  private engine: EnginePort | undefined;
  private unsubscribe: (() => void) | undefined;
  private waiters = new Map<
    'uciok' | 'readyok',
    { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private search:
    | {
        lines: Map<number, EvaluationLine>;
        resolve: (result: EvaluationResult) => void;
        reject: (error: Error) => void;
        abort?: AbortSignal;
        onAbort?: () => void;
      }
    | undefined;
  constructor(
    private readonly createEngine: () => Promise<EnginePort>,
    private readonly config: { timeoutMs: number }
  ) {}

  async initialize(
    options: { hashMb: number; threads: number },
    signal?: AbortSignal
  ): Promise<void> {
    this.ensureNotDisposed();
    if (signal?.aborted) throw abortError();
    this.state = 'loading';
    this.engine = await this.createEngine();
    this.unsubscribe = this.engine.onLine((line) => this.handleLine(line));
    this.state = 'uci-initializing';
    this.engine.post('uci');
    await this.waitFor('uciok', signal);
    this.engine.post(`setoption name Hash value ${options.hashMb}`);
    this.engine.post(`setoption name Threads value ${options.threads}`);
    this.engine.post('isready');
    await this.waitFor('readyok', signal);
    this.state = 'ready';
  }

  evaluate(
    fen: string,
    limit: EvaluationLimit,
    multiPv: number,
    signal?: AbortSignal
  ): Promise<EvaluationResult> {
    this.ensureReady();
    if (signal?.aborted) return Promise.reject(abortError());
    if (validateFen(fen).ok === false)
      return Promise.reject(new Error('A complete valid FEN is required.'));
    if (!Number.isInteger(multiPv) || multiPv < 1)
      return Promise.reject(new Error('multiPv must be a positive integer.'));
    this.state = 'searching';
    this.engine!.post(`setoption name MultiPV value ${multiPv}`);
    this.engine!.post(`position fen ${fen}`);
    this.engine!.post(`go ${goCommand(limit)}`);
    return new Promise<EvaluationResult>((resolve, reject) => {
      const onAbort = () => this.stop();
      const search = { lines: new Map<number, EvaluationLine>(), resolve, reject, onAbort };
      this.search = signal ? { ...search, abort: signal } : search;
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  stop(): void {
    if (this.state !== 'searching' && this.state !== 'stopping') return;
    this.state = 'stopping';
    this.engine?.post('stop');
  }
  newGame(): void {
    this.ensureReady();
    this.engine!.post('ucinewgame');
    this.engine!.post('isready');
  }
  dispose(): void {
    if (this.state === 'disposed') return;
    this.search?.abort?.removeEventListener('abort', this.search.onAbort!);
    this.search?.reject(new Error('Engine disposed.'));
    this.search = undefined;
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Engine disposed.'));
    }
    this.waiters.clear();
    this.unsubscribe?.();
    this.engine?.terminate();
    this.state = 'disposed';
  }

  private handleLine(raw: string): void {
    const line = parseUciLine(raw);
    if (line.type === 'uciok' || line.type === 'readyok') {
      const waiter = this.waiters.get(line.type);
      if (waiter) {
        clearTimeout(waiter.timer);
        this.waiters.delete(line.type);
        waiter.resolve();
      }
      return;
    }
    if (line.type === 'error') {
      this.fail(new Error(line.message));
      return;
    }
    if (line.type === 'info' && this.search) this.collect(line);
    if (line.type === 'bestmove' && this.search) {
      const search = this.search;
      this.search = undefined;
      search.abort?.removeEventListener('abort', search.onAbort!);
      this.state = 'ready';
      if (search.abort?.aborted) search.reject(abortError());
      else
        search.resolve({
          bestMove: line.move,
          lines: [...search.lines.values()].sort((a, b) => a.multiPv - b.multiPv),
        });
    }
  }
  private collect(info: UciInfo): void {
    if (!this.search || !info.score || info.score.bound || !info.depth || !info.pv?.length) return;
    const multiPv = info.multiPv ?? 1;
    const old = this.search.lines.get(multiPv);
    if (!old || info.depth >= old.depth)
      this.search.lines.set(multiPv, {
        multiPv,
        depth: info.depth,
        score: info.score,
        pv: info.pv,
      });
  }
  private waitFor(kind: 'uciok' | 'readyok', signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(kind);
        this.fail(new Error(`Timed out waiting for ${kind}.`));
        reject(new Error(`Timed out waiting for ${kind}.`));
      }, this.config.timeoutMs);
      this.waiters.set(kind, { resolve, reject, timer });
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          this.waiters.delete(kind);
          reject(abortError());
        },
        { once: true }
      );
    });
  }
  private fail(error: Error): void {
    this.state = 'failure';
    if (this.search) {
      this.search.reject(error);
      this.search = undefined;
    }
  }
  private ensureNotDisposed(): void {
    if (this.state === 'disposed') throw new Error('Engine is disposed.');
  }
  private ensureReady(): void {
    this.ensureNotDisposed();
    if (this.state !== 'ready') throw new Error(`Engine is not ready (state: ${this.state}).`);
  }
}
function goCommand(limit: EvaluationLimit): string {
  if (limit.depth && Number.isInteger(limit.depth)) return `depth ${limit.depth}`;
  if (limit.movetimeMs && Number.isFinite(limit.movetimeMs)) return `movetime ${limit.movetimeMs}`;
  if (limit.nodes && Number.isInteger(limit.nodes)) return `nodes ${limit.nodes}`;
  throw new Error('An evaluation limit is required.');
}
function abortError(): Error {
  const error = new Error('Analysis cancelled.');
  error.name = 'AbortError';
  return error;
}
