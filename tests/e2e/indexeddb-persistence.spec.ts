import { expect, test } from '@playwright/test';

test('persists one PGN across reload and deletes it with confirmation', async ({ page }) => {
  await page.goto('/phase-1-test-harness');
  const seed = page.getByRole('button', { name: 'Seed local game' });
  await expect(seed).toBeEnabled();
  await seed.click();
  await expect(page.getByTestId('stored-game-count')).toHaveText('1');

  await page.reload();

  await expect(page.getByTestId('stored-game-count')).toHaveText('1');
  await page.getByRole('button', { name: 'Delete local user data' }).click();
  await expect(page.getByTestId('stored-game-count')).toHaveText('0');
  await expect(page.getByTestId('deletion-result')).toContainText('1 game');
});

test('a retained cancelled-ingestion game stays deleted after reload', async ({ page }) => {
  await page.goto('/phase-1-test-harness');
  const run = page.getByRole('button', { name: 'Run cancelled' });
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.getByTestId('ingestion-status')).toHaveText('cancelled');
  await expect(page.getByTestId('stored-game-count')).toHaveText('1');

  await page.getByRole('button', { name: 'Delete local user data' }).click();
  await expect(page.getByTestId('stored-game-count')).toHaveText('0');
  await page.reload();
  await expect(page.getByTestId('stored-game-count')).toHaveText('0');
});
