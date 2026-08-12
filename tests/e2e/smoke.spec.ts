import { test, expect } from '@playwright/test';

test.describe('Browser Smoke Test', () => {
  test('renders page heading, privacy notice, unaffiliated notice, and reports zero console errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));

    await page.goto('/');

    // Assert main heading
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Local Chess Game Reviewer');

    // Assert unaffiliated notice
    const unaffiliatedNotice = page.getByTestId('unaffiliated-notice');
    await expect(unaffiliatedNotice).toBeVisible();
    await expect(unaffiliatedNotice).toContainText('Unaffiliated Product Notice');

    // Assert privacy notice
    const privacySummary = page.getByTestId('privacy-summary');
    await expect(privacySummary).toBeVisible();
    await expect(privacySummary).toContainText('Local Storage & Privacy');

    // Assert the client workspace hydrated.
    await expect(page.getByRole('tablist', { name: 'Analysis workspaces' })).toBeVisible();

    // Assert zero console errors
    expect(consoleErrors).toEqual([]);
  });
});
