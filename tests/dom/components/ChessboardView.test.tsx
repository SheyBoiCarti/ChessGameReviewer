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

  it('supports full keyboard move selection, roving square navigation, and move execution', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn().mockReturnValue(true);

    render(
      <ChessboardView
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        orientation="white"
        isInteractive={true}
        onMove={onMove}
      />
    );

    const board = screen.getByRole('grid', { name: /chess board/i });
    board.focus();

    // Default focused square is e2. Press Enter to select e2
    await user.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent(/Selected e2/i);

    // Arrow up to e3, then e4
    await user.keyboard('{ArrowUp}{ArrowUp}');

    // Press Enter on e4 to execute e2e4
    await user.keyboard('{Enter}');
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0]![0]).toMatchObject({ uci: 'e2e4', san: 'e4' });
    expect(screen.getByRole('status')).toHaveTextContent(/Played e4/i);
  });

  it('allows cancelling piece selection with Escape and announces it', async () => {
    const user = userEvent.setup();

    render(
      <ChessboardView
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        orientation="white"
        isInteractive={true}
      />
    );

    const board = screen.getByRole('grid', { name: /chess board/i });
    board.focus();

    await user.keyboard('{Enter}');
    expect(screen.getByRole('status')).toHaveTextContent(/Selected e2/i);

    await user.keyboard('{Escape}');
    expect(screen.getByRole('status')).toHaveTextContent(/Selection cleared/i);
  });

  it('handles click-to-move and promotion modal interaction', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn().mockReturnValue(true);

    render(
      <ChessboardView
        fen="7k/P7/8/8/8/8/8/K7 w - - 0 1"
        orientation="white"
        isInteractive={true}
        onMove={onMove}
      />
    );

    const a7 = screen.getByRole('gridcell', { name: 'a7' });
    const a8 = screen.getByRole('gridcell', { name: 'a8' });

    await user.click(a7);
    await user.click(a8);

    // Promotion dialog should open
    expect(screen.getByRole('dialog', { name: 'Promote pawn' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Queen' }));

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove.mock.calls[0]![0]).toMatchObject({ uci: 'a7a8q', san: 'a8=Q+' });
  });

  describe('Player rows and board orientation toolbar', () => {
    const players = {
      white: { username: 'HikaruNakamura', rating: 2875 },
      black: { username: 'MagnusCarlsen', rating: 2882 },
    };

    it('renders Black player on top and White player on bottom in white orientation', () => {
      render(
        <ChessboardView
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          orientation="white"
          players={players}
        />
      );

      const topRow = screen.getByLabelText(/black: magnuscarlsen \(2882\)/i);
      const bottomRow = screen.getByLabelText(/white: hikarunakamura \(2875\)/i);

      expect(topRow).toHaveClass('player-row--top');
      expect(bottomRow).toHaveClass('player-row--bottom');
      expect(within(topRow).getByText('MagnusCarlsen')).toBeInTheDocument();
      expect(within(topRow).getByText('(2882)')).toBeInTheDocument();
      expect(within(bottomRow).getByText('HikaruNakamura')).toBeInTheDocument();
      expect(within(bottomRow).getByText('(2875)')).toBeInTheDocument();
    });

    it('renders White player on top and Black player on bottom in black orientation', () => {
      render(
        <ChessboardView
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          orientation="black"
          players={players}
        />
      );

      const topRow = screen.getByLabelText(/white: hikarunakamura \(2875\)/i);
      const bottomRow = screen.getByLabelText(/black: magnuscarlsen \(2882\)/i);

      expect(topRow).toHaveClass('player-row--top');
      expect(bottomRow).toHaveClass('player-row--bottom');
      expect(within(topRow).getByText('HikaruNakamura')).toBeInTheDocument();
      expect(within(bottomRow).getByText('MagnusCarlsen')).toBeInTheDocument();
    });

    it('handles missing username and rating with accessible fallbacks', () => {
      render(
        <ChessboardView
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          orientation="white"
          players={{
            white: { username: null, rating: null },
            black: { username: 'Guest', rating: null },
          }}
        />
      );

      const topRow = screen.getByLabelText(/black: guest/i);
      const bottomRow = screen.getByLabelText(/white: white player/i);

      expect(within(bottomRow).getByText('White player')).toBeInTheDocument();
      expect(within(topRow).getByText('Guest')).toBeInTheDocument();
      expect(screen.queryByText(/\(\d+\)/)).not.toBeInTheDocument();
    });

    it('renders a visible Flip board button and triggers callback on click', async () => {
      const user = userEvent.setup();
      const onFlip = vi.fn();

      render(
        <ChessboardView
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          orientation="white"
          onFlipOrientation={onFlip}
        />
      );

      const flipButton = screen.getByRole('button', { name: /flip board/i });
      expect(flipButton).toBeVisible();
      expect(flipButton).toHaveTextContent('Flip board');

      await user.click(flipButton);
      expect(onFlip).toHaveBeenCalledTimes(1);
    });
  });
});
