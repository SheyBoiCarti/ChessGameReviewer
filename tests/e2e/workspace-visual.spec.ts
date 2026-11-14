import { expect, test, type Locator, type Page } from '@playwright/test';

import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';
import { installEngineFixtures } from './helpers/engineFixtures';

test.describe('workspace visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-14T12:00:00Z') });
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
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await expect(page.getByRole('grid', { name: 'Chess board' })).toBeVisible();
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('loaded-board.png', screenshotOptions(page));
  });

  test('opening tree', async ({ page }) => {
    await page.goto('/');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await page.getByRole('button', { name: 'Openings' }).click();
    await expect(page.getByRole('heading', { name: 'Openings', level: 3 })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'White', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'White', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^Play d4,/ })).toHaveCount(0);
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('opening-tree.png', screenshotOptions());
  });

  test('analyzer unavailable', async ({ page }) => {
    const engine = await installEngineFixtures(page, { manualReady: true });
    await page.goto('/?engine=single');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('tab', { name: 'Analysis' }).click();
    await expect(page.getByText('Checking analysis engine…', { exact: true })).toBeVisible();
    await waitForStableLayout(page);
    const initialization = (await engine.requests())
      .filter((request) => request.type === 'INITIALIZE')
      .at(-1);
    expect(initialization).toBeDefined();
    await engine.deliver({
      protocolVersion: 1,
      jobId: initialization!.jobId,
      type: 'FAILED',
      code: 'FIXTURE_INITIALIZATION_FAILED',
      message: 'Controlled initialization failure',
    });
    await expect(page.getByText(/Analysis is unavailable on this device/i)).toBeVisible();
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('analyzer-unavailable.png', screenshotOptions(page));
  });

  test('mobile workspace', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await expect(page.getByRole('grid', { name: 'Chess board' })).toBeVisible();
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('mobile-workspace.png', screenshotOptions(page));
  });

  test('review light theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await installWorkspaceFixtures(page);
    await installEngineFixtures(page, { manualReady: false, manualEvaluations: false });
    await page.goto('/?engine=single');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('button', { name: /Run review/ }).click();
    await expect(page.getByText('Review complete', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('group', { name: 'Evaluation graph' })).toBeVisible();
    await waitForStableLayout(page, 'light');
    await expect(page).toHaveScreenshot('review-light.png', screenshotOptions(page));
  });
});

function screenshotOptions(page?: Page) {
  return {
    animations: 'disabled' as const,
    timeout: 15_000,
    fullPage: true,
    ...(page ? { mask: dynamicDateCells(page) } : {}),
  };
}

function dynamicDateCells(page: Page): Locator[] {
  return [page.locator('.game-card__heading > span')];
}

async function waitForStableLayout(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.theme === undefined) return false;
    const params = new URL(location.href).searchParams;
    const gameId = params.get('game');
    if (!gameId) return true;
    const saved = JSON.parse(localStorage.getItem('chess-game-reviewer:session') ?? 'null');
    return (
      saved?.gameId === gameId &&
      /^[a-f0-9]{64}$/.test(saved?.pgnDigest ?? '') &&
      saved.tab === params.get('view') &&
      saved.reviewMode === params.get('mode')
    );
  });
  await page.locator('html').evaluate((root, t) => root.setAttribute('data-theme', t), theme);
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}
