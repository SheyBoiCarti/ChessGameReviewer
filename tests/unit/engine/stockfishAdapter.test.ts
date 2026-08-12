import { describe, expect, it } from 'vitest';

import { StockfishAdapter } from '../../../lib/engine/stockfishAdapter';

class FakeEngine {
  readonly sent: string[] = [];
  private listener: ((line: string) => void) | undefined;
  private errorListener: ((error: Error) => void) | undefined;
  onLine(listener: (line: string) => void): () => void {
    this.listener = listener;
    return () => {
      this.listener = undefined;
    };
  }
  post(command: string) {
    this.sent.push(command);
  }
  emit(line: string) {
    this.listener?.(line);
  }
  onError(listener: (error: Error) => void): () => void {
    this.errorListener = listener;
    return () => {
      this.errorListener = undefined;
    };
  }
  fail(message: string) {
    this.errorListener?.(new Error(message));
  }
  terminate() {}
}

describe('StockfishAdapter', () => {
  it('initializes UCI, applies options, and returns deepest line for each multipv', async () => {
    const engine = new FakeEngine();
    const adapter = new StockfishAdapter(async () => engine, { timeoutMs: 100 });
    const initialized = adapter.initialize({ hashMb: 32, threads: 1 });
    await Promise.resolve();
    engine.emit('uciok');
    await Promise.resolve();
    engine.emit('readyok');
    await initialized;
    expect(engine.sent).toEqual([
      'uci',
      'setoption name Hash value 32',
      'setoption name Threads value 1',
      'isready',
    ]);

    const evaluated = adapter.evaluate(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      { depth: 12 },
      2
    );
    engine.emit('info depth 10 multipv 1 score cp 15 pv e2e4');
    engine.emit('info depth 12 multipv 1 score cp 21 pv e2e4 e7e5');
    engine.emit('info depth 11 multipv 2 score mate -3 pv d2d4');
    engine.emit('bestmove e2e4');
    await expect(evaluated).resolves.toMatchObject({
      bestMove: 'e2e4',
      lines: [
        { multiPv: 1, depth: 12 },
        { multiPv: 2, depth: 11 },
      ],
    });
  });

  it('stops and drains bestmove before a cancelled search settles', async () => {
    const engine = new FakeEngine();
    const adapter = new StockfishAdapter(async () => engine, { timeoutMs: 100 });
    const init = adapter.initialize({ hashMb: 16, threads: 1 });
    await Promise.resolve();
    engine.emit('uciok');
    await Promise.resolve();
    engine.emit('readyok');
    await init;
    const controller = new AbortController();
    const result = adapter.evaluate(
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      { movetimeMs: 10 },
      1,
      controller.signal
    );
    controller.abort();
    expect(engine.sent.at(-1)).toBe('stop');
    engine.emit('bestmove e2e4');
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(adapter.state).toBe('ready');
  });

  it('rejects an initialization waiter when the nested worker fails', async () => {
    const engine = new FakeEngine();
    const adapter = new StockfishAdapter(async () => engine, { timeoutMs: 100 });
    const initialized = adapter.initialize({ hashMb: 16, threads: 1 });
    await Promise.resolve();
    engine.fail('nested worker crashed');
    await expect(initialized).rejects.toThrow('nested worker crashed');
    expect(adapter.state).toBe('failure');
  });

  it('rejects invalid evaluation inputs and supports each legal search limit', async () => {
    const engine = new FakeEngine();
    const adapter = new StockfishAdapter(async () => engine, { timeoutMs: 100 });
    const initialized = adapter.initialize({ hashMb: 16, threads: 1 });
    await Promise.resolve();
    engine.emit('uciok');
    await Promise.resolve();
    engine.emit('readyok');
    await initialized;
    await expect(adapter.evaluate('invalid', { depth: 1 }, 1)).rejects.toThrow(
      'complete valid FEN'
    );
    await expect(
      adapter.evaluate('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', { depth: 1 }, 0)
    ).rejects.toThrow('multiPv');
    for (const limit of [{ movetimeMs: 1 }, { nodes: 1 }]) {
      const evaluation = adapter.evaluate(
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        limit,
        1
      );
      engine.emit('bestmove e2e4');
      await evaluation;
    }
    expect(engine.sent).toContain('go movetime 1');
    expect(engine.sent).toContain('go nodes 1');
  });
});
