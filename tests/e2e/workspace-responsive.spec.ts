import { expect, test } from '@playwright/test';

test('does not overflow horizontally at the configured viewport and 200% zoom', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /local chess game reviewer/i })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

async function overflow(page: import('@playwright/test').Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}
