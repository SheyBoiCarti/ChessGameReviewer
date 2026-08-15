import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PromotionDialog } from '@/components/board/PromotionDialog';

describe('PromotionDialog', () => {
  it('renders choices for White promotion and allows selection', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    render(
      <PromotionDialog
        isOpen={true}
        color="white"
        onSelect={onSelect}
        onCancel={onCancel}
      />
    );

    const dialog = screen.getByRole('dialog', { name: /promote pawn/i });
    expect(dialog).toBeInTheDocument();

    const queenBtn = screen.getByRole('button', { name: /queen/i });
    const knightBtn = screen.getByRole('button', { name: /knight/i });
    const rookBtn = screen.getByRole('button', { name: /rook/i });
    const bishopBtn = screen.getByRole('button', { name: /bishop/i });
    const cancelBtn = screen.getByRole('button', { name: /cancel/i });

    expect(queenBtn).toBeInTheDocument();
    expect(knightBtn).toBeInTheDocument();
    expect(rookBtn).toBeInTheDocument();
    expect(bishopBtn).toBeInTheDocument();
    expect(cancelBtn).toBeInTheDocument();

    await user.click(knightBtn);
    expect(onSelect).toHaveBeenCalledWith('n');
  });

  it('cancels on Escape key or cancel button', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    const { rerender } = render(
      <PromotionDialog
        isOpen={true}
        color="black"
        onSelect={onSelect}
        onCancel={onCancel}
      />
    );

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('does not render when isOpen is false', () => {
    render(
      <PromotionDialog
        isOpen={false}
        color="white"
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
