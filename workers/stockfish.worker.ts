/// <reference lib="webworker" />

import { StockfishAdapter, type EnginePort } from '../lib/engine/stockfishAdapter';
import {
  ENGINE_WORKER_PROTOCOL_VERSION,
  isEngineWorkerRequest,
  type EngineWorkerResponse,
} from './stockfish.protocol';

type RawWorker = Pick<
  Worker,
  'postMessage' | 'terminate' | 'addEventListener' | 'removeEventListener'
>;

/** Builds a real Stockfish.js port backed by our pinned, same-origin assets. */
export function createStockfishPort(
  mode: 'threaded' | 'single-thread',
  createWorker: (url: string) => RawWorker = (url) => new Worker(url)
): EnginePort {
  const script = mode === 'threaded' ? 'stockfish-18-lite.js' : 'stockfish-18-lite-single.js';
  const wasm = script.replace(/\.js$/, '.wasm');
  const origin = self.location.origin;
  const url = `${origin}/stockfish/${script}#${encodeURIComponent(`${origin}/stockfish/${wasm}`)},worker`;
  const worker = createWorker(url);
  return {
    post(command) {
      worker.postMessage(command);
    },
    onLine(listener) {
      const handler = (event: MessageEvent<unknown>) => {
        if (typeof event.data === 'string') listener(event.data);
      };
      worker.addEventListener('message', handler as EventListener);
      return () => worker.removeEventListener('message', handler as EventListener);
    },
    terminate() {
      worker.terminate();
    },
  };
}

let adapter: StockfishAdapter | undefined;
let activeController: AbortController | undefined;

if (typeof self !== 'undefined') {
  self.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!isEngineWorkerRequest(event.data)) return;
    void handleEngineWorkerRequest(event.data, (response) => self.postMessage(response));
  });
}

export async function handleEngineWorkerRequest(
  request: import('./stockfish.protocol').EngineWorkerRequest,
  post: (response: EngineWorkerResponse) => void
): Promise<void> {
  try {
    if (request.type === 'DISPOSE') {
      activeController?.abort();
      adapter?.dispose();
      adapter = undefined;
      post({
        protocolVersion: ENGINE_WORKER_PROTOCOL_VERSION,
        jobId: request.jobId,
        type: 'STOPPED',
      });
      return;
    }
    if (request.type === 'STOP') {
      activeController?.abort();
      adapter?.stop();
      post({
        protocolVersion: ENGINE_WORKER_PROTOCOL_VERSION,
        jobId: request.jobId,
        type: 'STOPPED',
      });
      return;
    }
    if (request.type === 'INITIALIZE') {
      adapter?.dispose();
      adapter = new StockfishAdapter(async () => createStockfishPort(request.mode), {
        timeoutMs: 15_000,
      });
      await adapter.initialize(request.resources);
      post({
        protocolVersion: ENGINE_WORKER_PROTOCOL_VERSION,
        jobId: request.jobId,
        type: 'READY',
      });
      return;
    }
    if (!adapter) throw new Error('Engine is not initialized.');
    if (request.type === 'NEW_GAME') {
      adapter.newGame();
      post({
        protocolVersion: ENGINE_WORKER_PROTOCOL_VERSION,
        jobId: request.jobId,
        type: 'READY',
      });
      return;
    }
    activeController = new AbortController();
    const result = await adapter.evaluate(
      request.fen,
      request.limit,
      request.multiPv,
      activeController.signal
    );
    post({
      protocolVersion: ENGINE_WORKER_PROTOCOL_VERSION,
      jobId: request.jobId,
      type: 'RESULT',
      result,
    });
  } catch (error) {
    post({
      protocolVersion: ENGINE_WORKER_PROTOCOL_VERSION,
      jobId: request.jobId,
      type: 'FAILED',
      code: 'ENGINE_OPERATION_FAILED',
      message: error instanceof Error ? error.message : 'Engine operation failed.',
    });
  } finally {
    if (request.type === 'EVALUATE') activeController = undefined;
  }
}
