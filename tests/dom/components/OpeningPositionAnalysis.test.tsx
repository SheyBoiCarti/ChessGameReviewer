import { StrictMode, useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OpeningPositionAnalysis } from '@/components/opening/OpeningPositionAnalysis';
import { usePositionAnalysis } from '@/features/stockfish-analysis/usePositionAnalysis';

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

function Harness({
  fen,
  onPlayMove = vi.fn(),
}: {
  fen: string;
  onPlayMove?: (uci: string) => void;
}) {
  const [enabled, setEnabled] = useState(true);
  const analysis = usePositionAnalysis(enabled ? fen : null);
  return (
    <>
      <output data-testid="board-score">{analysis.score?.value}</output>
      <OpeningPositionAnalysis
        fen={fen}
        analysis={analysis}
        enabled={enabled}
        onEnabledChange={setEnabled}
        onPlayMove={onPlayMove}
      />
    </>
  );
}

describe('OpeningPositionAnalysis', () => {
  it('keeps the last White-perspective score visible while replacing position-specific engine lines', async () => {
    vi.clearAllMocks();
    engine.initialize.mockResolvedValue({ mode: 'single-thread' });
    let resolveNext!: (value: unknown) => void;
    engine.evaluate
      .mockResolvedValueOnce({
        lines: [{ multiPv: 1, depth: 12, score: { kind: 'cp', value: 75 }, pv: ['e2e4'] }],
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNext = resolve;
          })
      );
    const { rerender } = render(<Harness fen={start} />);
    await screen.findByRole('button', { name: 'Play engine choice 1: e4' });
    expect(screen.getByTestId('board-score')).toHaveTextContent('75');

    rerender(<Harness fen={afterE4} />);
    await waitFor(() => expect(engine.evaluate).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Analysing this position…')).toBeInTheDocument();
    expect(screen.getByTestId('board-score')).toHaveTextContent('75');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    await act(async () =>
      resolveNext({
        lines: [{ multiPv: 1, depth: 14, score: { kind: 'cp', value: 25 }, pv: ['e7e5'] }],
      })
    );
    await screen.findByRole('button', { name: 'Play engine choice 1: e5' });
    expect(screen.getByTestId('board-score')).toHaveTextContent('-25');
  });

  it('automatically requests three choices, cancels stale searches, and updates the board score from Black positions', async () => {
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
        lines: [
          { multiPv: 2, depth: 12, score: { kind: 'cp', value: 20 }, pv: ['c7c5'] },
          { multiPv: 1, depth: 12, score: { kind: 'cp', value: 35 }, pv: ['e7e5'] },
          { multiPv: 3, depth: 12, score: { kind: 'cp', value: 10 }, pv: ['e7e6'] },
        ],
      });
    const user = userEvent.setup();
    const onPlayMove = vi.fn();
    const { rerender } = render(<Harness fen={start} onPlayMove={onPlayMove} />);
    await waitFor(() => expect(engine.evaluate).toHaveBeenCalledTimes(1));
    expect(engine.evaluate.mock.calls[0]![0].multiPv).toBe(3);
    const signal = engine.evaluate.mock.calls[0]![0].signal as AbortSignal;
    rerender(<Harness fen={afterE4} onPlayMove={onPlayMove} />);
    expect(signal.aborted).toBe(true);
    const first = await screen.findByRole('button', { name: 'Play engine choice 1: e5' });
    expect(first).toHaveTextContent('-0.35');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByTestId('board-score')).toHaveTextContent('-35');
    await user.click(first);
    expect(onPlayMove).toHaveBeenCalledWith('e7e5');
    await act(async () =>
      resolveOld({
        lines: [{ multiPv: 1, depth: 5, score: { kind: 'cp', value: 99 }, pv: ['e2e4'] }],
      })
    );
    expect(screen.getByTestId('board-score')).toHaveTextContent('-35');
    await user.click(screen.getByRole('checkbox'));
    expect(engine.dispose).toHaveBeenCalled();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByTestId('board-score')).toBeEmptyDOMElement();
  });

  it('survives Strict Mode remounts and reports unavailable engines', async () => {
    vi.clearAllMocks();
    engine.initialize.mockResolvedValue({ mode: 'unavailable' });
    const { unmount } = render(
      <StrictMode>
        <Harness fen={start} />
      </StrictMode>
    );
    await screen.findByText('Stockfish is unavailable on this device.');
    expect(engine.evaluate).not.toHaveBeenCalled();
    unmount();
    expect(engine.dispose).toHaveBeenCalledTimes(2);
  });
});
