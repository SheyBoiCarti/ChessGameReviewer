import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';

test('has no serious or critical axe findings in primary workspace states', async ({ page }) => {
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=unavailable');
  await assertAccessible(page);
  await loadFixtureGames(page);
  await expect(page.getByRole('heading', { name: 'Games loaded' })).toBeVisible();
  await page.getByRole('button', { name: /select game versus opponent-two/i }).click();
  await page.getByRole('tab', { name: 'Opening tree' }).click();
  await assertAccessible(page);
  await page.getByRole('button', { name: 'Play Nf3' }).click();
  await page.getByRole('button', { name: 'Play d5' }).click();
  await page.getByRole('button', { name: 'Play d4' }).click();
  await page.getByRole('button', { name: 'Play Nf6' }).click();
  await page.getByRole('button', { name: 'View move orders' }).click();
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
