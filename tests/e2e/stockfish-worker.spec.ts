import { expect, test } from '@playwright/test';

test('initializes the pinned single-thread Stockfish worker', async ({ page }) => {
  test.setTimeout(45_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/phase-3-test-harness');
  await expect(page.getByTestId('engine-status')).toHaveText('Ready: single-thread', {
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
});
