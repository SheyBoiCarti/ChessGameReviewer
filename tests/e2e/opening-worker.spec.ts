import { expect, test } from '@playwright/test';

test('builds a graph in the browser worker without console errors', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/phase-2-test-harness');
  const buildButton = page.getByRole('button', { name: 'Build 1,000 games in worker' });
  await expect(buildButton).toBeEnabled();
  await buildButton.click();
  await expect(page.getByTestId('graph-worker-status')).toHaveText('complete', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('main-thread-heartbeat')).toHaveText('true');
  expect(errors).toEqual([]);
});
