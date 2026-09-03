import { expect, test, type Page } from '@playwright/test';

const cases = [
  ['complete', 'complete'],
  ['partial', 'partial'],
  ['cancelled', 'cancelled'],
  ['empty', 'complete'],
  ['offline-cache-only', 'complete'],
  ['failed', 'failed'],
] as const;

function collectBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

for (const [mode, expectedStatus] of cases) {
  test(`reports ${expectedStatus} for the ${mode} fixture`, async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);
    await page.goto('/phase-1-test-harness');
    const run = page.getByRole('button', { name: `Run ${mode}` });
    await expect(run).toBeEnabled();

    await run.click();

    await expect(page.getByTestId('ingestion-status')).toHaveText(expectedStatus);
    if (mode === 'cancelled') {
      await expect(page.getByRole('button', { name: 'Select retained fixture-1' })).toBeVisible();
      await page.getByRole('button', { name: 'Select retained fixture-1' }).click();
      await expect(page.getByTestId('selected-retained-game')).toHaveText('fixture-1');
    }
    if (mode === 'offline-cache-only') {
      await expect(page.getByTestId('offline-cache-only')).toHaveText('true');
    }
    expect(browserErrors).toEqual([]);
  });
}
