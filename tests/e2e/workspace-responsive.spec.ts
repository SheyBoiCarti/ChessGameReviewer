import { expect, test } from '@playwright/test';

import {
  installLongGameWorkspaceFixtures,
  installOverflowWorkspaceFixtures,
  installWorkspaceFixtures,
  loadFixtureGames,
} from './helpers/workspaceFixtures';

test('does not overflow horizontally at the configured viewport and 200% zoom', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('banner', { name: /local chess game reviewer/i })).toBeVisible();
  await expect(page.getByTestId('unaffiliated-notice')).toBeHidden();
  expect(await overflow(page)).toBeLessThanOrEqual(1);
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await page.setViewportSize({
    width: Math.max(200, Math.floor(viewport!.width / 2)),
    height: viewport!.height,
  });
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test('keeps the board and its move controls visible without document overflow across target viewports', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const viewports = [
    { name: 'phone', width: 390, height: 844, usesDrawer: true },
    { name: 'tablet', width: 768, height: 1024, usesDrawer: true },
    { name: 'small laptop', width: 1024, height: 768, usesDrawer: true },
    { name: 'desktop', width: 1440, height: 900, usesDrawer: false },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await installWorkspaceFixtures(page);
    await page.goto('/');

    if (viewport.usesDrawer) {
      const drawer = page.getByRole('dialog', { name: 'Game query and progress' });
      await expect(drawer).toBeVisible();
      await page.getByRole('button', { name: 'Close Game query and progress' }).click();
      await expect(drawer).toBeHidden();
      await expect(page.getByRole('button', { name: 'Filters' })).toBeFocused();
      await page.getByRole('button', { name: 'Filters' }).click();
      await expect(drawer).toBeVisible();
    }

    await loadFixtureGames(page);
    if (viewport.usesDrawer) {
      const drawer = page.getByRole('dialog', { name: 'Game query and progress' });
      await expect(drawer).toBeVisible();
      await page.getByRole('button', { name: 'Close Game query and progress' }).click();
      await expect(drawer).toBeHidden();
      await expect(page.getByRole('button', { name: 'Filters' })).toBeFocused();
    }
    await page.getByRole('button', { name: /opponent-two/i }).click();

    await expect(page.getByRole('grid', { name: 'Chess board' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Next move' })).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  }
});

test('uses the compact workspace before a three-column desktop layout crowds the board', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 824 });
  await installWorkspaceFixtures(page);
  await page.goto('/');

  const drawer = page.getByRole('dialog', { name: 'Game query and progress' });
  await expect(drawer).toBeVisible();
  await loadFixtureGames(page);
  await page.getByRole('button', { name: 'Close Game query and progress' }).click();

  await expect(page.getByRole('button', { name: /opponent-two/i })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Games' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Games' })).toHaveCount(0);
  await page.getByRole('button', { name: /opponent-two/i }).click();

  const board = await page.getByRole('grid', { name: 'Chess board' }).boundingBox();
  const maximumBoardSize = await page.evaluate(
    () =>
      window.innerHeight -
      Number.parseFloat(
        getComputedStyle(document.querySelector('.workspace-shell')!).getPropertyValue(
          '--workspace-chrome-height'
        )
      ) *
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  );
  expect(board).not.toBeNull();
  expect(board!.width).toBeLessThanOrEqual(maximumBoardSize + 1);
  expect(Math.abs(board!.width - board!.height)).toBeLessThanOrEqual(1);
  expect(
    await page
      .locator('.workspace-tabs')
      .evaluate((element) => element.scrollWidth - element.clientWidth)
  ).toBeLessThanOrEqual(1);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test('keeps the product identity and workspace tabs readable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const title = await page
    .getByRole('heading', { name: 'Local Chess Game Reviewer' })
    .boundingBox();
  expect(title).not.toBeNull();
  expect(title!.width).toBeGreaterThan(200);
  expect(
    await page
      .locator('.workspace-tabs')
      .evaluate((element) => element.scrollWidth - element.clientWidth)
  ).toBeLessThanOrEqual(1);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

test('uses a visually separated, classic board grid without obscuring move highlights', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();

  const board = page.getByRole('grid', { name: 'Chess board' });
  await expect(board).toBeVisible();
  expect(await board.evaluate((element) => getComputedStyle(element).gap)).toBe('1px');
  expect(
    await page
      .locator('[data-square="d7"]')
      .evaluate((element) => getComputedStyle(element).boxShadow)
  ).not.toContain('999px');
});

test('keeps every board square equal before and after piece occupancy changes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();

  await expectUniformBoardSquares(page);
  await page.getByRole('button', { name: 'Next move' }).click();
  await expectUniformBoardSquares(page);
});

test('aligns the evaluation meter to the framed board and uses its full track', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await installWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.getByRole('button', { name: 'Start analysis' })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByLabel('Analysis strength').selectOption('quick');
  await page.getByRole('button', { name: 'Start analysis' }).click();
  await expect(page.getByText('Analysis status: Complete', { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'Select ply 1' }).click();

  const meter = page.getByRole('meter', { name: 'White-perspective evaluation' });
  const [meterBox, frameBox, controlsBox, fillBox, value] = await Promise.all([
    meter.boundingBox(),
    page.locator('.chessboard-frame').boundingBox(),
    page.locator('.move-history-controls').boundingBox(),
    meter.locator('.evaluation-bar__white').boundingBox(),
    meter.getAttribute('aria-valuenow'),
  ]);
  expect(meterBox).not.toBeNull();
  expect(frameBox).not.toBeNull();
  expect(controlsBox).not.toBeNull();
  expect(fillBox).not.toBeNull();
  expect(value).not.toBeNull();
  expect(Math.abs(meterBox!.y - frameBox!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(meterBox!.height - frameBox!.height)).toBeLessThanOrEqual(1);
  expect(controlsBox!.y).toBeGreaterThan(meterBox!.y + meterBox!.height);
  expect(fillBox!.height / meterBox!.height).toBeCloseTo(Number(value) / 100, 1);
});

test('keeps evaluation labels readable over either fill direction in every theme', async ({
  page,
}) => {
  await page.goto('/');
  await waitForWorkspaceReady(page);
  await closeUtilityDrawer(page);
  await page.evaluate(() => {
    for (const whitePercent of [10, 90]) {
      const meter = document.createElement('div');
      meter.className = 'evaluation-bar evaluation-bar--contrast-fixture';
      const fill = document.createElement('span');
      fill.className = 'evaluation-bar__white';
      fill.style.height = `${whitePercent}%`;
      const text = document.createElement('span');
      text.className = 'evaluation-bar__text';
      text.textContent = whitePercent > 50 ? '+3.2' : '-3.2';
      meter.append(fill, text);
      document.body.append(meter);
    }
  });

  for (const theme of ['dark', 'light']) {
    await page
      .locator('html')
      .evaluate((element, value) => element.setAttribute('data-theme', value), theme);
    for (const label of await page
      .locator('.evaluation-bar--contrast-fixture span:last-child')
      .all()) {
      expect(await contrastAgainstBackground(label)).toBeGreaterThanOrEqual(4.5);
      expect(await label.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
        'rgba(0, 0, 0, 0)'
      );
    }
  }
});

test('contains games and opening candidates in fixed-height scroll viewports', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installOverflowWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page, 20);

  const gameResults = page.getByRole('region', { name: 'Game results' });
  await expect(gameResults.getByRole('button')).toHaveCount(20);
  const gameMetrics = await scrollMetrics(gameResults);
  expect(gameMetrics.clientHeight).toBeGreaterThanOrEqual(16 * 16 - 1);
  expect(gameMetrics.clientHeight).toBeLessThanOrEqual(28 * 16 + 1);
  expect(gameMetrics.scrollHeight).toBeGreaterThan(gameMetrics.clientHeight);
  await gameResults.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  expect((await scrollMetrics(gameResults)).scrollTop).toBeGreaterThan(0);

  await page.getByRole('tab', { name: 'Opening tree' }).click();
  const candidates = page.getByRole('region', { name: 'Opening candidate results' });
  await expect(candidates.getByRole('button', { name: /^Play / })).toHaveCount(20);
  const candidateMetrics = await scrollMetrics(candidates);
  expect(candidateMetrics.clientHeight).toBe(gameMetrics.clientHeight);
  expect(candidateMetrics.scrollHeight).toBeGreaterThan(candidateMetrics.clientHeight);

  const headingBefore = await candidates.getByRole('columnheader', { name: 'Move' }).boundingBox();
  await candidates.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  const headingAfter = await candidates.getByRole('columnheader', { name: 'Move' }).boundingBox();
  expect(headingBefore).not.toBeNull();
  expect(headingAfter).not.toBeNull();
  expect(Math.abs(headingAfter!.y - headingBefore!.y)).toBeLessThanOrEqual(1);
});

test('keeps tab, hover-button, and eyebrow text at AA contrast in every theme', async ({
  page,
}) => {
  await page.goto('/');
  await waitForWorkspaceReady(page);
  await closeUtilityDrawer(page);

  for (const theme of ['dark', 'light']) {
    await page
      .locator('html')
      .evaluate((element, value) => element.setAttribute('data-theme', value), theme);

    const selectedTab = page.getByRole('tab', { selected: true });
    const unselectedTab = page.getByRole('tab', { selected: false }).first();
    const button = page.getByRole('button').first();
    const eyebrow = page.locator('.app-topbar__eyebrow');

    await expect(selectedTab).toBeVisible();
    await expect(unselectedTab).toBeVisible();
    await expect(button).toBeVisible();

    expect(await contrastAgainstBackground(selectedTab)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastAgainstBackground(unselectedTab)).toBeGreaterThanOrEqual(4.5);

    await button.hover();
    expect(await contrastAgainstBackground(button)).toBeGreaterThanOrEqual(4.5);
    expect(await contrastAgainstBackground(eyebrow, '.app-topbar')).toBeGreaterThanOrEqual(4.5);
  }

  expect(
    await page.evaluate(() =>
      [...document.styleSheets]
        .flatMap((sheet) => [...(sheet.cssRules ?? [])])
        .some(
          (rule) =>
            rule instanceof CSSStyleRule &&
            rule.selectorText === '.tabular-nums' &&
            rule.style.fontVariantNumeric === 'tabular-nums'
        )
    )
  ).toBe(true);
});

test('desktop analyzer layout stays bounded within usable viewport height for long games without document explosion', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1920, height: 958 });
  await installLongGameWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page, 1);
  await page.getByRole('button', { name: /opponent-long/i }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.getByRole('button', { name: 'Start analysis' })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByLabel('Analysis strength').selectOption('quick');
  await page.getByRole('button', { name: 'Start analysis' }).click();
  await expect(page.getByText('Analysis status: Complete', { exact: true })).toBeVisible({
    timeout: 60_000,
  });

  const contextLocator = page.locator('.workspace-layout__context');
  const moveListLocator = page.locator('.analysis-move-list');
  const contextMetrics = await scrollMetrics(contextLocator);
  const moveListMetrics = await scrollMetrics(moveListLocator);

  const maxContextHeight = await page.evaluate(
    () =>
      window.innerHeight -
      Number.parseFloat(
        getComputedStyle(document.querySelector('.workspace-shell')!).getPropertyValue(
          '--workspace-chrome-height'
        )
      ) *
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  );
  expect(contextMetrics.clientHeight).toBeLessThanOrEqual(maxContextHeight + 5);
  expect(contextMetrics.scrollHeight).toBeGreaterThan(contextMetrics.clientHeight);

  expect(moveListMetrics.scrollHeight).toBeGreaterThan(moveListMetrics.clientHeight);

  const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(documentHeight).toBeLessThan(1500);

  await expect(page.locator('.annotation-panel-empty')).toBeVisible();
  await expect(page.locator('.annotation-panel')).toHaveCount(0);
  expect(await overflow(page)).toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: /select ply 5\b/i }).click();
  await expect(page.locator('.annotation-panel')).toHaveCount(1);
  await expect(page.locator('.annotation-panel h4')).toHaveText(/ply 5/i);
});

test('mobile analyzer layout uses natural document flow with bounded move list', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await installLongGameWorkspaceFixtures(page);
  await page.goto('/');

  const drawer = page.getByRole('dialog', { name: 'Game query and progress' });
  await expect(drawer).toBeVisible();
  await loadFixtureGames(page, 1);
  await page.getByRole('button', { name: 'Close Game query and progress' }).click();
  await expect(drawer).toBeHidden();

  await page.getByRole('button', { name: /opponent-long/i }).click();
  await page.getByRole('tab', { name: 'Analysis' }).click();
  await expect(page.getByRole('button', { name: 'Start analysis' })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByLabel('Analysis strength').selectOption('quick');
  await page.getByRole('button', { name: 'Start analysis' }).click();
  await expect(page.getByText('Analysis status: Complete', { exact: true })).toBeVisible({
    timeout: 60_000,
  });

  const contextOverflowY = await page
    .locator('.workspace-layout__context')
    .evaluate((element) => getComputedStyle(element).overflowY);
  expect(contextOverflowY).toBe('visible');

  const moveListLocator = page.locator('.analysis-move-list');
  const moveListMetrics = await scrollMetrics(moveListLocator);
  expect(moveListMetrics.scrollHeight).toBeGreaterThan(moveListMetrics.clientHeight);

  await expect(page.locator('.annotation-panel-empty')).toBeVisible();
  await page.getByRole('button', { name: /select ply 1\b/i }).click();
  await expect(page.locator('.annotation-panel')).toHaveCount(1);
  expect(await overflow(page)).toBeLessThanOrEqual(1);
});

async function overflow(page: import('@playwright/test').Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

async function expectUniformBoardSquares(page: import('@playwright/test').Page) {
  const boxes = await page.locator('[data-square]').evaluateAll((squares) =>
    squares.map((square) => {
      const { width, height } = square.getBoundingClientRect();
      return { width, height };
    })
  );
  expect(boxes).toHaveLength(64);
  const first = boxes[0]!;
  expect(first.width).toBeGreaterThan(0);
  expect(Math.abs(first.width - first.height)).toBeLessThanOrEqual(1);
  for (const box of boxes) {
    expect(Math.abs(box.width - first.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.height - first.height)).toBeLessThanOrEqual(1);
  }
}

async function scrollMetrics(locator: import('@playwright/test').Locator) {
  return locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
}

async function closeUtilityDrawer(page: import('@playwright/test').Page) {
  const usesDrawer = await page.evaluate(() => window.matchMedia('(max-width: 80rem)').matches);
  if (!usesDrawer) return;
  const drawer = page.getByRole('dialog', { name: 'Game query and progress' });
  await expect(drawer).toBeVisible();
  await page.getByRole('button', { name: 'Close Game query and progress' }).click();
  await expect(drawer).toBeHidden();
}

async function waitForWorkspaceReady(page: import('@playwright/test').Page) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'system');
}

async function contrastAgainstBackground(
  locator: import('@playwright/test').Locator,
  backgroundLocator?: string
) {
  return locator.evaluate((element, selector) => {
    const relativeLuminance = (color: string) => {
      const channels = color
        .match(/\d+(?:\.\d+)?/g)
        ?.slice(0, 3)
        .map(Number);
      if (!channels || channels.length !== 3) {
        throw new Error(`Expected an RGB color, received ${color}`);
      }
      const [red, green, blue] = channels.map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      if (red === undefined || green === undefined || blue === undefined) {
        throw new Error(`Expected three RGB channels, received ${color}`);
      }
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const textColor = window.getComputedStyle(element).color;
    const backgroundElement = selector ? element.closest(selector) : element;
    const backgroundColor = window.getComputedStyle(backgroundElement ?? element).backgroundColor;
    const [lighter, darker] = [
      relativeLuminance(textColor),
      relativeLuminance(backgroundColor),
    ].sort((first, second) => second - first);
    if (lighter === undefined || darker === undefined) {
      throw new Error('Expected two luminance values');
    }
    return (lighter + 0.05) / (darker + 0.05);
  }, backgroundLocator);
}
