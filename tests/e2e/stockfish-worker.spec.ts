import { expect, test } from '@playwright/test';

test('initializes and evaluates with the preferred Stockfish engine when isolation is available', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Pinned engine smoke coverage runs in Chromium.');
  test.setTimeout(45_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/phase-3-test-harness');
  await expect(page.getByTestId('engine-status')).toHaveText(
    /^Ready: (threaded|single-thread); PV: .+/,
    {
      timeout: 30_000,
    }
  );
  expect(errors).toEqual([]);
});

test('initializes the pinned single-thread Stockfish worker as a forced fallback', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Pinned engine smoke coverage runs in Chromium.');
  test.setTimeout(45_000);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/phase-3-test-harness?mode=single');
  await expect(page.getByTestId('engine-status')).toHaveText(/^Ready: single-thread; PV: .+/, {
    timeout: 30_000,
  });
  expect(errors).toEqual([]);
});
