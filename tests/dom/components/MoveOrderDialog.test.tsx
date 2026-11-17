import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { MoveOrderDialog } from '@/components/tree/MoveOrderDialog';
import { openingGraphFixture, fixtureKeyAfter } from '@/tests/helpers/openingGraphFixture';

describe('MoveOrderDialog', () => {
  it('shows independent transposition arrivals and restores trigger focus on Escape', async () => {
    const user = userEvent.setup();
    const graph = openingGraphFixture();
    const node = graph.positions.get(fixtureKeyAfter('Nf3', 'd5', 'd4', 'Nf6'))!;
    const onClose = vi.fn();
    const returnFocusRef = createRef<HTMLButtonElement>();
    render(
      <>
        <button ref={returnFocusRef}>Move orders</button>
        <MoveOrderDialog
          node={node}
          paths={graph.paths}
          perspective="user"
          returnFocusRef={returnFocusRef}
          onClose={onClose}
        />
      </>
    );

    expect(screen.getByRole('dialog', { name: /move orders/i })).toHaveFocus();
    expect(returnFocusRef.current).toHaveAttribute('inert');
    expect(screen.getByText('Nf3 d5 d4 Nf6')).toBeInTheDocument();
    expect(screen.getByText('d4 d5 Nf3 Nf6')).toBeInTheDocument();
    expect(screen.getAllByText(/1 game/).length).toBeGreaterThan(0);
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(returnFocusRef.current).toHaveFocus();
  });
});
