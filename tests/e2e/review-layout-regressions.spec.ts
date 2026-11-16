import { expect, test } from '@playwright/test';
import { installEngineFixtures } from './helpers/engineFixtures';
import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';

test('selecting a game does not force the board into view', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { boardScrolls: number }).boardScrolls = 0;
    const previous = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = function (...args) {
      if (this.classList.contains('workspace-board'))
        (window as unknown as { boardScrolls: number }).boardScrolls++;
      return previous.apply(this, args);
    };
  });
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  expect(
    await page.evaluate(() => (window as unknown as { boardScrolls: number }).boardScrolls)
  ).toBe(0);
});

test('desktop completed feedback remains visible with the board', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await installEngineFixtures(page, { manualReady: false, manualEvaluations: false });
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: /Run review/ }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible({ timeout: 60000 });
  const feedback = await page.getByRole('region', { name: 'Selected move feedback' }).boundingBox();
  expect(feedback!.y).toBeLessThan(768);
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1024, height: 768 },
]) {
  test(`review keeps the board anchored and the document within ${viewport.width}px desktop`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await installEngineFixtures(page, { manualReady: false, manualEvaluations: false });
    await installWorkspaceFixtures(page);
    await page.goto('/?engine=single');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    const board = page.getByRole('grid', { name: 'Chess board' });
    const initial = await board.boundingBox();
    const expectStableLayout = async () => {
      const current = await board.boundingBox();
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(current![key] - initial![key])).toBeLessThanOrEqual(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
        viewport.height + 1
      );
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    };
    await expectStableLayout();
    await page.getByRole('button', { name: /Run review/ }).click();
    await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
    await expectStableLayout();
    await page.getByRole('button', { name: 'Next move', exact: true }).click();
    await expectStableLayout();
    await page.locator('.review-feedback summary').click();
    await expectStableLayout();
    await page.locator('.review-summary > summary').click();
    await expectStableLayout();
    await page.locator('.analysis-settings-disclosure > summary').click();
    await expectStableLayout();
    const sidebar = page.locator('.workspace-layout__sidebar');
    await sidebar.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expectStableLayout();
    await sidebar.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.getByRole('button', { name: 'Explore alternative', exact: true }).click();
    await expect(
      page.getByRole('complementary', { name: 'Analysis variation sandbox' })
    ).toBeVisible();
    await expectStableLayout();
    await page.getByRole('button', { name: /^Return to game \(Return to main game\)/ }).click();
    await expectStableLayout();
    await page.getByRole('tab', { name: 'Review', exact: true }).click();
    await expectStableLayout();
  });
}

test('evaluation tracks reserve space across the 768px boundary and narrow playback reflows', async ({
  page,
}) => {
  await installEngineFixtures(page, { manualReady: false, manualEvaluations: false });
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: /Run review/ }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  const layout = () =>
    page.evaluate(() => {
      const box = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
      };
      return {
        board: box('.chessboard'),
        controls: box('.move-history-controls'),
        feedback: box('.workspace-layout__feedback'),
      };
    });
  for (const width of [769, 768, 767, 390, 320, 200]) {
    await page.setViewportSize({ width, height: 844 });
    const first = page.getByRole('button', { name: 'First position', exact: true });
    if (await first.isEnabled()) await first.click();
    await expect(page.getByRole('meter')).toHaveCount(0);
    const before = await layout();
    await page.getByRole('button', { name: 'Next move', exact: true }).click();
    const meter = page.getByRole('meter');
    await expect(meter).toHaveAttribute('data-mode', width < 768 ? 'horizontal' : 'vertical');
    const after = await layout();
    expect(after.board).toEqual(before.board);
    expect(after.controls).toEqual(before.controls);
    expect(after.feedback.y).toBe(before.feedback.y);
    const meterBox = (await meter.boundingBox())!;
    if (width < 768) {
      expect(meterBox.height).toBe(6);
      expect(meterBox.width).toBeCloseTo(after.board.width + 2, 1);
    } else {
      expect(meterBox.width).toBe(28);
      expect(meterBox.height).toBeCloseTo(after.board.height + 2, 1);
    }
    const value = await meter.getAttribute('aria-valuenow');
    const orientation = await meter.getAttribute('data-orientation');
    await page.getByRole('button', { name: 'Flip board', exact: true }).click();
    await expect(meter).not.toHaveAttribute('data-orientation', orientation!);
    await expect(meter).toHaveAttribute('aria-valuenow', value!);
    const fill = await meter.locator('.evaluation-bar__white').evaluate((element) => ({
      top: (element as HTMLElement).style.top,
      bottom: (element as HTMLElement).style.bottom,
      left: (element as HTMLElement).style.left,
      right: (element as HTMLElement).style.right,
    }));
    const flippedToBlack = orientation === 'white';
    expect(
      width < 768
        ? fill[flippedToBlack ? 'right' : 'left']
        : fill[flippedToBlack ? 'top' : 'bottom']
    ).toBe('0px');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    ).toBeLessThanOrEqual(1);
    for (const button of await page.locator('.move-history-controls button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const beforeExpansion = await layout();
  await page.locator('.review-feedback summary').click();
  expect((await layout()).board).toEqual(beforeExpansion.board);
});

test('opening arrows retain full computed stroke widths in both orientations', async ({ page }) => {
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  for (let flip = 0; flip < 2; flip++) {
    const arrows = page.locator('.opening-arrow');
    await expect(arrows.first()).toBeVisible();
    const styles = await arrows.evaluateAll((elements) =>
      elements.map((element) => ({
        width: getComputedStyle(element).strokeWidth,
        viewBox: (element as SVGElement).ownerSVGElement!.getAttribute('viewBox'),
        path: element.getAttribute('d'),
      }))
    );
    for (const style of styles) {
      expect(style.width).toBe('51.2px');
      expect(style.viewBox).toBe('0 0 2048 2048');
      expect(style.path!.match(/ L /g)).toHaveLength(2);
    }
    // Active styling must not override the same SVG width.
    await arrows.evaluateAll((elements) =>
      elements.forEach((element) => element.classList.add('opening-arrow--active'))
    );
    expect(await arrows.first().evaluate((element) => getComputedStyle(element).strokeWidth)).toBe(
      '51.2px'
    );
    await page.getByRole('button', { name: 'Flip board', exact: true }).click();
  }
});

test('piece animations follow forward and reverse navigation and finish on the animation timeline', async ({
  page,
}) => {
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=unavailable');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  const transition = (button: string) =>
    page.evaluate(async (button) => {
      (
        document.querySelector(
          `.move-history-controls button[aria-label="${button}"]`
        ) as HTMLButtonElement
      ).click();
      await new Promise(requestAnimationFrame);
      const animations = document
        .getAnimations()
        .filter(
          (animation) => (animation.effect as KeyframeEffect).target instanceof HTMLImageElement
        );
      const animation = animations[0]!;
      animation.pause();
      const effect = animation.effect as KeyframeEffect;
      const result = {
        square: (effect.target as HTMLElement).parentElement!.dataset.square,
        duration: effect.getTiming().duration,
        keyframes: effect.getKeyframes().map((frame) => frame.transform),
      };
      // A delayed or paused animation must survive beyond 180ms of wall time.
      await new Promise((resolve) => setTimeout(resolve, 220));
      const remainedPaused = animation.playState === 'paused';
      animation.finish();
      await animation.finished;
      await new Promise(requestAnimationFrame);
      return {
        ...result,
        remainedPaused,
        remaining: (effect.target as HTMLElement).getAnimations().length,
      };
    }, button);
  const forward = await transition('Next move');
  expect(forward).toMatchObject({
    square: 'd4',
    duration: 180,
    remainedPaused: true,
    remaining: 0,
  });
  expect(forward.keyframes).toEqual(['translate3d(0%, 200%, 0px)', 'translate3d(0px, 0px, 0px)']);
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  const reverse = await transition('Previous move');
  expect(reverse).toMatchObject({
    square: 'g8',
    duration: 180,
    remainedPaused: true,
    remaining: 0,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  expect(
    await page
      .locator('.chess-piece')
      .evaluateAll((pieces) => pieces.flatMap((piece) => piece.getAnimations()).length)
  ).toBe(0);
});
