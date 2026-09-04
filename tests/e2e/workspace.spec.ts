import { expect, test } from '@playwright/test';

import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';

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
  await expect(page.getByRole('button', { name: /opponent-two/i })).toBeVisible();
  await expect(page.locator('#game-query-rail')).toHaveCount(0);

  await page.getByRole('button', { name: /opponent-two/i }).click();
  const board = page.getByRole('grid', { name: 'Chess board' });
  await expect(board).toBeVisible();
  const boardHandle = await board.elementHandle();
  await board.press('ArrowRight');
  await expect(page.getByText('Ply 1 of 8')).toBeVisible();

  await page.getByRole('tab', { name: 'Opening tree' }).click();
  await expect(board).toBeVisible();
  expect(await boardHandle?.evaluate((grid) => grid.isConnected)).toBe(true);
  await expect(page.getByRole('heading', { name: 'Opening candidates' })).toBeVisible();
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
    await page.getByRole('tab', { name: 'Analysis' }).click();
    await expect(board).toBeVisible();
    expect(await boardHandle?.evaluate((grid) => grid.isConnected)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Local Stockfish analysis' })).toBeVisible();
    await expect(page.getByText('single-thread', { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Start analysis' }).click();
    await expect(page.getByRole('button', { name: 'Cancel analysis' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel analysis' }).click();
    await expect(page.getByRole('button', { name: 'Resume analysis' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume analysis' }).click();
    await expect(
      page.getByText(/Game Review Summary|Coverage: [1-8] of 8 eligible plies/)
    ).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole('meter', { name: /white-perspective evaluation/i })).toBeVisible();
  }

  await page.getByRole('tab', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /delete fixture-user data/i }).click();
  await page.getByRole('button', { name: 'Delete local data' }).click();
  await expect(page.getByRole('status')).toContainText(/Deleted 2 games/i);
  await expect(page.getByText('No stored usernames were found.')).toBeVisible();
});

test('supports interactive board moves, variation sandbox, and unobserved opening notices', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();

  // Switch to Opening Tree tab and play an unobserved novelty directly on board
  await page.getByRole('tab', { name: 'Opening tree' }).click();
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
  await expect(page.getByRole('heading', { name: 'Opening candidates' })).toBeVisible();

  // Switch to Analysis tab and play alternative moves to enter sandbox
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
  await page.getByRole('button', { name: /opponent-two/i }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.getByText(/Engine unavailable/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Opening tree' }).click();
  await expect(page.getByRole('heading', { name: 'Opening candidates' })).toBeVisible();
});
