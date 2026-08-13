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
});
