import { expect, test } from '@playwright/test';
import { installPaginatedWorkspaceFixtures } from './helpers/workspaceFixtures';
import { installEngineFixtures } from './helpers/engineFixtures';

import {
  installWorkspaceFixtures,
  installLongGameWorkspaceFixtures,
  loadFixtureGames,
} from './helpers/workspaceFixtures';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installWorkspaceFixtures(page);
});

test('queries, navigates a real transposition, analyses, and deletes local data', async ({
  page,
  browserName,
}) => {
  test.setTimeout(90_000);
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await expect(page.getByRole('button', { name: /^Preview .*opponent-two/i })).toBeVisible();
  await expect(page.locator('#game-query-rail')).toHaveCount(0);

  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  const board = page.getByRole('grid', { name: 'Chess board' });
  await expect(board).toBeVisible();
  const boardHandle = await board.elementHandle();
  await board.press('ArrowRight');
  await expect(page.getByLabel('Position 1 of 8')).toBeVisible();

  await page.getByRole('button', { name: 'Openings' }).click();
  await expect(board).toBeVisible();
  expect(await boardHandle?.evaluate((grid) => grid.isConnected)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Openings', level: 3 })).toBeVisible();
  await page.getByRole('button', { name: 'Play Nf3' }).click();
  await page.getByRole('button', { name: 'Play d5' }).click();
  await page.getByRole('button', { name: 'Play d4' }).click();
  await page.getByRole('button', { name: 'Play Nf6' }).click();
  await expect(page.getByRole('button', { name: 'View move orders' })).toBeEnabled();
  await page.getByRole('button', { name: 'View move orders' }).click();
  await expect(page.getByRole('dialog', { name: /move orders/i })).toContainText('Nf3 d5 d4 Nf6');
  await expect(page.getByRole('dialog', { name: /move orders/i })).toContainText('d4 Nf6 Nf3 d5');
  await page.keyboard.press('Escape');

  if (browserName === 'chromium') {
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('tab', { name: 'Analysis' }).click();
    await expect(board).toBeVisible();
    expect(await boardHandle?.evaluate((grid) => grid.isConnected)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Local Stockfish analysis' })).toBeVisible();
    await page.locator('.analysis-settings-disclosure > summary').click();
    await page.getByText('Engine details', { exact: true }).click();
    await expect(page.getByText('single-thread', { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Run review (Start analysis)' }).click();
    await expect(page.getByRole('button', { name: 'Cancel analysis' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel analysis' }).click();
    await expect(page.getByRole('button', { name: 'Resume analysis' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume analysis' }).click();
    await expect(
      page.getByText(/Review complete|Game Review Summary|Coverage: [1-8] of 8 eligible plies/)
    ).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('tab', { name: 'Review' }).click();
    await page.locator('.review-summary > summary').click();
    await expect(page.getByRole('heading', { name: 'Game Review Summary' })).toBeVisible();
    await expect(page.getByRole('meter', { name: /white-perspective evaluation/i })).toBeVisible();
  }

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /delete fixture-user data/i }).click();
  await page.getByRole('button', { name: 'Delete local data' }).click();
  await expect(page.getByRole('status')).toContainText(/Deleted 2 games/i);
  await expect(page.getByText('No stored usernames were found.')).toBeVisible();
});

test('retains the list filter and selection across review navigation (T26)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-one/i }).click();
  const filter = page.getByLabel('Filter games');
  await filter.fill('opponent-two');
  await expect(page.getByRole('heading', { level: 3, name: /games \(1 of 2\)/i })).toBeVisible();
  // Typing a filter must not silently replace the selected game.
  await expect(page.getByText('Selected game is outside this filter.')).toBeVisible();

  await page.getByRole('button', { name: 'Review game' }).click();
  await expect(page.getByRole('button', { name: 'Back to games' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to games' }).click();

  // Returning from Review retains the filter, and the original selection is stable.
  await expect(filter).toHaveValue('opponent-two');
  await expect(page.getByRole('heading', { level: 3, name: /games \(1 of 2\)/i })).toBeVisible();
  await expect(page.getByText('Selected game is outside this filter.')).toBeVisible();

  // Typing another opponent leaves the original selection stable until a card action.
  await filter.fill('opponent-one');
  await expect(page.getByRole('heading', { level: 3, name: /games \(1 of 2\)/i })).toBeVisible();
  await expect(page.getByText('Selected game is outside this filter.')).toHaveCount(0);
});

test('supports interactive board moves, variation sandbox, and unobserved opening notices', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();

  // Switch to Opening Tree tab and play an unobserved novelty directly on board
  await page.getByRole('button', { name: 'Openings' }).click();
  const board = page.getByRole('grid', { name: 'Chess board' });
  await expect(board).toBeVisible();

  // Click h2 then h4 (an unobserved move in fixture games)
  await page.locator('[data-square="h2"]').click();
  await page.locator('[data-square="h4"]').click();

  // Unobserved move notice appears
  await expect(page.locator('.unobserved-move-notice')).toContainText(
    /the move h4 was not played in any imported games/i
  );

  // Click Return to observed opening tree
  await page.getByRole('button', { name: /return to observed opening tree/i }).click();
  await expect(page.locator('.unobserved-move-notice')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Openings', level: 3 })).toBeVisible();

  // Switch to Analysis tab and play alternative moves to enter sandbox
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await page.locator('[data-square="e2"]').click();
  await page.locator('[data-square="e4"]').click();

  // Variation Sandbox Banner should appear
  await expect(page.locator('.variation-sandbox-banner')).toBeVisible();
  await expect(page.getByRole('button', { name: /return to main game/i })).toBeVisible();

  // Return to main game
  await page.getByRole('button', { name: /return to main game/i }).click();
  await expect(page.locator('.variation-sandbox-banner')).toHaveCount(0);
});

test('keeps opening data usable when Stockfish is unavailable', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await expect(page.locator('#game-query-rail')).toHaveCount(0);
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.getByText(/Analysis is unavailable on this device/i)).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole('button', { name: 'Openings' }).click();
  await expect(page.getByRole('heading', { name: 'Openings', level: 3 })).toBeVisible();
});

test('explores alternatives and replies from Review and restores the selected original move', async ({
  page,
}) => {
  await installEngineFixtures(page, { manualReady: false, manualEvaluations: false });
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: /Run review/ }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  const feedback = page.getByRole('region', { name: 'Selected move feedback' });
  await feedback.locator('summary').click();
  const board = page.getByRole('grid', { name: 'Chess board' });
  const original = await board
    .locator('[data-square] img[aria-label]')
    .evaluateAll((pieces) => pieces.map((piece) => piece.getAttribute('aria-label')));
  expect(original).toHaveLength(32);
  await feedback.getByRole('button', { name: 'Explore alternative' }).click();
  await expect(page.getByRole('tab', { name: 'Analysis', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  const banner = page.getByRole('complementary', { name: 'Analysis variation sandbox' });
  await expect(banner.getByRole('button', { name: 'a3', exact: true })).toHaveAttribute(
    'aria-current',
    'step'
  );
  await expect(board.getByLabel('white pawn on a3', { exact: true })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Next variation move' })).toBeEnabled();
  await banner.getByRole('button', { name: 'Next variation move' }).click();
  await banner.getByRole('button', { name: 'Previous variation move' }).click();
  await page.locator('[data-square="a7"]').click();
  await page.locator('[data-square="a5"]').click();
  await expect(banner.getByRole('button', { name: 'a5', exact: true })).toHaveAttribute(
    'aria-current',
    'step'
  );
  await banner.getByRole('button', { name: /Return to game/ }).click();
  await expect(page.getByLabel('Position 1 of 8')).toBeVisible();
  expect(
    await board
      .locator('[data-square] img[aria-label]')
      .evaluateAll((pieces) => pieces.map((piece) => piece.getAttribute('aria-label')))
  ).toEqual(original);
  await expect(page.getByRole('tab', { name: 'Review', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await feedback.locator('summary').click();
  await feedback.getByRole('button', { name: 'Explore reply' }).click();
  await banner.getByRole('button', { name: 'Start', exact: true }).click();
  expect(
    await board
      .locator('[data-square] img[aria-label]')
      .evaluateAll((pieces) => pieces.map((piece) => piece.getAttribute('aria-label')))
  ).toEqual(original);
  await banner.getByRole('button', { name: /Return to game/ }).click();
  await expect(page.getByLabel('Position 1 of 8')).toBeVisible();
});

test('updates factual capture explanations with the selected original board', async ({ page }) => {
  test.setTimeout(60_000);
  await installLongGameWorkspaceFixtures(page);
  await installEngineFixtures(page, { manualReady: false, manualEvaluations: false });
  await page.goto('/?engine=single');
  await loadFixtureGames(page, 1);
  await page.getByRole('button', { name: /^Preview .*opponent-long/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: /Run review/ }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /select ply 6\b/i }).click();
  const feedback = page.getByRole('region', { name: 'Selected move feedback' });
  await feedback.locator('summary').click();
  await expect(feedback).toContainText('This move captures a pawn.');
  await expect(page.getByLabel('black pawn on d4', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /select ply 7\b/i }).click();
  await expect(feedback).toContainText('This move captures a pawn.');
  await expect(page.getByLabel('white knight on d4', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /select ply 8\b/i }).click();
  await expect(feedback).not.toContainText('This move captures');
  await expect(page.getByLabel('black knight on f6', { exact: true })).toBeVisible();
});

test('retains views and the selected game across Back and Forward (T28)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-one/i }).click();
  // Selecting a game encodes view/mode/game/ply and preserves engine test params.
  await expect(page).toHaveURL(
    /engine=unavailable&view=games&mode=review&game=fixture-game-1&ply=0/
  );
  await page.getByRole('button', { name: 'Review game' }).click();
  await expect(page).toHaveURL(/view=analysis&mode=review&game=fixture-game-1&ply=0/);
  await page.getByRole('button', { name: 'Openings' }).click();
  await expect(page).toHaveURL(/view=opening&mode=review&game=fixture-game-1&ply=0/);

  await page.goBack();
  await expect(page).toHaveURL(/view=analysis&mode=review&game=fixture-game-1/);
  await expect(page.getByRole('button', { name: 'Back to games' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/view=games&mode=review&game=fixture-game-1/);
  await expect(page.getByRole('button', { name: 'Review game' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/view=analysis&mode=review&game=fixture-game-1/);
});

test('restores locally available content from a direct URL (T28)', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await expect(page.getByRole('button', { name: /^Preview .*opponent-one/i })).toBeVisible();
  await page.goto('/?engine=unavailable&view=analysis&mode=review&game=fixture-game-1&ply=2');
  const board = page.getByRole('grid', { name: 'Chess board' });
  await expect(board).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Position 2 of 8')).toBeVisible();
  // The restored state stays encoded in the address bar.
  await expect(page).toHaveURL(/view=analysis&mode=review&game=fixture-game-1&ply=2/);
});

test('does not create a Back step per position advance (T28)', async ({ page }) => {
  test.setTimeout(60_000);
  await installLongGameWorkspaceFixtures(page);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page, 1);
  await page.getByRole('button', { name: /^Preview .*opponent-long/i }).click();
  const board = page.getByRole('grid', { name: 'Chess board' });
  await expect(board).toBeVisible();
  const before = await page.evaluate(() => window.history.length);
  for (let index = 0; index < 30; index += 1) {
    await board.press('ArrowRight');
  }
  await expect(page.getByLabel('Position 30 of 41')).toBeVisible();
  const after = await page.evaluate(() => window.history.length);
  expect(after).toBe(before);
});

test('recovers from invalid urls and absent games without external fetches (T28)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/?engine=unavailable&view=nope&ply=abc');
  // An invalid URL intent falls back to the default workspace without crashing.
  await expect(page.getByLabel('Username')).toBeVisible();

  // An absent game id cannot select a record the dataset does not have; the
  // workspace prompts for import/selection instead.
  await page.goto('/?engine=unavailable&view=analysis&game=absent-game&ply=3');
  await expect(page.getByText(/This game is not available locally/)).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Chess board' })).toHaveCount(0);
  // Manual import and selection still work from the recovery state.
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-one/i }).click();
  await expect(page).toHaveURL(/game=fixture-game-1&ply=0/);
});

test('keeps missing URL games separate from an existing selected game (T28)', async ({ page }) => {
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await expect(page.getByRole('button', { name: /^Preview .*opponent-one/i })).toBeVisible();
  let archiveRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('api.chess.com')) archiveRequests++;
  });
  await page.clock.install({ time: new Date('2028-01-01T00:00:00Z') });
  await page.goto('/?engine=unavailable&view=analysis&game=missing&ply=99');
  await expect(page.getByText(/This game is not available locally/)).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Chess board' })).toHaveCount(0);
  expect(archiveRequests).toBe(0);
  await page.getByRole('button', { name: 'Choose a game', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Games', exact: true })).toBeVisible();
});

test('paginates 500 games and retains page and viewport through review (T29)', async ({ page }) => {
  test.setTimeout(60_000);
  await installPaginatedWorkspaceFixtures(page);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page, 500);
  await expect(page.getByRole('heading', { name: 'Games (500)', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('list', { name: 'Games' }).locator(':scope > li')).toHaveCount(20);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThan(2000);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.getByText('Page 2 of 25')).toBeVisible();
  const viewport = page.getByRole('region', { name: 'Game results' });
  await viewport.evaluate((el) => {
    el.scrollTop = 250;
    el.dispatchEvent(new Event('scroll'));
  });
  const scroll = await viewport.evaluate((el) => el.scrollTop);
  // Reviewing the selected preview leaves the scrolled list viewport untouched.
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to games' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to games' }).click();
  await expect(page.getByText('Page 2 of 25')).toBeVisible();
  await expect.poll(() => viewport.evaluate((el) => el.scrollTop)).toBe(scroll);
  await page.getByLabel('Filter games').fill('opponent-one');
  await expect(page.getByText('Page 1 of 13')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Games (250 of 500)' })).toBeVisible();
});

test('clears local filters and recovers a failed replacement with the requested username (T31)', async ({
  page,
}) => {
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await expect(page.getByRole('list', { name: 'Games' })).toBeVisible();
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().includes('api.chess.com')) requests++;
  });
  await page.getByLabel('Filter games').fill('no-such-opponent');
  await page.getByRole('button', { name: 'Clear filter', exact: true }).click();
  await expect(page.getByLabel('Filter games')).toHaveValue('');
  expect(requests).toBe(0);
  await page.route('https://api.chess.com/pub/player/missing-player/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  );
  await page.getByRole('button', { name: 'Import games', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('missing-player');
  await page.getByRole('button', { name: 'Find games', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import games' });
  await expect(dialog.getByText(/could not be found/)).toBeVisible();
  await expect(dialog.getByText(/2 previously loaded games for fixture-user/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit username', exact: true }).click();
  await expect(dialog.getByLabel('Username', { exact: true })).toBeFocused();
  await expect(dialog.getByLabel('Username', { exact: true })).toHaveValue('missing-player');
  await page.getByRole('button', { name: /^Close import games$/i }).click();
  await expect(page.getByRole('list', { name: 'Games' })).toBeVisible();
});

test('widens an empty date search only after a recovery action (T31)', async ({ page }) => {
  await page.goto('/?engine=unavailable');
  await page.getByLabel('Username', { exact: true }).fill('fixture-user');
  await page.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No games found', exact: true })).toBeVisible();
  await expect(page.getByText('Complete data', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Try all available dates', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import games' });
  await expect(dialog.getByRole('radio', { name: 'All available', exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Games' })).toBeVisible();
});

test('reopens each game at its own position and starts over explicitly (T27)', async ({ page }) => {
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-one/ }).click();
  const board = page.getByRole('grid', { name: 'Chess board' });
  await board.press('ArrowRight');
  await board.press('ArrowRight');
  await page.getByRole('button', { name: /^Preview .*opponent-two/ }).click();
  await expect(page.getByLabel('Position 0 of 8')).toBeVisible();
  await board.press('ArrowRight');
  await page.getByRole('button', { name: /^Review .*opponent-one/ }).click();
  await expect(page.getByLabel('Position 2 of 8')).toBeVisible();
  await page.locator('.analysis-settings-disclosure > summary').click();
  await page.getByRole('button', { name: 'Start over', exact: true }).click();
  await expect(page.getByLabel('Position 0 of 8')).toBeVisible();
});
