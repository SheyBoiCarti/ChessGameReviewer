import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MoveHistoryControls } from '@/components/board/MoveHistoryControls';

describe('MoveHistoryControls', () => {
  it('disables first and previous buttons at ply 0, and displays Start label', () => {
    render(<MoveHistoryControls currentPly={0} totalPlies={10} onPlyChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'First position' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous move' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next move' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Last position' })).toBeEnabled();

    const label = screen.getByLabelText('Position 0 of 10');
    expect(label).toHaveTextContent('Start');
  });

  it('disables next and last buttons at end of game', () => {
    render(<MoveHistoryControls currentPly={10} totalPlies={10} onPlyChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'First position' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Previous move' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next move' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Last position' })).toBeDisabled();

    const label = screen.getByLabelText('Position 10 of 10');
    expect(label).toHaveTextContent('5... / 5');
  });

  it('differentiates odd and even ply labels', () => {
    const { rerender } = render(
      <MoveHistoryControls currentPly={1} totalPlies={10} onPlyChange={vi.fn()} />
    );

    // Odd ply (White move): e.g. 1. / 5
    const labelOdd = screen.getByLabelText('Position 1 of 10');
    expect(labelOdd).toHaveTextContent('1. / 5');
    const oddText = labelOdd.textContent;

    // Even ply (Black move): e.g. 1... / 5
    rerender(<MoveHistoryControls currentPly={2} totalPlies={10} onPlyChange={vi.fn()} />);
    const labelEven = screen.getByLabelText('Position 2 of 10');
    expect(labelEven).toHaveTextContent('1... / 5');

    expect(oddText).not.toBe(labelEven.textContent);
  });

  it('calls onPlyChange with clamped valid plies on button clicks', async () => {
    const user = userEvent.setup();
    const onPlyChange = vi.fn();

    const { rerender } = render(
      <MoveHistoryControls currentPly={5} totalPlies={10} onPlyChange={onPlyChange} />
    );

    // First position -> 0
    await user.click(screen.getByRole('button', { name: 'First position' }));
    expect(onPlyChange).toHaveBeenLastCalledWith(0);

    // Previous move -> 4
    await user.click(screen.getByRole('button', { name: 'Previous move' }));
    expect(onPlyChange).toHaveBeenLastCalledWith(4);

    // Next move -> 6
    await user.click(screen.getByRole('button', { name: 'Next move' }));
    expect(onPlyChange).toHaveBeenLastCalledWith(6);

    // Last position -> 10
    await user.click(screen.getByRole('button', { name: 'Last position' }));
    expect(onPlyChange).toHaveBeenLastCalledWith(10);

    // Test clamped behavior near boundaries
    rerender(<MoveHistoryControls currentPly={1} totalPlies={10} onPlyChange={onPlyChange} />);
    await user.click(screen.getByRole('button', { name: 'Previous move' }));
    expect(onPlyChange).toHaveBeenLastCalledWith(0);

    rerender(<MoveHistoryControls currentPly={9} totalPlies={10} onPlyChange={onPlyChange} />);
    await user.click(screen.getByRole('button', { name: 'Next move' }));
    expect(onPlyChange).toHaveBeenLastCalledWith(10);
  });

  it('handles flip button: disabled when no callback, calls only its callback when clicked', async () => {
    const user = userEvent.setup();
    const onPlyChange = vi.fn();
    const onFlip = vi.fn();

    const { rerender } = render(
      <MoveHistoryControls currentPly={3} totalPlies={10} onPlyChange={onPlyChange} />
    );

    const flipBtnDisabled = screen.getByRole('button', { name: /flip board/i });
    expect(flipBtnDisabled).toBeDisabled();

    rerender(
      <MoveHistoryControls
        currentPly={3}
        totalPlies={10}
        onPlyChange={onPlyChange}
        onFlipOrientation={onFlip}
      />
    );

    const flipBtn = screen.getByRole('button', { name: /flip board/i });
    expect(flipBtn).toBeEnabled();

    await user.click(flipBtn);
    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(onPlyChange).not.toHaveBeenCalled();
  });
});
