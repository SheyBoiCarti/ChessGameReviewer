import { expect, test } from '@playwright/test';

test('builds a graph in the browser worker without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/phase-2-test-harness');
  await page.getByRole('button', { name: 'Build graph in worker' }).click();
  await expect(page.getByTestId('graph-worker-status')).toHaveText('complete');
  expect(errors).toEqual([]);
});
