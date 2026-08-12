import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// Mock Web Worker if needed for worker-test strategy in DOM env
if (typeof window !== 'undefined' && !window.Worker) {
  class MockWorker implements Worker {
    onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
    onmessageerror: ((this: Worker, ev: MessageEvent) => unknown) | null = null;
    onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null;

    postMessage(_message: unknown, _transfer?: Transferable[] | StructuredSerializeOptions): void {
      // Mock implementation for test assertions
    }

    terminate(): void {}

    addEventListener<K extends keyof WorkerEventMap>(
      _type: K,
      _listener: (this: Worker, ev: WorkerEventMap[K]) => unknown,
      _options?: boolean | AddEventListenerOptions
    ): void {}

    removeEventListener<K extends keyof WorkerEventMap>(
      _type: K,
      _listener: (this: Worker, ev: WorkerEventMap[K]) => unknown,
      _options?: boolean | EventListenerOptions
    ): void {}

    dispatchEvent(_event: Event): boolean {
      return true;
    }
  }

  (window as unknown as Record<string, unknown>).Worker = MockWorker;
}
