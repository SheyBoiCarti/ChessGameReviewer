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

const longGames = [
  game({
    id: 'fixture-long-game-41',
    url: 'https://www.chess.com/game/live/410000041',
    white: 'fixture-user',
    black: 'opponent-long',
    result: '1-0',
    moves:
      '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. f3 Be7 9. Qd2 O-O 10. O-O-O Nbd7 11. g4 b5 12. g5 b4 13. Ne2 Ne8 14. f4 a5 15. f5 a4 16. Nbd4 exd4 17. Nxd4 b3 18. Kb1 bxc2+ 19. Nxc2 Bb3 20. axb3 axb3 21. Na3 1-0',
    endTime: 1705500000,
  }),
];

const firstMoves = [
  'a3',
  'a4',
  'b3',
  'b4',
  'c3',
  'c4',
  'd3',
  'd4',
  'e3',
  'e4',
  'f3',
  'f4',
  'g3',
  'g4',
  'h3',
  'h4',
  'Na3',
  'Nc3',
  'Nf3',
  'Nh3',
] as const;

const overflowGames = firstMoves.map((firstMove, index) =>
  game({
    id: `fixture-overflow-game-${index + 1}`,
    url: `https://www.chess.com/game/live/4200000${String(index + 1).padStart(2, '0')}`,
    white: 'fixture-user',
    black: `overflow-opponent-${index + 1}`,
    result: '1-0',
    moves: `1. ${firstMove} a6 1-0`,
    endTime: 1705406400 + index * 60,
  })
);

export async function installWorkspaceFixtures(page: Page) {
  await installRoutes(page, games);
}

export async function installLongGameWorkspaceFixtures(page: Page) {
  await installRoutes(page, longGames);
}

export async function installOverflowWorkspaceFixtures(page: Page) {
  await installRoutes(page, overflowGames);
}

async function installRoutes(page: Page, fixtureGames: readonly ReturnType<typeof game>[]) {
  await page.route('https://api.chess.com/pub/player/fixture-user/games/archives', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ archives: [archiveUrl] }),
    })
  );
  await page.route(archiveUrl, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ games: fixtureGames }),
    })
  );
}

export async function loadFixtureGames(page: Page, maximumGames = 2) {
  await page.getByLabel('Username').fill('fixture-user');
  await page.getByRole('radio', { name: 'Custom' }).click();
  await page.getByLabel('From date').fill('2024-01-01');
  await page.getByLabel('To date').fill('2024-01-31');
  await page.getByRole('button', { name: 'Game filters' }).click();
  await page.getByLabel('Maximum games').fill(String(maximumGames));
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
