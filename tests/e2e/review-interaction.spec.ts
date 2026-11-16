import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chess.js';
import { installEngineFixtures } from './helpers/engineFixtures';
import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';

test.describe.configure({ timeout: 60000 });

function lineFens(moves: readonly string[]) {
  const chess = new Chess();
  return moves.map((move) => {
    chess.move(move);
    return chess.fen();
  });
}

async function dragMove(page: Page, from: string, to: string) {
  const source = await page.locator(`[data-square="${from}"]`).boundingBox();
  const target = await page.locator(`[data-square="${to}"]`).boundingBox();
  if (!source || !target) throw new Error('The move squares must be visible.');
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 5 });
  await expect(page.locator('.chess-piece-drag-preview')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.chess-piece-drag-preview')).toHaveCount(0);
}

for (const width of [1440, 390]) {
  test(`evaluation bar stays mounted with its last score during searches at ${width}px`, async ({
    page,
  }) => {
    // Import on desktop, then exercise the actual desktop/mobile evaluation track.
    await page.setViewportSize({ width: 1440, height: 1000 });
    const engine = await installEngineFixtures(page, {
      manualReady: false,
      fens: lineFens(['a3', 'd5']),
    });
    await installWorkspaceFixtures(page);
    await page.goto('/');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: 'Openings', exact: true }).click();
    await page.setViewportSize({ width, height: 1000 });
    await engine.releaseEvaluations(1);
    const meter = page.getByRole('meter');
    await expect(meter).toHaveAttribute('aria-valuetext', 'White advantage 0.35 pawns');
    await expect(meter).toHaveAttribute('data-mode', width < 768 ? 'horizontal' : 'vertical');
    const originalMeter = await meter.elementHandle();
    const analysis = page.getByRole('region', { name: 'Stockfish position analysis' });

    for (const [index, from, to, nextScore] of [
      [0, 'a2', 'a3', 'Black advantage 0.35 pawns'],
      [1, 'd7', 'd5', 'White advantage 0.35 pawns'],
    ] as const) {
      const previousScore = await meter.getAttribute('aria-valuetext');
      await page.locator(`[data-square="${from}"]`).click();
      await page.locator(`[data-square="${to}"]`).click();
      await expect(analysis.getByRole('status')).toHaveText('Analysing this position…');
      await expect(meter).toHaveAttribute('aria-valuetext', previousScore!);
      expect(await originalMeter!.evaluate((element) => element.isConnected)).toBe(true);
      await expect
        .poll(
          async () =>
            (await engine.requests()).filter((request) => request.type === 'EVALUATE').length
        )
        .toBe(index + 2);
      await engine.releaseEvaluations(1);
      await expect(meter).toHaveAttribute('aria-valuetext', nextScore);
      expect(await originalMeter!.evaluate((element) => element.isConnected)).toBe(true);
    }
  });
}

for (const orientation of ['white', 'black'] as const) {
  test(`Review allows dragging recorded moves and variations from ${orientation}'s perspective`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await installEngineFixtures(page, {
      manualReady: false,
      manualEvaluations: false,
      fens: lineFens(['d4', 'Nf6', 'c4', 'e6']),
    });
    await installWorkspaceFixtures(page);
    await page.goto('/');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const review = page.getByRole('tab', { name: 'Review', exact: true });
    await expect(review).toHaveAttribute('aria-selected', 'true');
    const board = page.getByRole('grid', { name: 'Chess board', exact: true });
    if ((await board.getAttribute('data-orientation')) !== orientation)
      await page.getByRole('button', { name: 'Flip board', exact: true }).click();
    await expect(board).toHaveAttribute('data-orientation', orientation);

    await dragMove(page, 'd2', 'd4');
    await expect(page.getByLabel('Position 1 of 8')).toBeVisible();
    await dragMove(page, 'g8', 'f6');
    await expect(page.getByLabel('Position 2 of 8')).toBeVisible();
    await expect(page.locator('.variation-sandbox-banner')).toHaveCount(0);
    await dragMove(page, 'c2', 'c4');
    await dragMove(page, 'e7', 'e6');
    const banner = page.getByRole('complementary', { name: 'Analysis variation sandbox' });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('button', { name: 'c4', exact: true })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'e6', exact: true })).toBeVisible();
    await expect(review).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Position 2 of 2')).toBeVisible();
    await page.getByRole('button', { name: 'Previous move', exact: true }).click();
    await expect(page.getByLabel('Position 1 of 2')).toBeVisible();
    await page.getByRole('button', { name: 'Next move', exact: true }).click();
    await expect(page.getByLabel('Position 2 of 2')).toBeVisible();
    await banner.getByRole('button', { name: /^Return to game/ }).click();
    await expect(banner).toHaveCount(0);
    await expect(page.getByLabel('Position 2 of 8')).toBeVisible();
    await expect(page.locator('[data-square="c2"] img')).toHaveCount(1);
    await expect(page.locator('[data-square="e7"] img')).toHaveCount(1);
    await dragMove(page, 'g1', 'f3');
    await expect(page.getByLabel('Position 3 of 8')).toBeVisible();
    await expect(review).toHaveAttribute('aria-selected', 'true');
  });
}
