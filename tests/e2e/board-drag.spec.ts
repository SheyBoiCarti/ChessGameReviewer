import { expect, test, type Page } from '@playwright/test';

import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await expect(page.getByRole('button', { name: /^Preview .*opponent-two/i })).toBeVisible();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Play Nf3,/ })).toBeVisible();
});

async function center(page: Page, square: string) {
  const box = await page.locator(`[data-square="${square}"]`).boundingBox();
  if (!box) throw new Error(`Square ${square} is not visible`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function startDrag(page: Page, from: string, to: string) {
  const source = await center(page, from);
  const target = await center(page, to);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 5 });
  return target;
}

for (const orientation of ['white', 'black'] as const) {
  test(`dragging uses a full-color piece copy and faded original with ${orientation} orientation`, async ({
    page,
  }) => {
    if (orientation === 'black') {
      await page.getByRole('button', { name: 'Flip board', exact: true }).click();
    }
    const source = page.locator('[data-square="g1"] .chess-piece');
    const originalSrc = await source.getAttribute('src');
    const target = await startDrag(page, 'g1', 'f3');
    const preview = page.locator('.chess-piece-drag-preview');

    await expect(source).toHaveCSS('opacity', '0.35');
    await expect(preview).toBeVisible();
    await expect(preview).toHaveCSS('pointer-events', 'none');
    await expect(preview).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(preview.locator('img')).toHaveAttribute('src', originalSrc!);
    await expect(preview.locator('img')).toHaveCSS('opacity', '1');
    await expect(
      preview.locator('[data-square], .board-file-label, .board-rank-label')
    ).toHaveCount(0);
    const previewBox = await preview.boundingBox();
    expect(previewBox).not.toBeNull();
    // Browsers can round pointer coordinates to whole CSS pixels.
    expect(Math.abs(previewBox!.x + previewBox!.width / 2 - target.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(previewBox!.y + previewBox!.height / 2 - target.y)).toBeLessThanOrEqual(1);

    await page.mouse.up();
    await expect(preview).toHaveCount(0);
    await expect(page.locator('[data-square="g1"] img')).toHaveCount(0);
    await expect(page.locator('[data-square="f3"] img')).toHaveAttribute('src', originalSrc!);
    await expect(page.locator('[data-square="f3"] img')).toHaveCSS('opacity', '1');
    await expect(page.locator('.opening-notation')).toHaveText('Nf3');

    await startDrag(page, 'd7', 'd5');
    await page.mouse.up();
    await expect(page.locator('.opening-notation')).toHaveText('Nf3 d5');
    // Clicking pieces still works after a drag, without a duplicate move on release.
    await page.locator('[data-square="d2"]').click();
    await page.locator('[data-square="d4"]').click();
    await expect(page.locator('.opening-notation')).toHaveText('Nf3 d5 d4');
  });
}

test('invalid and off-board drops restore the original, and Escape cancels dragging', async ({
  page,
}) => {
  const source = page.locator('[data-square="g1"] .chess-piece');
  const preview = page.locator('.chess-piece-drag-preview');

  await startDrag(page, 'g1', 'g4');
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(source).toHaveCSS('opacity', '1');
  await expect(page.locator('.opening-notation')).toHaveText('Start');

  await startDrag(page, 'g1', 'f3');
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await expect(preview).toHaveCount(0);
  await expect(source).toHaveCSS('opacity', '1');
  await expect(page.locator('.opening-notation')).toHaveText('Start');

  await startDrag(page, 'g1', 'f3');
  await page.keyboard.press('Escape');
  await expect(preview).toHaveCount(0);
  await expect(source).toHaveCSS('opacity', '1');
  await page.mouse.up();
  await expect(page.locator('.opening-notation')).toHaveText('Start');

  await startDrag(page, 'g1', 'f3');
  await page.locator('[data-square="g1"]').dispatchEvent('pointercancel');
  await expect(preview).toHaveCount(0);
  await expect(source).toHaveCSS('opacity', '1');
  await page.mouse.up();
  await expect(page.locator('.opening-notation')).toHaveText('Start');
});

test('opponent pieces cannot be dragged', async ({ page }) => {
  await startDrag(page, 'd7', 'd5');
  await expect(page.locator('.chess-piece-drag-preview')).toHaveCount(0);
  await expect(page.locator('[data-square="d7"] img')).toHaveCSS('opacity', '1');
  await page.mouse.up();
  await expect(page.locator('.opening-notation')).toHaveText('Start');
});

test('touch dragging moves a copy and restores the piece when cancelled', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'Touch input uses the Chromium DevTools protocol.');
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const source = await center(page, 'g1');
  const target = await center(page, 'f3');
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...source, id: 0 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...target, id: 0 }],
  });
  await expect(page.locator('.chess-piece-drag-preview')).toBeVisible();
  await expect(page.locator('[data-square="g1"] img')).toHaveCSS('opacity', '0.35');
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('.chess-piece-drag-preview')).toHaveCount(0);
  await expect(page.locator('.opening-notation')).toHaveText('Nf3');

  const pawnSource = await center(page, 'd7');
  const pawnTarget = await center(page, 'd5');
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...pawnSource, id: 0 }],
  });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...pawnTarget, id: 0 }],
  });
  await expect(page.locator('.chess-piece-drag-preview')).toBeVisible();
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('.chess-piece-drag-preview')).toHaveCount(0);
  await expect(page.locator('[data-square="d7"] img')).toHaveCSS('opacity', '1');
  await expect(page.locator('.opening-notation')).toHaveText('Nf3');
  await session.detach();
});
