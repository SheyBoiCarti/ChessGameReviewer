import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChessboardView } from '@/components/board/ChessboardView';

describe('ChessboardView', () => {
  it('renders accessible local piece assets and orientation-aware coordinates', () => {
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
    expect(screen.getByLabelText(/white pawn on a7/i)).toHaveAttribute(
      'src',
      '/chess-pieces/wp.svg'
    );
    expect(screen.getAllByRole('gridcell')).toHaveLength(64);

    const whiteRows = screen.getAllByRole('row');
    const whiteFirstRow = whiteRows[0]!;
    const whiteLastRow = whiteRows[7]!;
    expect(
      within(whiteFirstRow)
        .getAllByRole('gridcell')
        .map((cell) => cell.getAttribute('data-square'))
    ).toEqual(['a8', 'b8', 'c8', 'd8', 'e8', 'f8', 'g8', 'h8']);
    expect(
      within(whiteFirstRow).getByText('8', { selector: '.board-rank-label' })
    ).toBeInTheDocument();
    expect(
      within(whiteLastRow).getAllByText(/^[a-h]$/, { selector: '.board-file-label' })
    ).toHaveLength(8);
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
    expect(screen.getAllByRole('gridcell')).toHaveLength(64);

    const blackRows = screen.getAllByRole('row');
    const blackFirstRow = blackRows[0]!;
    const blackLastRow = blackRows[7]!;
    expect(
      within(blackFirstRow)
        .getAllByRole('gridcell')
        .map((cell) => cell.getAttribute('data-square'))
    ).toEqual(['h1', 'g1', 'f1', 'e1', 'd1', 'c1', 'b1', 'a1']);
    expect(
      within(blackFirstRow).getByText('1', { selector: '.board-rank-label' })
    ).toBeInTheDocument();
    expect(
      within(blackLastRow).getAllByText(/^[a-h]$/, { selector: '.board-file-label' })
    ).toHaveLength(8);
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
    expect(screen.getByRole('button', { name: 'First position' })).toHaveTextContent('↞');
    expect(screen.getByRole('button', { name: 'Previous move' })).toHaveTextContent('‹');
    expect(screen.getByRole('button', { name: 'Next move' })).toHaveTextContent('›');
    expect(screen.getByRole('button', { name: 'Last position' })).toHaveTextContent('↠');
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

  it('places the evaluation meter beside the framed board and above move controls', () => {
    render(
      <ChessboardView
        fen="8/8/8/8/8/8/4P3/K6k w - - 0 1"
        orientation="white"
        currentPly={0}
        totalPlies={1}
        onPlyChange={vi.fn()}
        evaluationScore={{ kind: 'cp', value: 0 }}
      />
    );

    const board = screen.getByRole('grid', { name: /chess board/i });
    const meter = screen.getByRole('meter', { name: /white-perspective evaluation/i });
    const next = screen.getByRole('button', { name: 'Next move' });
    const stage = board.closest('.board-stage');

    expect(stage).not.toBeNull();
    expect(stage).toContainElement(meter);
    expect(stage).not.toContainElement(next);
  });
});
