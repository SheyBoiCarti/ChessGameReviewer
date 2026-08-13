import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const { validateGameQueryMock, originalValidateGameQuery } = vi.hoisted(() => ({
  validateGameQueryMock: vi.fn(),
  originalValidateGameQuery: {
    current: null as typeof import('@/lib/validation/gameQuery').validateGameQuery | null,
  },
}));

vi.mock('@/lib/validation/gameQuery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/validation/gameQuery')>();
  originalValidateGameQuery.current = actual.validateGameQuery;
  return { ...actual, validateGameQuery: validateGameQueryMock };
});

import { GameQueryForm } from '@/components/controls/GameQueryForm';
validateGameQueryMock.mockImplementation((input) => originalValidateGameQuery.current?.(input));

describe('GameQueryForm', () => {
  it('discloses compact game filters while retaining native checked chip inputs', async () => {
    const user = userEvent.setup();
    render(<GameQueryForm onSubmit={vi.fn()} />);

    const filters = screen.getByRole('button', { name: /game filters/i });
    expect(filters).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/all time classes.*both colours.*rated and unrated/i)).toBeVisible();

    await user.click(filters);

    expect(filters).toHaveAttribute('aria-expanded', 'true');
    const rapid = screen.getByRole('checkbox', { name: 'Rapid' });
    expect(rapid).toBeChecked();
    expect(rapid.closest('label')).toContainElement(rapid);
    expect(screen.getByRole('checkbox', { name: 'White games' })).toBeChecked();
  });

  it('submits every GameQuery property after trimming and normalization', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GameQueryForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/username/i), '  Hikaru  ');
    await user.type(screen.getByLabelText(/from date/i), '2026-01-01');
    await user.type(screen.getByLabelText(/to date/i), '2026-07-31');
    await user.click(screen.getByRole('button', { name: /game filters/i }));
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

  it('preserves validation ids and their associations inside disclosed filters', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GameQueryForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: /game filters/i }));
    for (const name of ['bullet', 'blitz', 'rapid', 'daily']) {
      await user.click(screen.getByRole('checkbox', { name: new RegExp(name, 'i') }));
    }
    for (const name of ['white games', 'black games']) {
      await user.click(screen.getByRole('checkbox', { name: new RegExp(name, 'i') }));
    }
    await user.click(screen.getByRole('button', { name: /load games/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/username must be 3-25 characters/i)).toHaveAttribute(
      'id',
      'username-error'
    );
    expect(screen.getByLabelText(/username/i)).toHaveAttribute(
      'aria-describedby',
      'username-error'
    );
    expect(screen.getByText(/select at least one time class/i)).toHaveAttribute(
      'id',
      'time-classes-error'
    );
    expect(screen.getByRole('group', { name: /time classes/i })).toHaveAttribute(
      'aria-describedby',
      'time-classes-error'
    );
    expect(screen.getByText(/select at least one player colour/i)).toHaveAttribute(
      'id',
      'colors-error'
    );
    expect(screen.getByRole('group', { name: /player colour/i })).toHaveAttribute(
      'aria-describedby',
      'colors-error'
    );
  });

  it('opens invalid advanced filters so their validation errors are visible', async () => {
    const user = userEvent.setup();
    render(<GameQueryForm onSubmit={vi.fn()} />);

    const filters = screen.getByRole('button', { name: /game filters/i });
    await user.click(filters);
    for (const name of ['bullet', 'blitz', 'rapid', 'daily', 'white games', 'black games']) {
      await user.click(screen.getByRole('checkbox', { name: new RegExp(name, 'i') }));
    }
    await user.click(filters);
    await user.click(screen.getByRole('button', { name: /load games/i }));

    expect(filters).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/select at least one time class/i)).toBeVisible();
    expect(screen.getByText(/select at least one player colour/i)).toBeVisible();
  });

  it('associates an invalid maximum-games diagnostic with its number field', async () => {
    const user = userEvent.setup();
    render(<GameQueryForm onSubmit={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /game filters/i }));
    await user.clear(screen.getByLabelText(/maximum games/i));
    await user.type(screen.getByLabelText(/maximum games/i), '5001');
    await user.click(screen.getByRole('button', { name: /load games/i }));

    expect(screen.getByText(/maxGames must be an integer between 1 and 5000/i)).toBeVisible();
    expect(screen.getByLabelText(/maximum games/i)).toHaveAttribute(
      'aria-describedby',
      'maximum-games-error'
    );
    expect(screen.getByText(/maxGames must be an integer between 1 and 5000/i)).toHaveAttribute(
      'id',
      'maximum-games-error'
    );
  });

  it('associates an invalid rated-status diagnostic with its select field', async () => {
    const user = userEvent.setup();
    validateGameQueryMock.mockReturnValue({
      success: false,
      diagnostics: [
        {
          code: 'INVALID_RATED_STATUS',
          message: 'rated must be a boolean when specified',
          severity: 'error',
        },
      ],
    });
    render(<GameQueryForm onSubmit={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /game filters/i }));
    await user.click(screen.getByRole('button', { name: /load games/i }));

    expect(screen.getByText(/rated must be a boolean when specified/i)).toBeVisible();
    expect(screen.getByLabelText(/rated status/i)).toHaveAttribute(
      'aria-describedby',
      'rated-status-error'
    );
    expect(screen.getByText(/rated must be a boolean when specified/i)).toHaveAttribute(
      'id',
      'rated-status-error'
    );
    validateGameQueryMock.mockImplementation((input) => originalValidateGameQuery.current?.(input));
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

    await user.click(screen.getByRole('button', { name: /game filters/i }));
    const horizon = screen.getByLabelText(/opening horizon/i);
    expect(horizon).toHaveAttribute('min', '2');
    expect(horizon).toHaveAttribute('max', '40');
    await user.clear(horizon);
    await user.type(horizon, '40');
    await user.tab();

    expect(onOpeningHorizonChange).toHaveBeenLastCalledWith(40);
  });
});
