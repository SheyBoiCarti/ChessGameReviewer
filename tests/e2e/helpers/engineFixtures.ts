import type { Page } from '@playwright/test';
import { Chess } from 'chess.js';
import type { EvaluationResult } from '../../../lib/engine/stockfishAdapter';
import type { UciScore } from '../../../lib/engine/uci/types';
import type {
  EngineWorkerRequest,
  EngineWorkerResponse,
} from '../../../workers/stockfish.protocol';
import scopeGames from '../../fixtures/openingScopeGames.json';
import { workspaceFixturePgns } from './workspaceFixtures';

export interface EngineFixtureOptions {
  manualReady?: boolean;
  manualEvaluations?: boolean;
  delayMs?: number;
  failInitialization?: boolean;
  score?: UciScore;
  /** Bounded scores retain legal PVs while making move classification indeterminate. */
  indeterminate?: boolean;
  pgns?: readonly string[];
  fens?: readonly string[];
}

/** Node-only legal PV generator. Every line starts at the requested FEN. */
export function createEvaluationFixture(
  fen: string,
  score: UciScore = { kind: 'cp', value: 35 }
): EvaluationResult {
  const chess = new Chess(fen);
  const candidates = chess.moves({ verbose: true }).slice(0, 3);
  const lines = candidates.map((move, index) => {
    const board = new Chess(fen);
    board.move(move);
    const reply = board.moves({ verbose: true })[0];
    const uci = (m: typeof move) => `${m.from}${m.to}${m.promotion ?? ''}`;
    return {
      multiPv: index + 1,
      depth: 12,
      score: { ...score },
      pv: [uci(move), ...(reply ? [uci(reply)] : [])],
    };
  });
  return { bestMove: lines[0]?.pv[0] ?? '0000', lines };
}

interface BrowserControl {
  releaseReady(): void;
  releaseEvaluations(count: number): void;
  failNextInitialization(): void;
  requests(): EngineWorkerRequest[];
  deliver(response: EngineWorkerResponse): void;
  reset(): void;
}

declare global {
  interface Window {
    __engineFixtures: BrowserControl;
  }
}

/** Install before navigation. Each new document/page gets its own queues and workers. */
export async function installEngineFixtures(page: Page, options: EngineFixtureOptions = {}) {
  const fens = new Set(options.fens ?? []);
  fens.add(new Chess().fen());
  for (const pgn of options.pgns ?? [...workspaceFixturePgns, ...scopeGames.map((g) => g.pgn)]) {
    const chess = new Chess();
    chess.loadPgn(pgn, { strict: true });
    for (const move of chess.history({ verbose: true })) {
      fens.add(move.before);
      fens.add(move.after);
    }
  }
  const results: Record<string, EvaluationResult> = {};
  for (const fen of fens)
    results[fen] = createEvaluationFixture(
      fen,
      options.indeterminate ? { kind: 'cp', value: 35, bound: 'lower' } : options.score
    );
  await page.addInitScript(
    ({ results, options }) => {
      const NativeWorker = window.Worker;
      const workers = new Set<FixtureWorker>();
      const owners = new Map<string, FixtureWorker>();
      let requests: EngineWorkerRequest[] = [];
      let ready = options.manualReady === false;
      let permits = options.manualEvaluations === false ? Infinity : 0;
      let failNext = options.failInitialization === true;
      type Pending = { request: EngineWorkerRequest; response: EngineWorkerResponse };
      class FixtureWorker extends EventTarget {
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: ErrorEvent) => void) | null = null;
        onmessageerror: ((event: MessageEvent) => void) | null = null;
        native: Worker | null = null;
        pending: Pending[] = [];
        timers = new Set<ReturnType<typeof setTimeout>>();
        terminated = false;
        constructor(
          private url: string | URL,
          private settings?: WorkerOptions
        ) {
          super();
          workers.add(this);
        }
        emit(response: unknown) {
          if (this.terminated) return;
          const event = new MessageEvent('message', { data: response });
          this.dispatchEvent(event);
          this.onmessage?.(event);
        }
        flush() {
          this.pending = this.pending.filter(({ request, response }) => {
            if (request.type === 'INITIALIZE' && !ready) return true;
            if (request.type === 'EVALUATE' && permits <= 0) return true;
            if (request.type === 'EVALUATE') permits--;
            const timer = setTimeout(() => {
              this.timers.delete(timer);
              this.emit(response);
            }, options.delayMs ?? 0);
            this.timers.add(timer);
            return false;
          });
        }
        postMessage(
          message: EngineWorkerRequest | { type: string },
          transfer: Transferable[] = []
        ) {
          if (this.terminated) return;
          // Data worker ownership stays native, including cancellation/disposal.
          if (
            !['INITIALIZE', 'EVALUATE', 'STOP', 'NEW_GAME', 'DISPOSE'].includes(message.type) ||
            this.native
          ) {
            if (!this.native) {
              this.native = new NativeWorker(this.url, this.settings);
              this.native.addEventListener('message', (event) => this.emit(event.data));
              for (const type of ['error', 'messageerror'])
                this.native.addEventListener(type, () => this.dispatchEvent(new Event(type)));
            }
            this.native.postMessage(message, transfer);
            return;
          }
          const request = message as EngineWorkerRequest;
          requests.push(request);
          owners.set(request.jobId, this);
          const envelope = { protocolVersion: 1 as const, jobId: request.jobId };
          if (request.type === 'INITIALIZE') {
            if (failNext) {
              failNext = false;
              this.emit({
                ...envelope,
                type: 'FAILED',
                code: 'FIXTURE_INITIALIZATION_FAILED',
                message: 'Controlled initialization failure',
              });
            } else this.pending.push({ request, response: { ...envelope, type: 'READY' } });
          } else if (request.type === 'EVALUATE') {
            const result = results[request.fen];
            this.pending.push({
              request,
              response: result
                ? {
                    ...envelope,
                    type: 'RESULT',
                    result: { ...result, lines: result.lines.slice(0, request.multiPv) },
                  }
                : {
                    ...envelope,
                    type: 'FAILED',
                    code: 'FIXTURE_FEN_MISSING',
                    message: 'Add the scenario PGN/FEN to installEngineFixtures',
                  },
            });
          } else if (request.type === 'STOP' || request.type === 'DISPOSE') {
            for (const timer of this.timers) clearTimeout(timer);
            this.timers.clear();
            // Settle every outstanding evaluation. STOP itself also has its own job ID.
            for (const [jobId, owner] of owners)
              if (
                owner === this &&
                requests.some((r) => r.jobId === jobId && r.type === 'EVALUATE')
              )
                this.emit({
                  protocolVersion: 1,
                  jobId,
                  type: 'FAILED',
                  code: 'ABORTED',
                  message: 'Analysis aborted.',
                });
            this.pending = [];
            this.emit({ ...envelope, type: 'STOPPED' });
          } else this.emit({ ...envelope, type: 'READY' });
          this.flush();
        }
        terminate() {
          this.terminated = true;
          this.native?.terminate();
          for (const timer of this.timers) clearTimeout(timer);
          this.pending = [];
          workers.delete(this);
        }
      }
      window.Worker = FixtureWorker as unknown as typeof Worker;
      window.__engineFixtures = {
        releaseReady() {
          ready = true;
          for (const worker of workers) worker.flush();
        },
        releaseEvaluations(count) {
          if (!Number.isInteger(count) || count < 0)
            throw new Error('Expected a nonnegative evaluation count');
          permits += count;
          for (const worker of workers) worker.flush();
        },
        failNextInitialization() {
          failNext = true;
        },
        requests() {
          return requests;
        },
        deliver(response) {
          owners.get(response.jobId)?.emit(response);
        },
        reset() {
          for (const worker of workers) worker.terminate();
          owners.clear();
          requests = [];
          ready = options.manualReady === false;
          permits = options.manualEvaluations === false ? Infinity : 0;
          failNext = options.failInitialization === true;
        },
      };
    },
    { results, options }
  );
  return {
    releaseReady: () => page.evaluate(() => window.__engineFixtures.releaseReady()),
    releaseEvaluations: (count: number) =>
      page.evaluate((n) => window.__engineFixtures.releaseEvaluations(n), count),
    failNextInitialization: () =>
      page.evaluate(() => window.__engineFixtures.failNextInitialization()),
    requests: () => page.evaluate(() => window.__engineFixtures.requests()),
    deliver: (response: EngineWorkerResponse) =>
      page.evaluate((r) => window.__engineFixtures.deliver(r), response),
    reset: () => page.evaluate(() => window.__engineFixtures.reset()),
  };
}
