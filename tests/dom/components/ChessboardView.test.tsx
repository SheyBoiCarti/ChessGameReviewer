import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';

import {
  calculateMoveDelta,
  ChessboardView,
  computeArrowPath,
  getCastlingRookMove,
  prefersReducedMotion,
  squareCenter,
} from '@/components/board/ChessboardView';
import { EvaluationBar } from '@/components/board/EvaluationBar';

it('keeps opening square navigation when further piece input is disabled', () => {
  const onPlyChange = vi.fn();
  render(
    <ChessboardView
      fen="rnbqkbnr/pppppppp/8/8/8/P7/1PPPPPPP/RNBQKBNR b KQkq - 0 1"
      orientation="white"
      isInteractive={false}
      squareNavigation
      history={{ currentPly: 1, totalPlies: 1, onPlyChange }}
    />
  );
  const board = screen.getByRole('grid', { name: 'Chess board' });
  expect(board).toHaveAccessibleDescription(/Piece input is disabled at this position/);
  fireEvent.keyDown(board, { key: 'ArrowLeft' });
  expect(onPlyChange).not.toHaveBeenCalled();
  expect(board).toHaveAttribute('aria-activedescendant', 'square-d2');
  fireEvent.keyDown(board, { key: 'ArrowLeft', altKey: true });
  expect(onPlyChange).toHaveBeenCalledWith(0);
});

describe('ChessboardView', () => {
  it('shows board flipping without disabled playback arrows when no history is supplied', async () => {
    const flip = vi.fn();
    render(
      <ChessboardView
        fen="7k/P7/8/8/8/8/8/K7 w - - 0 1"
        orientation="white"
        onFlipOrientation={flip}
      />
    );
    expect(screen.queryByRole('button', { name: 'Previous move' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next move' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Flip board' }));
    expect(flip).toHaveBeenCalledOnce();
  });

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
      '/chess-pieces/neo/wp.png'
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
    expect(screen.getByRole('button', { name: 'First position' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Previous move' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Next move' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Last position' })).toBeVisible();
    board.focus();
    await user.keyboard('{ArrowRight}{End}{Home}');
    expect(onPlyChange.mock.calls.map(([ply]) => ply)).toEqual([2, 3, 0]);
    await user.click(screen.getByRole('button', { name: /previous move/i }));
    expect(onPlyChange).toHaveBeenLastCalledWith(0);
  });

  it('traverses history with Alt+ArrowLeft/Right while plain arrows stay square navigation', async () => {
    const user = userEvent.setup();
    const onPlyChange = vi.fn();
    render(
      <ChessboardView
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        orientation="white"
        isInteractive
        currentPly={1}
        totalPlies={3}
        onPlyChange={onPlyChange}
      />
    );

    const board = screen.getByRole('grid', { name: /chess board/i });
    board.focus();
    // Plain arrows move square focus, never history.
    await user.keyboard('{ArrowRight}');
    expect(onPlyChange).not.toHaveBeenCalled();
    // Alt+Left/Right traverse history (T39).
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(onPlyChange).toHaveBeenLastCalledWith(0);
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(onPlyChange).toHaveBeenLastCalledWith(2);
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

  it('recovers across valid and invalid FEN updates without changing hook order', async () => {
    const onPlyChange = vi.fn();
    const props = { orientation: 'white' as const, currentPly: 1, totalPlies: 2, onPlyChange };
    const { rerender } = render(<ChessboardView {...props} fen={new Chess().fen()} />);
    rerender(<ChessboardView {...props} fen="invalid" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Return to start' }));
    expect(onPlyChange).toHaveBeenCalledWith(0);
    rerender(<ChessboardView {...props} fen={new Chess().fen()} />);
    expect(screen.getAllByRole('gridcell')).toHaveLength(64);
  });

  it('ignores unsupported modifiers, prevented events, editable descendants, and open dialogs', () => {
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
    for (const modifier of ['ctrlKey', 'metaKey', 'shiftKey']) {
      fireEvent.keyDown(board, { key: 'ArrowRight', [modifier]: true });
      fireEvent.keyDown(board, { key: 'ArrowLeft', altKey: true, [modifier]: true });
    }
    fireEvent.keyDown(board, { key: 'End', altKey: true });
    const prevented = createEvent.keyDown(board, { key: 'ArrowRight' });
    prevented.preventDefault();
    fireEvent(board, prevented);

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', '');
    const descendant = document.createElement('span');
    editable.append(descendant);
    board.append(editable);
    fireEvent.keyDown(descendant, { key: 'ArrowRight' });
    editable.remove();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    fireEvent.keyDown(board, { key: 'ArrowRight' });
    dialog.remove();
    expect(onPlyChange).not.toHaveBeenCalled();
    fireEvent.keyDown(board, { key: 'ArrowRight' });
    expect(onPlyChange).toHaveBeenCalledWith(2);
  });

  it('blocks board history shortcuts while the promotion dialog is open', async () => {
    const user = userEvent.setup();
    const onPlyChange = vi.fn();
    render(
      <ChessboardView
        fen="7k/P7/8/8/8/8/8/K7 w - - 0 1"
        orientation="white"
        isInteractive
        history={{ currentPly: 1, totalPlies: 3, onPlyChange }}
      />
    );
    await user.click(screen.getByRole('gridcell', { name: 'a7' }));
    await user.click(screen.getByRole('gridcell', { name: 'a8' }));
    expect(screen.getByRole('dialog', { name: 'Promote pawn' })).toBeVisible();
    fireEvent.keyDown(screen.getByRole('grid', { name: /chess board/i }), {
      key: 'ArrowLeft',
      altKey: true,
    });
    expect(onPlyChange).not.toHaveBeenCalled();
  });

  it('draws a labelled principal-variation arrow in 2048x2048 space without changing board semantics', () => {
    const { container, rerender } = render(
      <ChessboardView
        fen="8/8/8/8/8/8/4P3/K6k w - - 0 1"
        orientation="white"
        currentPly={0}
        totalPlies={0}
        onPlyChange={vi.fn()}
        pvArrow={{ from: 'e2', to: 'e4' }}
      />
    );

    const arrowSvg = container.querySelector('svg.board-arrow');
    expect(arrowSvg).toBeInTheDocument();
    expect(arrowSvg).toHaveAttribute('viewBox', '0 0 2048 2048');
    expect(arrowSvg).toHaveAttribute('pointer-events', 'none');
    expect(screen.getByLabelText('Principal variation e2 to e4')).toBeInTheDocument();
    expect(screen.getAllByRole('gridcell')).toHaveLength(64);

    const marker = container.querySelector('.board-arrow marker');
    expect(marker).toHaveAttribute('markerWidth', '2');
    expect(marker).toHaveAttribute('markerHeight', '2.5');
    expect(marker).toHaveAttribute('refX', '1.25');
    expect(marker).toHaveAttribute('refY', '1.25');
    expect(marker).toHaveAttribute('orient', 'auto');

    const polygon = marker?.querySelector('polygon');
    expect(polygon).toHaveAttribute('points', '0.3 0, 2 1.25, 0.3 2.5');
    expect(polygon).toHaveAttribute('fill', 'rgb(255 170 0 / 78%)');

    const path = container.querySelector('.board-arrow path');
    expect(path).toHaveAttribute('stroke-width', '51.2');
    expect(path).toHaveAttribute('fill', 'none');
    expect(path).toHaveAttribute('d', 'M 1152,1664 L 1152,1200');

    // Knight PV arrow
    rerender(
      <ChessboardView
        fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        orientation="white"
        currentPly={0}
        totalPlies={0}
        onPlyChange={vi.fn()}
        pvArrow={{ from: 'g1', to: 'f3' }}
      />
    );
    const knightPath = container.querySelector('.board-arrow path');
    expect(knightPath).toHaveAttribute('d', 'M 1664,1920 L 1664,1408 L 1456,1408');
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

  it('does not render evaluation meter when evaluationScore is undefined, keeping desktop placeholder to prevent layout shift', () => {
    const { container } = render(
      <ChessboardView
        fen="8/8/8/8/8/8/4P3/K6k w - - 0 1"
        orientation="white"
        currentPly={0}
        totalPlies={0}
        onPlyChange={vi.fn()}
      />
    );
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
    expect(container.querySelector('.evaluation-bar-placeholder')).toBeInTheDocument();
  });

  it('positions vertical bar next to board on desktop and horizontal bar beneath board on mobile', () => {
    const originalMatchMedia = window.matchMedia;
    try {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { container: desktopContainer, unmount } = render(
        <ChessboardView
          fen="8/8/8/8/8/8/4P3/K6k w - - 0 1"
          orientation="white"
          evaluationScore={{ kind: 'cp', value: 150 }}
        />
      );

      const desktopMeter = screen.getByRole('meter');
      expect(desktopMeter).toHaveAttribute('data-mode', 'vertical');
      expect(desktopMeter).toHaveClass('evaluation-bar--vertical');
      const stageChildren = Array.from(desktopContainer.querySelector('.board-stage')!.children);
      const meterIndexDesktop = stageChildren.indexOf(desktopMeter);
      const frameIndexDesktop = stageChildren.indexOf(
        desktopContainer.querySelector('.chessboard-frame')!
      );
      expect(meterIndexDesktop).toBeLessThan(frameIndexDesktop);

      unmount();

      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query === '(width < 768px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      const { container: mobileContainer } = render(
        <ChessboardView
          fen="8/8/8/8/8/8/4P3/K6k w - - 0 1"
          orientation="white"
          evaluationScore={{ kind: 'cp', value: 150 }}
        />
      );

      const mobileMeter = screen.getByRole('meter');
      expect(mobileMeter).toHaveAttribute('data-mode', 'horizontal');
      expect(mobileMeter).toHaveClass('evaluation-bar--horizontal');
      const mobileStageChildren = Array.from(
        mobileContainer.querySelector('.board-stage')!.children
      );
      const meterIndexMobile = mobileStageChildren.indexOf(mobileMeter);
      const frameIndexMobile = mobileStageChildren.indexOf(
        mobileContainer.querySelector('.chessboard-frame')!
      );
      expect(meterIndexMobile).toBeGreaterThan(frameIndexMobile);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  describe('Phase 4: EvaluationBar responsive rendering modes', () => {
    it('renders vertical mode with 28px width, 100% height, border-radius 6px, and score pill', () => {
      render(
        <EvaluationBar mode="vertical" score={{ kind: 'cp', value: 150 }} orientation="white" />
      );
      const meter = screen.getByRole('meter');
      expect(meter).toHaveAttribute('data-mode', 'vertical');
      expect(meter).toHaveClass('evaluation-bar--vertical');
      expect(meter.style.width).toBe('28px');
      expect(meter.style.height).toBe('100%');
      expect(meter.style.borderRadius).toBe('6px');

      const fill = meter.querySelector('.evaluation-bar__white') as HTMLElement;
      expect(fill).toBeInTheDocument();
      expect(fill.style.height).toBeTruthy();
      expect(fill.style.transition).toBe('height 160ms cubic-bezier(0.4, 0, 0.2, 1)');
      expect(fill.style.bottom).toBe('0px');

      const text = meter.querySelector('.evaluation-bar__text');
      expect(text).toBeInTheDocument();
      expect(text).toHaveTextContent('+1.5');
    });

    it('renders horizontal mode with 100% width, 6px height, border-radius 999px, and no text pill', () => {
      render(
        <EvaluationBar mode="horizontal" score={{ kind: 'cp', value: 150 }} orientation="white" />
      );
      const meter = screen.getByRole('meter');
      expect(meter).toHaveAttribute('data-mode', 'horizontal');
      expect(meter).toHaveClass('evaluation-bar--horizontal');
      expect(meter.style.width).toBe('100%');
      expect(meter.style.height).toBe('6px');
      expect(meter.style.borderRadius).toBe('999px');

      const fill = meter.querySelector('.evaluation-bar__white') as HTMLElement;
      expect(fill).toBeInTheDocument();
      expect(fill.style.width).toBeTruthy();
      expect(fill.style.transition).toBe('width 160ms cubic-bezier(0.4, 0, 0.2, 1)');
      expect(fill.style.left).toBe('0px');

      const text = meter.querySelector('.evaluation-bar__text');
      expect(text).not.toBeInTheDocument();
    });

    it('inverts fill origin when orientation is black', () => {
      const { rerender } = render(
        <EvaluationBar mode="vertical" score={{ kind: 'cp', value: 150 }} orientation="black" />
      );
      const verticalFill = screen
        .getByRole('meter')
        .querySelector('.evaluation-bar__white') as HTMLElement;
      expect(verticalFill.style.top).toBe('0px');

      rerender(
        <EvaluationBar mode="horizontal" score={{ kind: 'cp', value: 150 }} orientation="black" />
      );
      const horizontalFill = screen
        .getByRole('meter')
        .querySelector('.evaluation-bar__white') as HTMLElement;
      expect(horizontalFill.style.right).toBe('0px');
    });
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
      const bottomRow = screen.getByLabelText(/white: unknown player/i);

      expect(within(bottomRow).getByText('Unknown player')).toBeInTheDocument();
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

    it('T53: renders multiple opening candidate arrows with unique marker IDs and pointer-events none', () => {
      const { container } = render(
        <ChessboardView
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          orientation="white"
          openingArrows={[
            { from: 'e2', to: 'e4', uci: 'e2e4', band: 'strong', active: false },
            { from: 'd2', to: 'd4', uci: 'd2d4', band: 'medium', active: false },
            { from: 'g1', to: 'f3', uci: 'g1f3', band: 'rare', active: true },
          ]}
        />
      );

      const openingOverlay = container.querySelector('.opening-arrows');
      expect(openingOverlay).toBeInTheDocument();
      expect(openingOverlay).toHaveAttribute('pointer-events', 'none');
      expect(openingOverlay).toHaveAttribute('aria-hidden', 'true');

      const ids = Array.from(container.querySelectorAll('marker')).map((node) => node.id);
      expect(ids.length).toBeGreaterThanOrEqual(3);
      expect(new Set(ids).size).toBe(ids.length);

      // Verify active candidate has active class
      expect(container.querySelector('.opening-arrow--active')).toBeInTheDocument();
    });

    it('T53: isolates marker IDs between multiple mounted boards', () => {
      const { container: container1 } = render(
        <ChessboardView
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          orientation="white"
          openingArrows={[{ from: 'e2', to: 'e4', uci: 'e2e4', band: 'strong', active: false }]}
        />
      );
      const { container: container2 } = render(
        <ChessboardView
          fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
          orientation="black"
          openingArrows={[{ from: 'e2', to: 'e4', uci: 'e2e4', band: 'strong', active: false }]}
        />
      );

      const ids1 = Array.from(container1.querySelectorAll('marker')).map((node) => node.id);
      const ids2 = Array.from(container2.querySelectorAll('marker')).map((node) => node.id);
      const combined = [...ids1, ...ids2];
      expect(new Set(combined).size).toBe(combined.length);
    });
  });
});

it.each(['white', 'black'] as const)(
  'T53: %s overlay endpoints cover castling, promotion, knights and shared destinations',
  (orientation) => {
    const arrows = [
      { from: 'e1', to: 'g1', uci: 'e1g1' },
      { from: 'a7', to: 'a8', uci: 'a7a8q' },
      { from: 'b1', to: 'c3', uci: 'b1c3' },
      { from: 'd1', to: 'c3', uci: 'd1c3' },
    ] as const;
    const { container } = render(
      <ChessboardView
        fen="4k3/P7/8/8/8/8/8/1N1NK2R w K - 0 1"
        orientation={orientation}
        openingArrows={arrows.map((a) => ({ ...a, band: 'strong', active: false }))}
      />
    );
    const arrowElements = [...container.querySelectorAll('.opening-arrow')];
    expect(arrowElements).toHaveLength(arrows.length);

    arrows.forEach((arrow, i) => {
      const from = squareCenter(arrow.from, orientation)!;
      const to = squareCenter(arrow.to, orientation)!;
      const expected = computeArrowPath(from, to);
      expect(arrowElements[i]?.getAttribute('d')).toBe(expected.d);
      expect(arrowElements[i]?.getAttribute('stroke-width')).toBe('51.2');
      expect(arrowElements[i]?.getAttribute('fill')).toBe('none');
    });

    const overlay = container.querySelector('.opening-arrows');
    expect(overlay).toHaveAttribute('pointer-events', 'none');
    expect(overlay).toHaveAttribute('viewBox', '0 0 2048 2048');

    const markers = container.querySelectorAll('.opening-arrows marker');
    expect(markers).toHaveLength(arrows.length);
    markers.forEach((marker) => {
      expect(marker).toHaveAttribute('markerWidth', '2');
      expect(marker).toHaveAttribute('markerHeight', '2.5');
      expect(marker).toHaveAttribute('refX', '1.25');
      expect(marker).toHaveAttribute('refY', '1.25');
      expect(marker).toHaveAttribute('orient', 'auto');
      const polygon = marker.querySelector('polygon');
      expect(polygon).toHaveAttribute('points', '0.3 0, 2 1.25, 0.3 2.5');
    });
  }
);

describe('Phase 3: FLIP Piece Animations', () => {
  describe('calculateMoveDelta', () => {
    it('calculates correct square delta percentages for white orientation', () => {
      // e2 -> e4: 2 squares up (deltaY = +200%)
      expect(calculateMoveDelta('e2', 'e4', 'white')).toEqual({ deltaX: 0, deltaY: 200 });
      // e4 -> e2: 2 squares down (deltaY = -200%)
      expect(calculateMoveDelta('e4', 'e2', 'white')).toEqual({ deltaX: 0, deltaY: -200 });
      // e1 -> g1: 2 squares right (deltaX = -200%)
      expect(calculateMoveDelta('e1', 'g1', 'white')).toEqual({ deltaX: -200, deltaY: 0 });
      // h1 -> f1: 2 squares left (deltaX = +200%)
      expect(calculateMoveDelta('h1', 'f1', 'white')).toEqual({ deltaX: 200, deltaY: 0 });
      // e1 -> c1: 2 squares left (deltaX = +200%)
      expect(calculateMoveDelta('e1', 'c1', 'white')).toEqual({ deltaX: 200, deltaY: 0 });
      // a1 -> d1: 3 squares right (deltaX = -300%)
      expect(calculateMoveDelta('a1', 'd1', 'white')).toEqual({ deltaX: -300, deltaY: 0 });
      // b1 -> c3: knight move (deltaX = -100%, deltaY = +200%)
      expect(calculateMoveDelta('b1', 'c3', 'white')).toEqual({ deltaX: -100, deltaY: 200 });
    });

    it('calculates correct square delta percentages for black orientation', () => {
      // In black orientation, ranks and files are inverted
      // e2 -> e4: from black perspective, e2 is near the top (row 1), e4 is lower (row 3)
      expect(calculateMoveDelta('e2', 'e4', 'black')).toEqual({ deltaX: 0, deltaY: -200 });
      // e1 -> g1: from black perspective, e1 is to the right of g1
      expect(calculateMoveDelta('e1', 'g1', 'black')).toEqual({ deltaX: 200, deltaY: 0 });
      // h1 -> f1: from black perspective, h1 is to the left of f1
      expect(calculateMoveDelta('h1', 'f1', 'black')).toEqual({ deltaX: -200, deltaY: 0 });
    });
  });

  describe('getCastlingRookMove', () => {
    it('detects all four standard castling moves and returns corresponding rook moves', () => {
      expect(getCastlingRookMove('e1', 'g1')).toEqual({ from: 'h1', to: 'f1' });
      expect(getCastlingRookMove('e1', 'c1')).toEqual({ from: 'a1', to: 'd1' });
      expect(getCastlingRookMove('e8', 'g8')).toEqual({ from: 'h8', to: 'f8' });
      expect(getCastlingRookMove('e8', 'c8')).toEqual({ from: 'a8', to: 'd8' });
    });

    it('returns null for non-castling king or piece moves', () => {
      expect(getCastlingRookMove('e2', 'e4')).toBeNull();
      expect(getCastlingRookMove('e1', 'e2')).toBeNull();
      expect(getCastlingRookMove('e1', 'd1')).toBeNull();
      expect(getCastlingRookMove('a1', 'a8')).toBeNull();
    });
  });

  describe('FLIP piece animations in ChessboardView', () => {
    const animations: Array<{
      element: HTMLElement;
      keyframes: Keyframe[];
      options: KeyframeAnimationOptions;
      cancel: ReturnType<typeof vi.fn>;
      finish(): void;
    }> = [];
    const originalAnimate = HTMLElement.prototype.animate;

    beforeEach(() => {
      animations.length = 0;
      HTMLElement.prototype.animate = vi.fn(function (
        this: HTMLElement,
        keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
        options?: number | KeyframeAnimationOptions
      ) {
        let finish!: () => void;
        let reject!: () => void;
        const finished = new Promise<void>((resolve, rejectPromise) => {
          finish = resolve;
          reject = () => rejectPromise(new Error('cancelled'));
        });
        const cancel = vi.fn(reject);
        animations.push({
          element: this,
          keyframes: keyframes as Keyframe[],
          options: options as KeyframeAnimationOptions,
          cancel,
          finish,
        });
        return { finished, cancel } as unknown as Animation;
      });
    });

    afterEach(() => {
      if (originalAnimate) HTMLElement.prototype.animate = originalAnimate;
      else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    });

    function transition(beforeFen: string, san: string, orientation: 'white' | 'black' = 'white') {
      const chess = new Chess(beforeFen);
      const view = render(<ChessboardView fen={chess.fen()} orientation={orientation} />);
      const move = chess.move(san);
      const props = { fen: chess.fen(), orientation, lastMove: { from: move.from, to: move.to } };
      view.rerender(<ChessboardView {...props} />);
      return { ...view, props };
    }

    it('keeps an equivalent move rerender running until animation completion', async () => {
      const { container, rerender, props } = transition(new Chess().fen(), 'e4');
      const animation = animations[0]!;
      expect(animation.element).toBe(container.querySelector('[data-square="e4"] .chess-piece'));
      expect(animation.keyframes).toEqual([
        { transform: 'translate3d(0%, 200%, 0)' },
        { transform: 'translate3d(0, 0, 0)' },
      ]);
      expect(animation.options).toEqual({ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
      rerender(<ChessboardView {...props} lastMove={{ from: 'e2', to: 'e4' }} />);
      expect(animation.cancel).not.toHaveBeenCalled();
      expect(animations).toHaveLength(1);
      await act(async () => animation.finish());
      expect(animation.cancel).toHaveBeenCalledOnce();
      expect(animation.element.style.willChange).toBe('');
      expect(animation.element.parentElement?.style.zIndex).toBe('');
    });

    it('undoes the latest move instead of replaying the preceding move', () => {
      const before = new Chess();
      before.move('e4');
      const { rerender, props } = transition(before.fen(), 'c5');
      rerender(
        <ChessboardView
          fen={before.fen()}
          orientation={props.orientation}
          lastMove={{ from: 'e2', to: 'e4' }}
        />
      );
      expect(animations).toHaveLength(2);
      expect(animations[0]!.cancel).toHaveBeenCalledOnce();
      expect(animations[1]!.element).toHaveAttribute('aria-label', 'black pawn on c7');
      expect(animations[1]!.keyframes[0]).toEqual({ transform: 'translate3d(0%, 200%, 0)' });
    });

    it('animates undoing the first move even without a lastMove at the starting position', () => {
      const { rerender } = transition(new Chess().fen(), 'e4');
      rerender(<ChessboardView fen={new Chess().fen()} orientation="white" />);
      expect(animations[1]!.element).toHaveAttribute('aria-label', 'white pawn on e2');
      expect(animations[1]!.keyframes[0]).toEqual({ transform: 'translate3d(0%, -200%, 0)' });
    });

    it.each([
      ['white', 'w', 'O-O', 'g1', 'f1', -200, 200],
      ['white', 'w', 'O-O-O', 'c1', 'd1', 200, -300],
      ['white', 'b', 'O-O', 'g8', 'f8', -200, 200],
      ['white', 'b', 'O-O-O', 'c8', 'd8', 200, -300],
      ['black', 'w', 'O-O', 'g1', 'f1', 200, -200],
      ['black', 'w', 'O-O-O', 'c1', 'd1', -200, 300],
      ['black', 'b', 'O-O', 'g8', 'f8', 200, -200],
      ['black', 'b', 'O-O-O', 'c8', 'd8', -200, 300],
    ] as const)(
      'animates %s orientation %s %s king and rook forward and backward',
      (orientation, side, san, king, rook, kingDelta, rookDelta) => {
        const fen = `r3k2r/8/8/8/8/8/8/R3K2R ${side} KQkq - 0 1`;
        const { rerender } = transition(fen, san, orientation);
        expect(animations.map((a) => a.element.parentElement?.dataset.square)).toEqual([
          king,
          rook,
        ]);
        expect(animations.map((a) => a.keyframes[0])).toEqual([
          { transform: `translate3d(${kingDelta}%, 0%, 0)` },
          { transform: `translate3d(${rookDelta}%, 0%, 0)` },
        ]);
        rerender(<ChessboardView fen={fen} orientation={orientation} />);
        expect(animations.slice(2).map((a) => a.element.parentElement?.dataset.square)).toEqual([
          side === 'w' ? 'e1' : 'e8',
          `${san === 'O-O' ? 'h' : 'a'}${side === 'w' ? '1' : '8'}`,
        ]);
        expect(animations.slice(2).map((a) => a.keyframes[0])).toEqual([
          { transform: `translate3d(${-kingDelta}%, 0%, 0)` },
          { transform: `translate3d(${-rookDelta}%, 0%, 0)` },
        ]);
      }
    );

    it.each([
      ['capture', '7k/8/8/3p4/4P3/8/8/K7 w - - 0 1', 'exd5', 'd5', 'white pawn on d5'],
      ['en passant', '7k/8/8/3pP3/8/8/8/K7 w - d6 0 1', 'exd6', 'd6', 'white pawn on d6'],
      ['promotion', '7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a8=Q+', 'a8', 'white queen on a8'],
      ['underpromotion', '7k/P7/8/8/8/8/8/K7 w - - 0 1', 'a8=N', 'a8', 'white knight on a8'],
    ])('animates %s and restores its original piece on undo', (_name, fen, san, square, label) => {
      const { container, rerender } = transition(fen!, san!);
      expect(animations).toHaveLength(1);
      expect(animations[0]!.element).toHaveAttribute('aria-label', label);
      expect(animations[0]!.element.parentElement).toHaveAttribute('data-square', square);
      rerender(<ChessboardView fen={fen!} orientation="white" />);
      expect(animations).toHaveLength(2);
      expect(container.querySelectorAll('.chess-piece')).toHaveLength(
        new Chess(fen).board().flat().filter(Boolean).length
      );
    });

    it('cleans up rapid reversals without an old completion clearing the current animation', async () => {
      const { rerender, props, unmount } = transition(new Chess().fen(), 'e4');
      rerender(<ChessboardView fen={new Chess().fen()} orientation="white" />);
      rerender(<ChessboardView {...props} />);
      expect(animations).toHaveLength(3);
      await act(async () => {
        animations[0]!.finish();
        animations[1]!.finish();
      });
      const current = animations[2]!;
      expect(current.cancel).not.toHaveBeenCalled();
      expect(current.element.style.willChange).toBe('transform');
      expect(current.element.parentElement?.style.zIndex).toBe('10');
      unmount();
      expect(current.cancel).toHaveBeenCalledOnce();
      expect(current.element.style.willChange).toBe('');
    });

    it('snaps history jumps and orientation changes without replaying an unrelated move', () => {
      const chess = new Chess();
      const { rerender } = render(<ChessboardView fen={chess.fen()} orientation="white" />);
      chess.move('e4');
      chess.move('e5');
      rerender(
        <ChessboardView fen={chess.fen()} orientation="white" lastMove={{ from: 'e7', to: 'e5' }} />
      );
      rerender(
        <ChessboardView fen={chess.fen()} orientation="black" lastMove={{ from: 'e7', to: 'e5' }} />
      );
      expect(animations).toHaveLength(0);
    });

    it('skips animations when reduced motion is requested', () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      try {
        transition(new Chess().fen(), 'e4');
        expect(animations).toHaveLength(0);
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });
  });
});
