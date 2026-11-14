import { expect, test } from '@playwright/test';
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
  await expect(page.getByRole('button', { name: /opponent-two/i })).toBeVisible();
  await expect(page.locator('#game-query-rail')).toHaveCount(0);

  await page.getByRole('button', { name: /opponent-two/i }).click();
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

test('supports interactive board moves, variation sandbox, and unobserved opening notices', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();

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
  await page.getByRole('button', { name: /opponent-two/i }).click();
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
  await page.getByRole('button', { name: /opponent-two/i }).click();
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
  await installLongGameWorkspaceFixtures(page);
  await installEngineFixtures(page, { manualReady: false, manualEvaluations: false });
  await page.goto('/?engine=single');
  await loadFixtureGames(page, 1);
  await page.getByRole('button', { name: /opponent-long/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: /Run review/ }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
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
