import { expect, test, type Locator, type Page } from '@playwright/test';

import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';

test.describe('workspace visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await installWorkspaceFixtures(page);
  });

  test('initial query', async ({ page }) => {
    await page.goto('/');
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('initial-query.png', screenshotOptions());
  });

  test('loaded board', async ({ page }) => {
    await page.goto('/');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /select game versus opponent-two/i }).click();
    await expect(page.getByRole('grid', { name: 'Chess board' })).toBeVisible();
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('loaded-board.png', screenshotOptions(page));
  });

  test('opening tree', async ({ page }) => {
    await page.goto('/');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /select game versus opponent-two/i }).click();
    await page.getByRole('tab', { name: 'Opening tree' }).click();
    await expect(page.getByRole('heading', { name: 'Opening candidates' })).toBeVisible();
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('opening-tree.png', screenshotOptions());
  });

  test('analyzer unavailable', async ({ page }) => {
    await page.goto('/?engine=unavailable');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /select game versus opponent-two/i }).click();
    await page.getByRole('tab', { name: 'Analysis' }).click();
    await expect(page.getByText(/Engine unavailable/i)).toBeVisible();
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('analyzer-unavailable.png', screenshotOptions());
  });

  test('mobile workspace', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: 'Close Game query and progress' }).click();
    await page.getByRole('button', { name: /select game versus opponent-two/i }).click();
    await expect(page.getByRole('grid', { name: 'Chess board' })).toBeVisible();
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('mobile-workspace.png', screenshotOptions(page));
  });
});

function screenshotOptions(page?: Page) {
  return {
    animations: 'disabled' as const,
    fullPage: true,
    ...(page ? { mask: dynamicDateCells(page) } : {}),
  };
}

function dynamicDateCells(page: Page): Locator[] {
  return [page.locator('.game-table tbody td:nth-child(5)')];
}

async function waitForStableLayout(page: Page) {
  await page.waitForFunction(() => document.documentElement.dataset.theme !== undefined);
  await page.locator('html').evaluate((root) => root.setAttribute('data-theme', 'dark'));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}
