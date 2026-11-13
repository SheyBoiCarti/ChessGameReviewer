import { expect, test } from '@playwright/test';
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
  await page.getByRole('button', { name: /opponent-two/i }).click();
  expect(
    await page.evaluate(() => (window as unknown as { boardScrolls: number }).boardScrolls)
  ).toBe(0);
});

test('desktop completed feedback remains visible with the board', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: /Run review/ }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible({ timeout: 60000 });
  const feedback = await page.getByRole('region', { name: 'Selected move feedback' }).boundingBox();
  expect(feedback!.y).toBeLessThan(768);
});
