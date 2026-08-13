import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';

test('has no serious or critical axe findings after the initial query and loaded-games states', async ({
  page,
}) => {
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=unavailable');
  await waitForWorkspaceReady(page);
  await assertAccessible(page);
  await loadFixtureGames(page);
  await expect(
    page.getByRole('button', { name: /select game versus opponent-two/i })
  ).toBeVisible();
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
  await page.getByRole('button', { name: /select game versus opponent-two/i }).click();
  await page.getByRole('tab', { name: 'Opening tree' }).click();
  await assertAccessible(page);

  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.getByText(/Engine unavailable/i)).toBeVisible();
  await assertAccessible(page);

  await page.getByRole('tab', { name: 'Opening tree' }).click();
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
  await expect(page.getByRole('dialog', { name: 'Game query and progress' })).toBeVisible();
  await assertAccessible(page);

  await page.getByRole('button', { name: 'Close Game query and progress' }).click();
  await page.getByRole('button', { name: 'About local data and affiliation' }).click();
  await expect(page.getByRole('dialog', { name: 'About this app' })).toBeVisible();
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

async function assertAccessible(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.filter(({ impact }) => impact === 'serious' || impact === 'critical')
  ).toEqual([]);
}

async function closeUtilityDrawer(page: import('@playwright/test').Page) {
  const usesDrawer = await page.evaluate(() => window.matchMedia('(max-width: 80rem)').matches);
  if (!usesDrawer) return;
  const drawer = page.getByRole('dialog', { name: 'Game query and progress' });
  await expect(drawer).toBeVisible();
  await page.getByRole('button', { name: 'Close Game query and progress' }).click();
  await expect(drawer).toBeHidden();
}

async function waitForWorkspaceReady(page: import('@playwright/test').Page) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
}
