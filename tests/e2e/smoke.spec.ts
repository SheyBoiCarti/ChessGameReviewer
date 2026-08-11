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

    await page.goto('/');

    // Assert main heading
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toHaveText('Chess.com Game Analyzer');

    // Assert unaffiliated notice
    const unaffiliatedNotice = page.getByTestId('unaffiliated-notice');
    await expect(unaffiliatedNotice).toBeVisible();
    await expect(unaffiliatedNotice).toContainText('Unaffiliated Product Notice');

    // Assert privacy notice
    const privacySummary = page.getByTestId('privacy-summary');
    await expect(privacySummary).toBeVisible();
    await expect(privacySummary).toContainText('Local Storage & Privacy');

    // Assert dynamic isolation status
    const isolationState = page.getByTestId('isolation-state');
    await expect(isolationState).toBeVisible();
    const stateText = await isolationState.textContent();
    expect(stateText).toMatch(/Enabled|Disabled|Checking/);

    // Assert zero console errors
    expect(consoleErrors).toEqual([]);
  });
});
