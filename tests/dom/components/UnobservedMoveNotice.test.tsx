import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UnobservedMoveNotice } from '@/components/opening/UnobservedMoveNotice';

describe('UnobservedMoveNotice', () => {
  it('renders unobserved move alert and return button', async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn();

    render(<UnobservedMoveNotice san="c4" onReturn={onReturn} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      /the move c4 was not played in any imported games/i
    );
    const returnBtn = screen.getByRole('button', { name: /return to observed opening tree/i });
    expect(returnBtn).toBeInTheDocument();

    await user.click(returnBtn);
    expect(onReturn).toHaveBeenCalledTimes(1);
  });
});
