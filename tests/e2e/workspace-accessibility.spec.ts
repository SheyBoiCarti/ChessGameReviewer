import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { installEngineFixtures } from './helpers/engineFixtures';
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
  await expect(page.getByRole('button', { name: /^Preview .*opponent-two/i })).toBeVisible();
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
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  await page.getByRole('button', { name: 'Openings' }).click();
  await assertAccessible(page);

  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.getByText(/Analysis is unavailable on this device/i)).toBeVisible();
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
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.getByRole('button', { name: 'Run review (Start analysis)' })).toBeEnabled({
    timeout: 30_000,
  });
  await page.locator('.analysis-settings-disclosure > summary').click();
  await page.getByLabel('Analysis strength').selectOption('quick');
  await page.getByRole('button', { name: 'Run review (Start analysis)' }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('.analysis-move-list')).toBeVisible();
  await expect(page.locator('.annotation-panel-empty')).toBeVisible();
  await page.getByRole('button', { name: /select ply 1\b/i }).click();
  await expect(page.locator('.annotation-panel')).toHaveCount(1);
  await assertAccessible(page);
});

async function assertAccessible(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Hydration can change the theme just before axe reads the page's colors.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation instanceof CSSTransition)
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
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

test('keeps playback available while engine readiness is delayed', async ({ page }, testInfo) => {
  await installWorkspaceFixtures(page);
  const engine = await installEngineFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await closeUtilityDrawer(page);
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  if (testInfo.project.name === 'mobile-chromium')
    await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Checking analysis engine…')).toBeVisible();
  await expect(page.getByText(/analysis is unavailable on this device/i)).toHaveCount(0);
  await expect(page.locator('.analyzer-workspace').getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: /select ply 1\b/i }).click();
  await expect(page.getByRole('button', { name: /select ply 1\b/i })).toHaveAttribute(
    'aria-current',
    'true'
  );
  await page.screenshot({ path: testInfo.outputPath('engine-preparing.png'), fullPage: true });
  await engine.releaseReady();
  await expect(page.getByText('Ready to review')).toBeVisible();
  await page.getByRole('button', { name: 'Run review (Start analysis)', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Review progress' })).toBeVisible();
  await engine.releaseEvaluations(100);
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  await assertAccessible(page);
});

test('synchronizes graph keyboard selection, count filters and original board', async ({
  page,
}, testInfo) => {
  await installWorkspaceFixtures(page);
  await installEngineFixtures(page, { manualReady: false, manualEvaluations: false });
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await closeUtilityDrawer(page);
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: /Run review/ }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  const graph = page.getByRole('group', { name: 'Evaluation graph' });
  const points = graph.getByRole('button');
  await expect(graph.locator('[tabindex="0"]')).toHaveCount(1);
  await points.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(points.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Position 2 of 8')).toBeVisible();
  await expect(points.nth(1)).toHaveAttribute('aria-current', 'step');
  await expect(points.nth(1)).toHaveAccessibleName(/1… Nf6.*perspective/);
  await page.keyboard.press('End');
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Position 8 of 8')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(points.last()).not.toBeFocused();
  await points.first().click();
  await expect(page.getByLabel('Position 1 of 8')).toBeVisible();
  await page.locator('.review-summary > summary').click();
  await page.getByText('Move breakdown', { exact: true }).click();
  const count = page.getByRole('button', { name: /White Mistake: [1-9]/ });
  await count.click();
  await expect(page.getByLabel('Position 1 of 8')).toBeVisible();
  const feedback = page.getByRole('region', { name: 'Selected move feedback' });
  await feedback.getByRole('button', { name: 'Next moment' }).click();
  await expect(page.getByLabel('Position 3 of 8')).toBeVisible();
  await expect(page.getByRole('button', { name: /select ply 3\b/i })).toHaveAttribute(
    'aria-current',
    'true'
  );
  await expect(points.nth(2)).toHaveAttribute('aria-current', 'step');
  await page.getByRole('combobox', { name: 'Review players' }).selectOption('black');
  await feedback.getByRole('button', { name: 'Next moment' }).click();
  await expect(page.getByLabel('Position 4 of 8')).toBeVisible();
  await feedback.locator('summary').click();
  await expect(feedback).toContainText('Before:');
  await expect(feedback).toContainText('After:');
  await assertAccessible(page);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.getByRole('button', { name: 'Previous move', exact: true }).click();
    await expect(page.getByLabel('Position 3 of 8')).toBeVisible();
    await page.getByRole('button', { name: 'Next move', exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath(`move-understanding-${size.width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1);
  }
});
