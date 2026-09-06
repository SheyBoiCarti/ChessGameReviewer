import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';

test.describe.configure({ timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('has no serious or critical axe findings after the initial query and loaded-games states', async ({
  page,
}) => {
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=unavailable');
  await waitForWorkspaceReady(page);
  await assertAccessible(page);
  await loadFixtureGames(page);
  await expect(page.getByRole('button', { name: /opponent-two/i })).toBeVisible();
  await assertAccessible(page);
});

test('has no serious or critical axe findings in opening-tree, analysis-unavailable, and move-order states', async ({
  page,
}) => {
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=unavailable');
  await waitForWorkspaceReady(page);
  await loadFixtureGames(page);
  await closeUtilityDrawer(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();
  await page.getByRole('button', { name: 'Openings' }).click();
  await assertAccessible(page);

  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.getByText(/Engine unavailable/i)).toBeVisible();
  await assertAccessible(page);

  await page.getByRole('button', { name: 'Openings' }).click();
  await page.getByRole('button', { name: 'Play Nf3' }).click();
  await page.getByRole('button', { name: 'Play d5' }).click();
  await page.getByRole('button', { name: 'Play d4' }).click();
  await page.getByRole('button', { name: 'Play Nf6' }).click();
  await page.getByRole('button', { name: 'View move orders' }).click();
  await assertAccessible(page);
});

test('has no serious or critical axe findings in the utility drawer and product-information dialog', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await installWorkspaceFixtures(page);
  await page.goto('/');
  await waitForWorkspaceReady(page);
  await page.getByRole('button', { name: 'Import games' }).click();
  await waitForModalReady(page, 'Import games', 'Close import games');
  await assertAccessible(page);

  await page.getByRole('button', { name: 'Close import games' }).click();
  await page.getByRole('button', { name: /open menu/i }).click();
  await page.getByRole('button', { name: 'About' }).click();
  await waitForModalReady(page, 'About this app', 'Close product information');
  await assertAccessible(page);
});

test('has no serious or critical axe findings for an archive-load error fixture', async ({
  page,
}) => {
  await installWorkspaceFixtures(page);
  await page.route('https://api.chess.com/pub/player/fixture-user/games/archives', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Fixture archive list unavailable' }),
    })
  );
  await page.goto('/');
  await waitForWorkspaceReady(page);
  await loadFixtureGames(page);
  await expect(page.getByRole('heading', { name: 'Games could not be loaded' })).toBeVisible();
  await assertAccessible(page);
});

test('has no serious or critical axe findings with completed analysis and bounded move list', async ({
  page,
}) => {
  await installWorkspaceFixtures(page);
  await page.goto('/');
  await waitForWorkspaceReady(page);
  await loadFixtureGames(page);
  await closeUtilityDrawer(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.getByRole('button', { name: 'Start analysis' })).toBeEnabled({
    timeout: 30_000,
  });
  await page.locator('.analysis-settings-disclosure > summary').click();
  await page.getByLabel('Analysis strength').selectOption('quick');
  await page.getByRole('button', { name: 'Start analysis' }).click();
  await expect(page.getByText('Analysis status: Complete', { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('.analysis-move-list')).toBeVisible();
  await expect(page.locator('.annotation-panel-empty')).toBeVisible();
  await page.getByRole('button', { name: /select ply 1\b/i }).click();
  await expect(page.locator('.annotation-panel')).toHaveCount(1);
  await assertAccessible(page);
});

async function assertAccessible(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
  ).toEqual([]);
}

async function closeUtilityDrawer(page: import('@playwright/test').Page) {
  const drawer = page.getByRole('dialog', { name: 'Import games' });
  if (await drawer.isVisible()) {
    await page.getByRole('button', { name: 'Close import games' }).click();
    await expect(drawer).toBeHidden();
  }
}

async function waitForWorkspaceReady(page: import('@playwright/test').Page) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
}

async function waitForModalReady(
  page: import('@playwright/test').Page,
  name: string,
  closeButtonName: string
) {
  await expect(page.getByRole('dialog', { name })).toBeVisible();
  await expect(page.getByRole('button', { name: closeButtonName })).toBeFocused();
  await expect.poll(() => page.locator('[inert]').count()).toBeGreaterThan(0);
}
