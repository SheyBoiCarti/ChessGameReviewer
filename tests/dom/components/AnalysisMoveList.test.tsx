import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AnalysisMoveList } from '@/components/analysis/AnalysisMoveList';
import { createLongGameAnalysisResult } from '../../fixtures/longAnalysisFixture';

describe('AnalysisMoveList', () => {
  const fixture = createLongGameAnalysisResult(41);

  it('renders all compact move rows with move numbers, SAN, and evaluation labels', () => {
    render(
      <AnalysisMoveList
        annotations={fixture.annotations}
        selectedPly={1}
        onSelectPly={vi.fn()}
      />
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
      <AnalysisMoveList
        annotations={fixture.annotations}
        selectedPly={3}
        onSelectPly={vi.fn()}
      />
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
      <AnalysisMoveList
        annotations={fixture.annotations}
        selectedPly={0}
        onSelectPly={vi.fn()}
      />
    );

    const activeRows = screen.queryAllByRole('button', { current: true });
    expect(activeRows).toHaveLength(0);
  });
});
