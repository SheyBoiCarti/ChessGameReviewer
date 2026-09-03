import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { OpeningTreeTable } from '@/components/tree/OpeningTreeTable';
import { createGraphNavigation } from '@/features/opening-tree/navigation';
import { openingGraphFixture } from '@/tests/helpers/openingGraphFixture';

describe('OpeningTreeTable', () => {
  it('navigates candidates by target position while preserving the selected path', async () => {
    const user = userEvent.setup();
    const graph = openingGraphFixture();
    const onNavigate = vi.fn();
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={createGraphNavigation(graph)}
        perspective="user"
        onNavigate={onNavigate}
      />
    );

    const candidateResults = screen.getByRole('region', {
      name: 'Opening candidate results',
    });
    expect(candidateResults).toHaveAttribute('tabindex', '0');
    expect(candidateResults).toContainElement(screen.getByRole('table'));
    expect(candidateResults).not.toContainElement(screen.getByLabelText(/sort candidate moves/i));
    expect(screen.getByRole('columnheader', { name: /sample size/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /play e4/i }));

    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ positionKey: 'after-e4', pathId: 1 })
    );
  });

  it('keeps a persistent exact resource-limit notice with horizon help', () => {
    const graph = openingGraphFixture('limited');
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={createGraphNavigation(graph)}
        perspective="board"
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(/edge resource limit/i);
    expect(screen.getByRole('status')).toHaveTextContent(/5 included.*2 remaining/i);
    expect(screen.getByText(/maximum is 40 plies/i)).toBeInTheDocument();
  });

  it('names the serialized snapshot-size resource limit', () => {
    const graph = { ...openingGraphFixture('limited'), reachedLimit: 'maxSnapshotBytes' as const };
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={createGraphNavigation(graph)}
        perspective="board"
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'This graph reached the snapshot size resource limit'
    );
  });

  it('shows defensive graph exclusions without exposing PGN content', () => {
    const graph = openingGraphFixture();
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={createGraphNavigation(graph)}
        perspective="user"
        excludedGameCount={1}
        diagnosticCodes={['ILLEGAL_PGN']}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      '1 game was excluded while building this opening graph'
    );
    expect(screen.getByRole('status')).toHaveTextContent('ILLEGAL_PGN');
  });

  it('shows terminal messaging without an empty fixed-height candidate region', () => {
    const graph = openingGraphFixture();
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={{
          positionKey: 'transposed-target',
          pathId: 3,
          history: [{ positionKey: 'transposed-target', pathId: 3 }],
        }}
        perspective="user"
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByText(/no candidate moves are available/i)).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Opening candidate results' })
    ).not.toBeInTheDocument();
  });
});
