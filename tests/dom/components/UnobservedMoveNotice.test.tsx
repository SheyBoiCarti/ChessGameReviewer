import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UnobservedMoveNotice } from '@/components/opening/UnobservedMoveNotice';

describe('UnobservedMoveNotice', () => {
  it('explains continued variation input and offers a return to the recorded tree', async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();

    render(<UnobservedMoveNotice san="c4" onReturn={onReturn} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      /beyond your imported opening tree after c4.*keep playing legal moves/i
    );
    const returnBtn = screen.getByRole('button', { name: /return to observed opening tree/i });
    expect(returnBtn).toBeInTheDocument();

    await user.click(returnBtn);
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
});
