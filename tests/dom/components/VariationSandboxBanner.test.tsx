import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { VariationSandboxBanner } from '@/components/analysis/VariationSandboxBanner';
import type { AnalysisVariationState } from '@/features/board/variation';

describe('VariationSandboxBanner', () => {
  const variationState: AnalysisVariationState = {
    basePly: 14,
    baseFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moves: [
      {
        from: 'e2',
        to: 'e4',
        uci: 'e2e4',
        san: 'e4',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      },
      {
        from: 'e7',
        to: 'e5',
        uci: 'e7e5',
        san: 'e5',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      },
    ],
    cursor: 2,
  };

  it('renders exploration heading, breadcrumbs, boundary controls, and return button', async () => {
    const user = userEvent.setup();
    const onCursorChange = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <VariationSandboxBanner
        state={variationState}
        onCursorChange={onCursorChange}
        onClose={onClose}
      />
    );

    expect(screen.getByText(/exploration from ply 14/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'e4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'e5' })).toBeInTheDocument();

    const prevBtn = screen.getByRole('button', { name: /previous variation move/i });
    const nextBtn = screen.getByRole('button', { name: /next variation move/i });
    const returnBtn = screen.getByRole('button', { name: /return to main game/i });

    expect(prevBtn).not.toBeDisabled();
    expect(nextBtn).toBeDisabled(); // cursor is at tail (2 of 2)

    await user.click(prevBtn);
    expect(onCursorChange).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole('button', { name: 'e4' }));
    expect(onCursorChange).toHaveBeenCalledWith(1);

    await user.click(returnBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <VariationSandboxBanner
        state={{ ...variationState, cursor: 0 }}
        onCursorChange={onCursorChange}
        onClose={onClose}
      />
    );
    expect(screen.getByRole('button', { name: /previous variation move/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next variation move/i })).not.toBeDisabled();
  });
});
