import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChessboardView } from '@/components/board/ChessboardView';

describe('ChessboardView', () => {
  it('renders accessible real pieces in both orientations', () => {
    const { rerender } = render(
      <ChessboardView
        fen="7k/P7/8/8/8/8/8/K7 w - - 0 1"
        orientation="white"
        currentPly={0}
        totalPlies={0}
        onPlyChange={vi.fn()}
      />
    );

    expect(screen.getByRole('grid', { name: /chess board/i })).toHaveAttribute(
      'data-orientation',
      'white'
    );
    expect(screen.getByLabelText(/white pawn on a7/i)).toBeInTheDocument();
    rerender(
      <ChessboardView
        fen="7k/P7/8/8/8/8/8/K7 w - - 0 1"
        orientation="black"
        currentPly={0}
        totalPlies={0}
        onPlyChange={vi.fn()}
      />
    );
    expect(screen.getByRole('grid', { name: /chess board/i })).toHaveAttribute(
      'data-orientation',
      'black'
    );
  });

  it('supports boundary-safe keyboard and button history navigation', async () => {
    const user = userEvent.setup();
    const onPlyChange = vi.fn();
    render(
      <ChessboardView
        fen="8/8/8/8/8/8/8/K6k w - - 0 1"
        orientation="white"
        currentPly={1}
        totalPlies={3}
        onPlyChange={onPlyChange}
      />
    );

    const board = screen.getByRole('grid', { name: /chess board/i });
    board.focus();
    await user.keyboard('{ArrowRight}{End}{Home}');
    expect(onPlyChange.mock.calls.map(([ply]) => ply)).toEqual([2, 3, 0]);
    await user.click(screen.getByRole('button', { name: /previous move/i }));
    expect(onPlyChange).toHaveBeenLastCalledWith(0);
  });

  it('turns invalid FEN into a recoverable alert', () => {
    render(
      <ChessboardView
        fen="invalid"
        orientation="white"
        currentPly={0}
        totalPlies={0}
        onPlyChange={vi.fn()}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/position is invalid/i);
    expect(screen.getByRole('button', { name: /return to start/i })).toBeInTheDocument();
  });

  it('draws a labelled principal-variation arrow without changing board semantics', () => {
    render(
      <ChessboardView
        fen="8/8/8/8/8/8/4P3/K6k w - - 0 1"
        orientation="white"
        currentPly={0}
        totalPlies={0}
        onPlyChange={vi.fn()}
        pvArrow={{ from: 'e2', to: 'e4' }}
      />
    );

    expect(screen.getByLabelText('Principal variation e2 to e4')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(64);
  });
});
