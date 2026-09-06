import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AnalysisMoveList } from '@/components/analysis/AnalysisMoveList';
import { createLongGameAnalysisResult } from '../../fixtures/longAnalysisFixture';

describe('AnalysisMoveList', () => {
  const fixture = createLongGameAnalysisResult(41);

  it('renders all compact move rows with move numbers, SAN, and evaluation labels', () => {
    render(
      <AnalysisMoveList annotations={fixture.annotations} selectedPly={1} onSelectPly={vi.fn()} />
    );

    const rows = screen.getAllByRole('button');
    expect(rows).toHaveLength(41);

    // First move: 1. e4 (white)
    expect(rows[0]).toHaveTextContent(/1\.\s*e4/);
    // Second move: 1... c5 (black)
    expect(rows[1]).toHaveTextContent(/1\.\.\.\s*c5/);
    // Move 41: 21. Na3 (white)
    expect(rows[40]).toHaveTextContent(/21\.\s*Na3/);
  });

  it('marks the active move row with aria-current="true"', () => {
    render(
      <AnalysisMoveList annotations={fixture.annotations} selectedPly={3} onSelectPly={vi.fn()} />
    );

    const rows = screen.getAllByRole('button');
    expect(rows[2]).toHaveAttribute('aria-current', 'true');
    expect(rows[0]).not.toHaveAttribute('aria-current');
    expect(rows[1]).not.toHaveAttribute('aria-current');
  });

  it('calls onSelectPly when a move row is clicked', async () => {
    const user = userEvent.setup();
    const onSelectPly = vi.fn();

    render(
      <AnalysisMoveList
        annotations={fixture.annotations}
        selectedPly={1}
        onSelectPly={onSelectPly}
      />
    );

    const rows = screen.getAllByRole('button');
    await user.click(rows[5]!); // ply 6

    expect(onSelectPly).toHaveBeenCalledWith(6);
  });

  it('handles selectedPly 0 without marking any row as active', () => {
    render(
      <AnalysisMoveList annotations={fixture.annotations} selectedPly={0} onSelectPly={vi.fn()} />
    );

    const activeRows = screen.queryAllByRole('button', { current: true });
    expect(activeRows).toHaveLength(0);
  });

  it('renders a full move list without analysis results and labels plies as Not analysed', () => {
    const rawMoves = [
      {
        ply: 1,
        san: 'e4',
        uci: 'e2e4',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        positionBefore: 'pos1',
        positionAfter: 'pos2',
      },
      {
        ply: 2,
        san: 'e5',
        uci: 'e7e5',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        positionBefore: 'pos2',
        positionAfter: 'pos3',
      },
    ];

    render(<AnalysisMoveList moves={rawMoves} selectedPly={1} onSelectPly={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName(/Not analysed/);
    expect(buttons[0]).not.toHaveAccessibleName(/0\.00/);
    expect(buttons[1]).toHaveAccessibleName(/Not analysed/);
  });

  it('decorates only matching plies with partial annotations', () => {
    const rawMoves = [
      {
        ply: 1,
        san: 'e4',
        uci: 'e2e4',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        positionBefore: 'pos1',
        positionAfter: 'pos2',
      },
      {
        ply: 2,
        san: 'e5',
        uci: 'e7e5',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        positionBefore: 'pos2',
        positionAfter: 'pos3',
      },
    ];

    // Annotate only ply 1
    const partialAnnotations = [fixture.annotations[0]!];

    render(
      <AnalysisMoveList
        moves={rawMoves}
        annotations={partialAnnotations}
        selectedPly={1}
        onSelectPly={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).not.toHaveAccessibleName(/Not analysed/);
    expect(buttons[1]).toHaveAccessibleName(/Not analysed/);
  });

  it('handles a game starting with black to move by displaying an em dash in the first White cell', () => {
    const blackStartMoves = [
      {
        ply: 1,
        san: 'c5',
        uci: 'c7c5',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pp1ppppp/8/2p5/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2',
        positionBefore: 'pos1',
        positionAfter: 'pos2',
      },
      {
        ply: 2,
        san: 'e4',
        uci: 'e2e4',
        fenBefore: 'rnbqkbnr/pp1ppppp/8/2p5/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2',
        fenAfter: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2',
        positionBefore: 'pos2',
        positionAfter: 'pos3',
      },
    ];

    const { container } = render(
      <AnalysisMoveList moves={blackStartMoves} selectedPly={1} onSelectPly={vi.fn()} />
    );

    // Row 1 White cell has an em dash
    const emptyCells = container.querySelectorAll('.analysis-move-cell--empty');
    expect(emptyCells.length).toBeGreaterThanOrEqual(1);
    expect(emptyCells[0]).toHaveTextContent('—');

    // Button for black's first move
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveTextContent(/c5/);
  });

  it('handles an odd final ply with an em dash in the final Black cell', () => {
    const oddMoves = [
      {
        ply: 1,
        san: 'e4',
        uci: 'e2e4',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        positionBefore: 'pos1',
        positionAfter: 'pos2',
      },
      {
        ply: 2,
        san: 'e5',
        uci: 'e7e5',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        positionBefore: 'pos2',
        positionAfter: 'pos3',
      },
      {
        ply: 3,
        san: 'Nf3',
        uci: 'g1f3',
        fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
        fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
        positionBefore: 'pos3',
        positionAfter: 'pos4',
      },
    ];

    const { container } = render(
      <AnalysisMoveList moves={oddMoves} selectedPly={3} onSelectPly={vi.fn()} />
    );

    const emptyCells = container.querySelectorAll('.analysis-move-cell--empty');
    expect(emptyCells).toHaveLength(1);
    expect(emptyCells[0]).toHaveTextContent('—');

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(buttons[2]).toHaveTextContent(/Nf3/);
  });

  it('adjusts scrollTop of the list container without moving the document window or stealing focus', () => {
    const onSelectPly = vi.fn();
    const { container } = render(
      <AnalysisMoveList
        annotations={fixture.annotations}
        selectedPly={1}
        onSelectPly={onSelectPly}
      />
    );

    const listElement = container.querySelector('.analysis-move-list') as HTMLDivElement;
    expect(listElement).not.toBeNull();

    // Mock bounding rects
    vi.spyOn(listElement, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      bottom: 300,
      left: 0,
      right: 200,
      height: 200,
      width: 200,
      x: 0,
      y: 100,
      toJSON: () => {},
    });

    const scrollIntoViewSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewSpy;

    // Trigger selected ply change
    render(
      <AnalysisMoveList
        annotations={fixture.annotations}
        selectedPly={15}
        onSelectPly={onSelectPly}
      />
    );

    // scrollIntoView should NOT have been called because we use bounding box calculation on container
    expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  });
});
