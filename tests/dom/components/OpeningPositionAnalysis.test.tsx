import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OpeningPositionAnalysis } from '@/components/opening/OpeningPositionAnalysis';

const engine = vi.hoisted(() => ({ initialize: vi.fn(), evaluate: vi.fn(), dispose: vi.fn() }));
vi.mock('@/features/stockfish-analysis/engineService', () => ({
  EngineService: class {
    initialize = engine.initialize;
    evaluate = engine.evaluate;
    dispose = engine.dispose;
  },
}));
const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('OpeningPositionAnalysis', () => {
  it('starts on demand, cancels stale searches, normalizes Black scores and disposes when disabled', async () => {
    vi.clearAllMocks();
    engine.initialize.mockResolvedValue({ mode: 'single-thread' });
    let resolveOld!: (value: unknown) => void;
    engine.evaluate
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          })
      )
      .mockResolvedValue({
        lines: [{ depth: 12, score: { kind: 'cp', value: 35 }, pv: ['e7e5'] }],
      });
    const user = userEvent.setup();
    const { rerender } = render(<OpeningPositionAnalysis fen={start} />);
    expect(engine.initialize).not.toHaveBeenCalled();
    await user.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(engine.evaluate).toHaveBeenCalledTimes(1));
    const signal = engine.evaluate.mock.calls[0]![0].signal as AbortSignal;
    rerender(<OpeningPositionAnalysis fen={afterE4} />);
    expect(signal.aborted).toBe(true);
    await screen.findByText(/-0.35.*Depth 12.*e5/);
    await act(async () =>
      resolveOld({ lines: [{ depth: 5, score: { kind: 'cp', value: 99 }, pv: ['e2e4'] }] })
    );
    expect(screen.getByRole('status')).toHaveTextContent('-0.35');
    await user.click(screen.getByRole('checkbox'));
    expect(engine.dispose).toHaveBeenCalled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
