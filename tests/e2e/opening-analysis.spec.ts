import { expect, test } from '@playwright/test';
import { Chess } from 'chess.js';
import { installEngineFixtures } from './helpers/engineFixtures';
import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';

test.describe.configure({ timeout: 60000 });

const variation = new Chess();
const variationFens: string[] = [];
for (const move of ['a3', 'd5', 'b3']) {
  variation.move(move);
  variationFens.push(variation.fen());
}

test('opening analysis shows three engine choices, follows color, and supports free variations and redo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const engine = await installEngineFixtures(page, {
    manualReady: false,
    manualEvaluations: false,
    fens: variationFens,
  });
  await installWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  const analysis = page.getByRole('region', { name: 'Stockfish position analysis' });
  await expect(analysis.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('meter')).toHaveAttribute(
    'aria-valuetext',
    'White advantage 0.35 pawns'
  );
  await expect(page.getByRole('radio', { name: /^Both/ })).toHaveCount(0);
  await expect(page.locator('[data-square]').first()).toHaveAttribute('data-square', 'a8');
  await page.getByRole('radio', { name: /^Black/ }).check();
  await expect(page.locator('[data-square]').first()).toHaveAttribute('data-square', 'h1');
  await page.getByRole('radio', { name: /^White/ }).check();
  await expect(page.locator('[data-square]').first()).toHaveAttribute('data-square', 'a8');
  await analysis.getByRole('button', { name: 'Play engine choice 1: a3', exact: true }).click();
  const notation = page.getByLabel('Opening move history').locator('.opening-notation');
  await expect(notation).toHaveText('a3');
  await expect(analysis.getByRole('listitem')).toHaveCount(3);
  await expect(page.getByRole('meter')).toHaveAttribute(
    'aria-valuetext',
    'Black advantage 0.35 pawns'
  );
  for (const [from, to] of [
    ['d7', 'd5'],
    ['b2', 'b3'],
  ]) {
    await page.locator(`[data-square="${from}"]`).click();
    await page.locator(`[data-square="${to}"]`).click();
  }
  await expect(notation).toHaveText('a3 d5 b3');
  await expect(analysis.getByRole('listitem')).toHaveCount(3);
  await page.getByRole('button', { name: 'Return to observed opening tree', exact: true }).click();
  await expect(notation).toHaveText('Start');
  for (let index = 0; index < 3; index++)
    await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(notation).toHaveText('a3 d5 b3');
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(notation).toHaveText('a3 d5 b3');
  expect(
    (await engine.requests())
      .filter((r) => r.type === 'EVALUATE')
      .every((r) => r.type === 'EVALUATE' && r.multiPv === 3)
  ).toBe(true);
  const controls = await page.locator('.move-history-controls').boundingBox();
  const board = await page.locator('.board-shell').boundingBox();
  expect(controls).toBeTruthy();
  expect(board).toBeTruthy();
  expect(Math.abs(controls!.x + controls!.width / 2 - (board!.x + board!.width / 2))).toBeLessThan(
    2
  );
  expect(
    (await page.getByRole('button', { name: 'Next move', exact: true }).boundingBox())!.width
  ).toBeGreaterThanOrEqual(48);
});

test('game review loads both Chess.com player photos and offers current-position engine moves', async ({
  page,
}) => {
  const engineLine = new Chess();
  engineLine.move('a3');
  const fens = [engineLine.fen()];
  engineLine.move('Nc6');
  fens.push(engineLine.fen());
  await installEngineFixtures(page, { manualReady: false, manualEvaluations: false, fens });
  await installWorkspaceFixtures(page);
  const avatar = 'https://images.chesscomfiles.com/uploads/test-avatar.png';
  for (const username of ['fixture-user', 'opponent-two']) {
    await page.route(`https://api.chess.com/pub/player/${username}`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          username,
          avatar,
          joined: 0,
          status: 'basic',
          url: `https://www.chess.com/member/${username}`,
        }),
      })
    );
  }
  await page.route(avatar, (route) =>
    route.fulfill({
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMw7lD6DwADrAHd3zS2sAAAAABJRU5ErkJggg==',
        'base64'
      ),
    })
  );
  await page.goto('/');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
  await expect(page).toHaveURL(/view=analysis/);
  await expect(page.locator('.player-strip__avatar img')).toHaveCount(2);
  for (const photo of await page.locator('.player-strip__avatar img').all()) {
    await expect
      .poll(() => photo.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBeGreaterThan(0);
  }
  const analysis = page.getByRole('region', { name: 'Stockfish position analysis' });
  await expect(analysis.getByRole('listitem')).toHaveCount(3);
  await analysis.getByRole('button').first().click();
  await expect(
    page.getByRole('complementary', { name: 'Analysis variation sandbox' })
  ).toBeVisible();
  await analysis.getByRole('button', { name: 'Play engine choice 1: Nc6', exact: true }).click();
  const sequence = page.getByRole('navigation', { name: 'Variation move sequence' });
  await expect(sequence.getByRole('button', { name: 'a3', exact: true })).toBeVisible();
  await expect(sequence.getByRole('button', { name: 'Nc6', exact: true })).toBeVisible();
  await expect(page.getByLabel('Position 2 of 2')).toBeVisible();
});

test('real Stockfish evaluates a position outside the recorded tree', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  const analysis = page.getByRole('region', { name: 'Stockfish position analysis' });
  await expect(analysis.getByRole('listitem')).toHaveCount(3, { timeout: 30000 });
  await page.locator('[data-square="a2"]').click();
  await page.locator('[data-square="a3"]').click();
  await expect(analysis.getByRole('listitem')).toHaveCount(3, { timeout: 15000 });
  await expect(page.getByRole('meter')).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('opening-analysis-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Next move', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: test.info().outputPath('opening-analysis-mobile.png'),
    fullPage: true,
  });
});
