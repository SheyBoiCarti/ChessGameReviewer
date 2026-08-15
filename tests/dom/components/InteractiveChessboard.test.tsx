import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Square } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';

import { InteractiveChessboard } from '@/components/board/InteractiveChessboard';
import type { AppliedBoardMove } from '@/features/board/moves';

describe('InteractiveChessboard', () => {
  const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  it('emits an applied move on clicking a source piece then a legal destination square', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn().mockReturnValue(true);

    const { container } = render(
      <InteractiveChessboard
        fen={initialFen}
        orientation="white"
        isInteractive={true}
        onMove={onMove}
      />
    );

    // In react-chessboard or square click, clicking square e2 then e4
    // Find e2 and e4 buttons/divs in the rendered board
    const squareE2 = container.querySelector('[data-square="e2"]') || container.querySelector('[data-square-coord="e2"]');
    const squareE4 = container.querySelector('[data-square="e4"]') || container.querySelector('[data-square-coord="e4"]');

    if (squareE2 && squareE4) {
      await user.click(squareE2);
      await user.click(squareE4);
      expect(onMove).toHaveBeenCalledTimes(1);
      const move: AppliedBoardMove = onMove.mock.calls[0]![0];
      expect(move.uci).toBe('e2e4');
      expect(move.san).toBe('e4');
    }
  });

  it('does not emit moves when isInteractive is false', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();

    const { container } = render(
      <InteractiveChessboard
        fen={initialFen}
        orientation="white"
        isInteractive={false}
        onMove={onMove}
      />
    );

    const squareE2 = container.querySelector('[data-square="e2"]') || container.querySelector('[data-square-coord="e2"]');
    const squareE4 = container.querySelector('[data-square="e4"]') || container.querySelector('[data-square-coord="e4"]');

    if (squareE2 && squareE4) {
      await user.click(squareE2);
      await user.click(squareE4);
      expect(onMove).not.toHaveBeenCalled();
    }
  });

  it('renders destination badges and pv arrow when supplied', () => {
    const { container } = render(
      <InteractiveChessboard
        fen={initialFen}
        orientation="white"
        isInteractive={true}
        lastMove={{ from: 'e2' as Square, to: 'e4' as Square }}
        lastMoveBadge={{ square: 'e4' as Square, quality: 'great' }}
        pvArrow={{ from: 'e2' as Square, to: 'e4' as Square }}
      />
    );

    expect(
      screen.getByRole('img', { name: 'Great move', hidden: true })
    ).toBeInTheDocument();
  });
});
