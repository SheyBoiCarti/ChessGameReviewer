import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  installTranspositionWorkspaceFixtures,
  installWorkspaceFixtures,
  loadFixtureGames,
} from './helpers/workspaceFixtures';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
});

async function openTab(page: Page, name: string) {
  if (await page.getByRole('button', { name: 'Open menu', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  }
  await page.getByRole('button', { name, exact: true }).click();
}

test('B1: candidate follows an alternate arrival and Back returns to the original line', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installTranspositionWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await expect(page.getByRole('button', { name: /opponent-two/i })).toBeVisible();
  await openTab(page, 'Openings');
  for (const move of ['Nf3', 'd5', 'd4', 'Nf6', 'e3']) {
    await page.getByRole('button', { name: `Play ${move}`, exact: false }).click();
  }
  await expect(page.getByRole('button', { name: 'Play e6', exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play e3', exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test('B2/B7: cancel retains games with neutral feedback; an empty import clears the graph and count', async ({
  page,
}) => {
  await installWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await expect(page.getByRole('button', { name: /opponent-two/i })).toBeVisible();
  await page.getByRole('button', { name: 'Import games', exact: true }).click();
  await page.getByLabel('Username').fill('fixture-slow');
  await page.getByLabel('From date').fill('2024-02-01');
  await page.getByLabel('To date').fill('2024-02-29');
  await page.route('**/fixture-slow/games/archives', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({
      json: { archives: ['https://api.chess.com/pub/player/fixture-user/games/2024/02'] },
    });
  });
  await page.getByRole('button', { name: 'Load games', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel loading' }).click();
  await expect(page.getByText('Import cancelled.', { exact: false })).toBeVisible();
  await expect(page.getByText('Games could not be loaded', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /close import games/i }).click();
  await expect(page.getByRole('button', { name: /opponent-two/i })).toBeVisible();
  await page.getByRole('button', { name: 'Import games', exact: true }).click();
  await page.getByLabel('Username').fill('fixture-user');
  await page.getByLabel('From date').fill('2024-01-01');
  await page.getByLabel('To date').fill('2024-01-31');
  await page.getByRole('button', { name: 'Game filters' }).click();
  for (const speed of ['Bullet', 'Blitz', 'Rapid'])
    await page.getByRole('checkbox', { name: speed, exact: true }).uncheck();
  await page.getByRole('button', { name: 'Load games', exact: true }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Import games' })
      .getByRole('heading', { name: 'No games found', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: /close import games/i }).click();
  await expect(page.getByText('2 games loaded', { exact: true })).toHaveCount(0);
  await openTab(page, 'Openings');
  await expect(page.getByRole('table', { name: 'Opening candidates' })).toHaveCount(0);
});

test('B3/B5: real Stockfish partial and completed reviews survive selection and reload', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await expect(page.getByRole('button', { name: /opponent-two/i })).toBeVisible();
  await openTab(page, 'Review');
  await page.locator('.analysis-settings-disclosure > summary').click();
  await page.getByLabel('Analysis strength').selectOption('quick');
  await page.getByRole('button', { name: /Run review/ }).click();
  await expect(page.locator('.analyzer-lifecycle-text')).toContainText(/Analysing [1-7] of 8/, {
    timeout: 30_000,
  });
  await page.getByRole('button', { name: 'Cancel analysis', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume analysis' })).toBeVisible();
  await openTab(page, 'Games');
  await page.getByRole('button', { name: /opponent-one/i }).click();
  await page.getByRole('button', { name: /opponent-two/i }).click();
  await openTab(page, 'Review');
  await expect(page.getByRole('button', { name: 'Resume analysis' })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Game Review Summary', exact: true })
      .getByText(/Coverage: [1-8] of 8 eligible plies/)
  ).toBeVisible();
  await page.getByRole('button', { name: 'Resume analysis' }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Last position', exact: true }).click();
  await openTab(page, 'Insights');
  const evaluated = await page.locator('.profile-tactics-moves-meta').innerText();
  expect(Number.parseInt(evaluated, 10)).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('.profile-tactics-moves-meta')).toHaveText(evaluated);
  await openTab(page, 'Games');
  await expect(page.getByRole('button', { name: /opponent-two/i })).toContainText('Reviewed');
  await openTab(page, 'Review');
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Position 8 of 8')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Game Review Summary' })).toBeVisible();
  await openTab(page, 'Insights');
  await expect(page.locator('.profile-tactics-moves-meta')).toHaveText(evaluated);
  await openTab(page, 'Settings');
  await page.getByRole('button', { name: /delete fixture-user data/i }).click();
  await page.getByRole('button', { name: 'Delete local data', exact: true }).click();
  await expect(page.getByText('No stored usernames were found.')).toBeVisible();
  const reviewCount = await page.evaluate(async () => {
    const [database] = await indexedDB.databases();
    return new Promise<number>((resolve, reject) => {
      const request = indexedDB.open(database!.name!);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction('meta').objectStore('meta').getAllKeys();
        read.onsuccess = () => {
          db.close();
          resolve(read.result.filter((key) => String(key).startsWith('review:')).length);
        };
        read.onerror = () => reject(read.error);
      };
    });
  });
  expect(reviewCount).toBe(0);
  await page.reload();
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.getByRole('button', { name: /opponent-two/i })).toHaveCount(0);
});

test('B4/B6/B8/B9: mobile Insights fits, passes contrast and landmarks, and reports refresh failure', async ({
  page,
  context,
}) => {
  await installWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await expect(page.getByRole('button', { name: /opponent-two/i })).toBeVisible();
  await openTab(page, 'Settings');
  await page.getByLabel('Theme').selectOption('dark');
  await openTab(page, 'Insights');
  await expect(page.getByRole('heading', { name: 'Fixture User' })).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
  const accessibility = await new AxeBuilder({ page })
    .withRules([
      'color-contrast',
      'landmark-banner-is-top-level',
      'landmark-main-is-top-level',
      'landmark-no-duplicate-main',
      'landmark-unique',
    ])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('radio', { name: 'Black', exact: true }).click();
  await expect(page.getByRole('tab', { name: /As Black/ })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  // Remove API fixtures before going offline so real fetch failures reach the UI.
  await page.unroute('https://api.chess.com/pub/player/fixture-user');
  await page.unroute('https://api.chess.com/pub/player/fixture-user/stats');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Refresh profile data', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Profile refresh failed' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixture User' })).toBeVisible();
  await context.setOffline(false);
});

test('B10: loading and reloading emits no analytics CSP failures', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByLabel('Username')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.locator('script[src*="va.vercel-scripts.com"]')).toHaveCount(0);
  expect(
    errors.filter((message) =>
      /content security policy|script.debug.js|Failed to load.*Vercel/i.test(message)
    )
  ).toEqual([]);
});
