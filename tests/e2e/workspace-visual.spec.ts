import scopeGames from '../fixtures/openingScopeGames.json';
import { expect, test, type Locator, type Page } from '@playwright/test';

import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';
import { installEngineFixtures } from './helpers/engineFixtures';

test.describe('workspace visual regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-14T12:00:00Z') });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await installWorkspaceFixtures(page);
  });

  test('initial query', async ({ page }) => {
    await page.goto('/');
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('initial-query.png', screenshotOptions());
  });

  test('loaded board', async ({ page }) => {
    await page.goto('/');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await expect(page.getByRole('grid', { name: 'Chess board' })).toBeVisible();
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('loaded-board.png', screenshotOptions(page));
  });

  test('opening tree', async ({ page }) => {
    await page.goto('/');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await page.getByRole('button', { name: 'Openings' }).click();
    await expect(page.getByRole('heading', { name: 'Openings', level: 3 })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'White', exact: true })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'White', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: /^Play d4,/ })).toHaveCount(0);
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('opening-tree.png', screenshotOptions());
  });

  test('analyzer unavailable', async ({ page }) => {
    const engine = await installEngineFixtures(page, { manualReady: true });
    await page.goto('/?engine=single');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('tab', { name: 'Analysis' }).click();
    await expect(page.getByText('Checking analysis engine…', { exact: true })).toBeVisible();
    await waitForStableLayout(page);
    const initialization = (await engine.requests())
      .filter((request) => request.type === 'INITIALIZE')
      .at(-1);
    expect(initialization).toBeDefined();
    await engine.deliver({
      protocolVersion: 1,
      jobId: initialization!.jobId,
      type: 'FAILED',
      code: 'FIXTURE_INITIALIZATION_FAILED',
      message: 'Controlled initialization failure',
    });
    await expect(page.getByText(/Analysis is unavailable on this device/i)).toBeVisible();
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('analyzer-unavailable.png', screenshotOptions(page));
  });

  test('mobile workspace', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await expect(page.getByRole('grid', { name: 'Chess board' })).toBeVisible();
    await waitForStableLayout(page);

    await expect(page).toHaveScreenshot('mobile-workspace.png', screenshotOptions(page));
  });

  test('review light theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await installWorkspaceFixtures(page);
    await installEngineFixtures(page, { manualReady: false, manualEvaluations: false });
    await page.goto('/?engine=single');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /^Preview .*opponent-two/i }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('button', { name: /Run review/ }).click();
    await expect(page.getByText('Review complete', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('group', { name: 'Evaluation graph' })).toBeVisible();
    await waitForStableLayout(page, 'light');
    await expect(page).toHaveScreenshot('review-light.png', screenshotOptions(page));
  });
});

function screenshotOptions(page?: Page) {
  return {
    animations: 'disabled' as const,
    timeout: 15_000,
    fullPage: true,
    ...(page ? { mask: dynamicDateCells(page) } : {}),
  };
}

function dynamicDateCells(page: Page): Locator[] {
  return [page.locator('.game-card__heading > span')];
}

async function waitForStableLayout(page: Page, theme: 'dark' | 'light' = 'dark') {
  await page.waitForFunction(() => {
    if (document.documentElement.dataset.theme === undefined) return false;
    const params = new URL(location.href).searchParams;
    const gameId = params.get('game');
    if (!gameId) return true;
    const saved = JSON.parse(localStorage.getItem('chess-game-reviewer:session') ?? 'null');
    return (
      saved?.gameId === gameId &&
      /^[a-f0-9]{64}$/.test(saved?.pgnDigest ?? '') &&
      saved.tab === params.get('view') &&
      saved.reviewMode === params.get('mode')
    );
  });
  await page.locator('html').evaluate((root, t) => root.setAttribute('data-theme', t), theme);
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );
  });
}

for (const width of [390, 768, 1440]) {
  for (const scenario of [
    {
      name: 'castling',
      fen: '4k3/8/8/8/8/8/8/4K2R w K - 0 1',
      moves: ['O-O'],
      squares: [['e1', 'g1']],
    },
    {
      name: 'promotion',
      fen: '7k/P7/8/8/8/8/8/K7 w - - 0 1',
      moves: ['a8=Q+'],
      squares: [['a7', 'a8']],
    },
    {
      name: 'shared-knight-destination',
      fen: '7k/8/8/8/8/8/8/KN1N4 w - - 0 1',
      moves: ['Nbc3', 'Ndc3'],
      squares: [
        ['b1', 'c3'],
        ['d1', 'c3'],
      ],
    },
  ]) {
    test(`T53: ${scenario.name} arrows at ${width} in both orientations`, async ({
      page,
    }, testInfo) => {
      const { Chess } = await import('chess.js');
      const base = scopeGames[0]!;
      const games = scenario.moves.map((move, index) => {
        const board = new Chess(scenario.fen);
        board.header('White', 'audit-player', 'Black', 'opponent', 'Result', '1/2-1/2');
        board.move(move);
        return {
          ...base,
          uuid: `arrow-${index}`,
          white: { ...base.white, username: 'audit-player', result: 'agreed' },
          black: { ...base.black, username: 'opponent', result: 'agreed' },
          pgn: board.pgn(),
        };
      });
      await page.setViewportSize({ width, height: 1000 });
      await page.route('https://api.chess.com/**', (route) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(
            route.request().url().endsWith('/archives')
              ? { archives: ['https://api.chess.com/pub/player/audit-player/games/2024/01'] }
              : { games }
          ),
        })
      );
      await page.goto('/?engine=unavailable');
      await page.getByLabel('Username', { exact: true }).fill('audit-player');
      await page.getByRole('button', { name: 'Game filters' }).click();
      await page.getByRole('radio', { name: 'Custom', exact: true }).click();
      await page.getByLabel('From date').fill('2024-01-01');
      await page.getByLabel('To date').fill('2024-01-31');
      await page.getByRole('button', { name: 'Find games' }).click();
      await expect(page.getByRole('list', { name: 'Games', exact: true })).toBeVisible();
      const openings = page.getByRole('button', { name: 'Openings', exact: true });
      if (!(await openings.isVisible()))
        await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await openings.click();
      await expect(page.locator('.opening-arrow')).toHaveCount(scenario.moves.length);
      for (const orientation of ['white', 'black']) {
        if (orientation === 'black')
          await page.getByRole('button', { name: 'Flip board', exact: true }).click();
        const audit = await page.locator('.opening-arrows').evaluate((svg) => ({
          passive: svg.getAttribute('pointer-events'),
          rect: {
            width: svg.getBoundingClientRect().width,
            height: svg.getBoundingClientRect().height,
          },
          ids: [...svg.querySelectorAll('marker')].map((n) => n.id),
          lines: [...svg.querySelectorAll('line')].map((n) => ({
            x1: Number(n.getAttribute('x1')),
            y1: Number(n.getAttribute('y1')),
            x2: Number(n.getAttribute('x2')),
            y2: Number(n.getAttribute('y2')),
          })),
          overflow: document.documentElement.scrollWidth - innerWidth,
        }));
        expect(audit.passive).toBe('none');
        expect(audit.rect.width).toBeGreaterThan(200);
        expect(audit.overflow).toBeLessThanOrEqual(1);
        expect(new Set(audit.ids).size).toBe(scenario.moves.length);
        const expectedOrigins = scenario.squares.map(([square]) => {
          const x = (square!.charCodeAt(0) - 97 + 0.5) * 12.5;
          const y = (8.5 - Number(square![1])) * 12.5;
          return orientation === 'white' ? { x, y } : { x: 100 - x, y: 100 - y };
        });
        for (const origin of expectedOrigins)
          expect(audit.lines).toContainEqual(
            expect.objectContaining({ x1: origin.x, y1: origin.y })
          );
        for (const line of audit.lines)
          for (const value of Object.values(line)) {
            expect(value).toBeGreaterThan(0);
            expect(value).toBeLessThan(100);
          }
        await testInfo.attach(`${scenario.name}-${width}-${orientation}`, {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      }
      // The overlay leaves the board and candidate button usable after flipping.
      await page
        .getByRole('button', { name: /^Play / })
        .first()
        .click();
      await expect(page.getByLabel('Opening move history')).not.toHaveText('');
      await expect(page.locator('.opening-arrow')).toHaveCount(0);
    });
  }
}
