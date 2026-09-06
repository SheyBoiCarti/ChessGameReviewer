import { test, expect } from '@playwright/test';

test.describe('Browser Smoke Test', () => {
  test('renders page heading, disclosure dialog, and reports zero console errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');

    // Assert banner and view heading
    await expect(page.getByRole('banner', { name: 'Local Chess Game Reviewer' })).toBeVisible();
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Games');

    await page.getByRole('button', { name: 'About' }).click();
    const disclosure = page.getByRole('dialog', { name: /about this app/i });
    await expect(disclosure).toBeVisible();
    await expect(disclosure.getByTestId('unaffiliated-notice')).toContainText(
      'Unaffiliated Product Notice'
    );
    await expect(disclosure.getByTestId('privacy-summary')).toContainText(
      'Local Storage & Privacy'
    );

    // Assert the client workspace hydrated.
    await expect(page.getByRole('navigation', { name: 'Workspace navigation' })).toBeVisible();

    // Assert zero console errors
    expect(consoleErrors).toEqual([]);
  });
});
