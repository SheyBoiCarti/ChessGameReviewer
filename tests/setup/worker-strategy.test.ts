import { describe, it, expect } from 'vitest';

describe('Worker Strategy', () => {
  it('instantiates the DOM test worker shim, posts a message, and terminates safely', async () => {
    // Simulate DOM environment if running in Node
    const isNodeEnv = typeof window === 'undefined';
    if (isNodeEnv) {
      (global as any).window = {};
    }

    try {
      // Dynamically import dom.setup to execute the conditional worker shim registration
      await import('./dom.setup');

      expect(window.Worker).toBeDefined();

      const WorkerClass = window.Worker as any;
      const worker = new WorkerClass('dummy.js');

      expect(() => {
        worker.postMessage({ type: 'PING' });
      }).not.toThrow();

      expect(() => {
        worker.terminate();
      }).not.toThrow();
    } finally {
      // Cleanup
      if (isNodeEnv) {
        delete (global as any).window;
      }
    }
  });
});
