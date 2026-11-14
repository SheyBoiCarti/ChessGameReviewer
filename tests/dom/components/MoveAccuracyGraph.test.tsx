import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MoveAccuracyGraph } from '@/components/analysis/MoveAccuracyGraph';
import { createLongGameAnalysisResult } from '../../fixtures/longAnalysisFixture';

describe('evaluation graph selection', () => {
  it('has one tab stop for 100 plies, arrow/Home/End focus and explicit selection', async () => {
    const result = createLongGameAnalysisResult(100);
    const onSelect = vi.fn();
    render(
      <>
        <MoveAccuracyGraph
          annotations={result.annotations}
          selectedPly={1}
          totalPlies={100}
          onSelectPly={onSelect}
        />
        <button>After graph</button>
      </>
    );
    const points = screen.getAllByRole('button', { name: /Graph evaluation/ });
    expect(points.filter((el) => el.tabIndex === 0)).toHaveLength(1);
    points[0]!.focus();
    fireEvent.keyDown(points[0]!, { key: 'ArrowRight' });
    expect(points[1]).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(points[1]!, { key: 'Enter' });
    expect(onSelect).toHaveBeenLastCalledWith(2);
    fireEvent.keyDown(points[1]!, { key: 'End' });
    expect(points[99]).toHaveFocus();
    fireEvent.keyDown(points[99]!, { key: ' ' });
    expect(onSelect).toHaveBeenLastCalledWith(100);
    fireEvent.keyDown(points[99]!, { key: 'Home' });
    expect(points[0]).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'After graph' })).toHaveFocus();
  });
  it('describes numbered SAN and White scores, follows selection and leaves missing intervals blank', () => {
    const result = createLongGameAnalysisResult(3);
    result.annotations[2]!.after.score = { kind: 'mate', value: -3 };
    const { container, rerender } = render(
      <MoveAccuracyGraph
        annotations={[result.annotations[0]!, result.annotations[2]!]}
        totalPlies={100}
        selectedPly={1}
        onSelectPly={vi.fn()}
      />
    );
    expect(container.querySelectorAll('polyline')).toHaveLength(0);
    expect(screen.getByRole('button', { name: /1\. e4.*White \+0.25/ })).toHaveAttribute(
      'aria-current',
      'step'
    );
    rerender(
      <MoveAccuracyGraph
        annotations={[result.annotations[0]!, result.annotations[2]!]}
        totalPlies={100}
        selectedPly={3}
        onSelectPly={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /2\. Nf3.*Black mate in 3/ })).toHaveAttribute(
      'aria-current',
      'step'
    );
    expect(container.querySelector('.accuracy-graph__cursor')).toHaveAttribute('x1', '3');
  });
});
