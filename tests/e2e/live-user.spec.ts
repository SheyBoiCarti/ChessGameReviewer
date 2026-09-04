import { expect, test } from '@playwright/test';

test('loads live games for user iamsheyboicarti and checks graph build', async ({ page }) => {
  test.setTimeout(90_000);

  page.on('console', (msg) => console.log(`[BROWSER ${msg.type()}]`, msg.text()));
  page.on('pageerror', (err) => console.error('[BROWSER ERROR]', err.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');

  // Enter username
  const usernameInput = page.getByLabel('Username');
  await expect(usernameInput).toBeVisible();
  await usernameInput.fill('iamsheyboicarti');

  // Open advanced filters to set maximum games to 5 for speed
  const filtersToggle = page.getByRole('button', { name: 'Game filters' });
  await filtersToggle.click();

  const maxGamesInput = page.getByLabel('Maximum games');
  await expect(maxGamesInput).toBeVisible();
  await maxGamesInput.fill('5');

  // Submit query
  const loadButton = page.getByRole('button', { name: 'Load games' });
  await loadButton.click();

  // Wait for games to load
  const firstGameButton = page
    .getByRole('region', { name: 'Game results' })
    .getByRole('button')
    .first();
  await expect(firstGameButton).toBeVisible({ timeout: 60_000 });

  // Click the first game
  await firstGameButton.click();

  // Switch to opening tree tab
  await page.getByRole('tab', { name: 'Opening tree' }).click();

  // Poll for opening tree panel content every 1s for 15s
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const html = await page
      .locator('#workspace-panel-opening')
      .innerHTML()
      .catch(() => 'no panel');
    console.log(`[Second ${i + 1}] Opening panel HTML:`, html);
    if (html.includes('Opening candidates') || html.includes('opening-tree')) {
      console.log('Found opening tree!');
      break;
    }
  }

  await expect(page.locator('.opening-tree')).toBeVisible({ timeout: 30_000 });
});
