import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { OpeningGamesPanel } from '@/components/opening/OpeningGamesPanel';
import { makeGameRecord } from '../../helpers/phase1Fixtures';

it('mounts at most 50 source game rows on expansion', () => {
  const games = Array.from({ length: 120 }, (_, index) => makeGameRecord({ id: `game-${index}` }));
  render(
    <OpeningGamesPanel
      ids={games.map((game) => game.id)}
      gamesById={new Map(games.map((game) => [game.id, game]))}
      onSelectGame={vi.fn()}
    />
  );
  expect(screen.getAllByRole('listitem')).toHaveLength(50);
});

it('replaces page rows and opens the intended source game', async () => {
  const { default: userEvent } = await import('@testing-library/user-event');
  const user = userEvent.setup();
  const games = Array.from({ length: 120 }, (_, index) =>
    makeGameRecord({
      id: `source-${index}`,
      whitePlayer: { username: `player-${index}`, rating: null },
    })
  );
  const onSelectGame = vi.fn();
  render(
    <OpeningGamesPanel
      ids={games.map((game) => game.id)}
      gamesById={new Map(games.map((game) => [game.id, game]))}
      onSelectGame={onSelectGame}
    />
  );
  await user.click(screen.getByRole('button', { name: 'Next matching games' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(50);
  expect(screen.queryByRole('button', { name: /player-0 vs/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: /player-50 vs/ }));
  expect(onSelectGame).toHaveBeenCalledWith('source-50');
  await user.click(screen.getByRole('button', { name: 'Next matching games' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(20);
});
