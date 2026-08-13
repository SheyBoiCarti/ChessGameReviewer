import type { Page } from '@playwright/test';

const archiveUrl = 'https://api.chess.com/pub/player/fixture-user/games/2024/01';

const games = [
  game({
    id: 'fixture-game-1',
    url: 'https://www.chess.com/game/live/410000001',
    white: 'fixture-user',
    black: 'opponent-one',
    result: '1-0',
    moves: '1. Nf3 d5 2. d4 Nf6 3. e3 e6 4. Bd3 Bd6 1-0',
    endTime: 1705320000,
  }),
  game({
    id: 'fixture-game-2',
    url: 'https://www.chess.com/game/live/410000002',
    white: 'opponent-two',
    black: 'fixture-user',
    result: '0-1',
    moves: '1. d4 Nf6 2. Nf3 d5 3. e3 e6 4. Bd3 Bd6 0-1',
    endTime: 1705406400,
  }),
];

export async function installWorkspaceFixtures(page: Page) {
  await page.route('https://api.chess.com/pub/player/fixture-user/games/archives', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ archives: [archiveUrl] }),
    })
  );
  await page.route(archiveUrl, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ games }) })
  );
}

export async function loadFixtureGames(page: Page) {
  await page.getByLabel('Username').fill('fixture-user');
  await page.getByLabel('From date').fill('2024-01-01');
  await page.getByLabel('To date').fill('2024-01-31');
  await page.getByLabel('Maximum games').fill('2');
  await page.getByLabel('Opening horizon (plies)').fill('8');
  await page.getByLabel('Rated status').selectOption('rated');
  await page.getByRole('button', { name: 'Load games' }).click();
}

function game(input: {
  id: string;
  url: string;
  white: string;
  black: string;
  result: '1-0' | '0-1';
  moves: string;
  endTime: number;
}) {
  const whiteWon = input.result === '1-0';
  return {
    url: input.url,
    uuid: input.id,
    pgn: `[Event "Fixture Game"]\n[Site "Chess.com"]\n[Date "2024.01.15"]\n[White "${input.white}"]\n[Black "${input.black}"]\n[Result "${input.result}"]\n\n${input.moves}`,
    time_control: '180+0',
    end_time: input.endTime,
    rated: true,
    time_class: 'blitz',
    rules: 'chess',
    white: { username: input.white, rating: 1800, result: whiteWon ? 'win' : 'resigned' },
    black: { username: input.black, rating: 1750, result: whiteWon ? 'resigned' : 'win' },
  };
}
