import { expect, test } from '@playwright/test';
import { installEngineFixtures } from './helpers/engineFixtures';
import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';

test('selecting a game does not force the board into view', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { boardScrolls: number }).boardScrolls = 0;
    const previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function (...args) {
      if (this.classList.contains('workspace-board'))
        (window as unknown as { boardScrolls: number }).boardScrolls++;
      return previous.apply(this, args);
    };
  });
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  expect(
    await page.evaluate(() => (window as unknown as { boardScrolls: number }).boardScrolls)
  ).toBe(0);
});

test('desktop completed feedback remains visible with the board', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await installEngineFixtures(page, { manualReady: false, manualEvaluations: false });
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: /Run review/ }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible({ timeout: 60000 });
  const feedback = await page.getByRole('region', { name: 'Selected move feedback' }).boundingBox();
  expect(feedback!.y).toBeLessThan(768);
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
]) {
  test(`review keeps the board anchored and the document within ${viewport.width}px desktop`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await installEngineFixtures(page, { manualReady: false, manualEvaluations: false });
    await installWorkspaceFixtures(page);
    await page.goto('/?engine=single');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const board = page.getByRole('grid', { name: 'Chess board' });
    const initial = await board.boundingBox();
    const expectStableLayout = async () => {
      const current = await board.boundingBox();
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(current![key] - initial![key])).toBeLessThanOrEqual(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        viewport.height + 1
      );
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    };
    await expectStableLayout();
    await page.getByRole('button', { name: /Run review/ }).click();
    await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
    await expectStableLayout();
    await page.getByRole('button', { name: 'Next move', exact: true }).click();
    await expectStableLayout();
    await page.locator('.review-feedback summary').click();
    await expectStableLayout();
    await page.locator('.review-summary > summary').click();
    await expectStableLayout();
    await page.locator('.analysis-settings-disclosure > summary').click();
    await expectStableLayout();
    const sidebar = page.locator('.workspace-layout__sidebar');
    await sidebar.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expectStableLayout();
    await sidebar.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.getByRole('button', { name: 'Explore alternative', exact: true }).click();
    await expect(
      page.getByRole('complementary', { name: 'Analysis variation sandbox' })
    ).toBeVisible();
    await expectStableLayout();
    await page.getByRole('button', { name: /^Return to game \(Return to main game\)/ }).click();
    await expectStableLayout();
    await page.getByRole('tab', { name: 'Review', exact: true }).click();
    await expectStableLayout();
  });
}
