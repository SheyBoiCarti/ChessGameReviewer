import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GameQueryForm } from '@/components/controls/GameQueryForm';

describe('GameQueryForm', () => {
  it('submits every GameQuery property after trimming and normalization', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GameQueryForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/username/i), '  Hikaru  ');
    await user.type(screen.getByLabelText(/from date/i), '2026-01-01');
    await user.type(screen.getByLabelText(/to date/i), '2026-07-31');
    await user.clear(screen.getByLabelText(/maximum games/i));
    await user.type(screen.getByLabelText(/maximum games/i), '1200');
    await user.click(screen.getByRole('checkbox', { name: /bullet/i }));
    await user.click(screen.getByRole('checkbox', { name: /blitz/i }));
    await user.click(screen.getByRole('checkbox', { name: /daily/i }));
    await user.click(screen.getByRole('checkbox', { name: /black games/i }));
    await user.selectOptions(screen.getByLabelText(/rated status/i), 'rated');
    await user.click(screen.getByRole('button', { name: /load games/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      username: 'hikaru',
      dateFrom: '2026-01-01',
      dateTo: '2026-07-31',
      maxGames: 1200,
      timeClasses: ['rapid'],
      colors: ['white'],
      rated: true,
    });
  });

  it('prevents empty time-class sets and associates the error with the controls', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GameQueryForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/username/i), 'valid-user');
    for (const name of ['bullet', 'blitz', 'rapid', 'daily']) {
      await user.click(screen.getByRole('checkbox', { name: new RegExp(name, 'i') }));
    }
    await user.click(screen.getByRole('button', { name: /load games/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/select at least one time class/i)).toHaveAttribute(
      'id',
      'time-classes-error'
    );
    expect(screen.getByRole('group', { name: /time classes/i })).toHaveAttribute(
      'aria-describedby',
      'time-classes-error'
    );
  });

  it('exposes the 2 to 40 ply opening horizon independently of the query', async () => {
    const user = userEvent.setup();
    const onOpeningHorizonChange = vi.fn();
    render(
      <GameQueryForm
        onSubmit={vi.fn()}
        openingHorizon={30}
        onOpeningHorizonChange={onOpeningHorizonChange}
      />
    );

    const horizon = screen.getByLabelText(/opening horizon/i);
    expect(horizon).toHaveAttribute('min', '2');
    expect(horizon).toHaveAttribute('max', '40');
    await user.clear(horizon);
    await user.type(horizon, '40');
    await user.tab();

    expect(onOpeningHorizonChange).toHaveBeenLastCalledWith(40);
  });
});
