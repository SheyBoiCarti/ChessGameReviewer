import { expect, test, type Page } from '@playwright/test';

import {
  installOpeningScopeWorkspaceFixtures,
  installTranspositionWorkspaceFixtures,
  installWorkspaceFixtures,
  loadFixtureGames,
} from './helpers/workspaceFixtures';

test.describe.configure({ timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
});

interface WorkerRequestObservation {
  type: string;
  horizon?: number | undefined;
}

/** Observe real worker requests without replacing worker behavior. */
async function observeOpeningWork(page: Page) {
  const chesscomRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://api.chess.com/')) {
      chesscomRequests.push(request.url());
    }
  });
  await page.addInitScript(() => {
    const observations: Array<{ type: string; horizon?: number | undefined }> = [];
    (window as unknown as { openingWorkerRequests: typeof observations }).openingWorkerRequests =
      observations;
    const postMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown) {
      if (message && typeof message === 'object' && 'type' in message) {
        const request = message as { type: string; options?: { maxOpeningPlies?: number } };
        observations.push({ type: request.type, horizon: request.options?.maxOpeningPlies });
      }
      Reflect.apply(postMessage, this, arguments);
    };
  });
  return {
    chesscomRequests,
    workerRequests: () =>
      page.evaluate(
        () =>
          (window as unknown as { openingWorkerRequests: WorkerRequestObservation[] })
            .openingWorkerRequests
      ),
  };
}

async function loadAuditGames(page: Page, whiteOnly = false) {
  await page.getByLabel('Username').fill('audit-player');
  await page.getByRole('button', { name: 'Game filters', exact: true }).click();
  await page.getByRole('radio', { name: 'Custom', exact: true }).check();
  await page.getByLabel('From date').fill('2024-01-01');
  await page.getByLabel('To date').fill('2024-01-31');
  await page.getByLabel('Maximum games').fill('20');
  if (whiteOnly) await page.getByRole('checkbox', { name: 'Black games', exact: true }).uncheck();
  await page.getByText('Advanced opening settings', { exact: true }).click();
  await page.getByLabel('Opening horizon (plies)').fill('8');
  await page.getByLabel('Rated status').selectOption('rated');
  await page.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(
    page.getByText(`${whiteOnly ? 12 : 20} games loaded`, { exact: false })
  ).toBeVisible();
}

async function playRows(page: Page, moves: readonly string[]) {
  for (const move of moves) {
    await page.getByRole('button', { name: new RegExp(`^Play ${move},`) }).click();
  }
}

function notation(page: Page) {
  return page.getByLabel('Opening move history').locator('.opening-notation');
}

test('T36/T40: scopes retain separate lines and redo through source-game Review and browser history', async ({
  page,
}) => {
  const work = await observeOpeningWork(page);
  await installOpeningScopeWorkspaceFixtures(page);
  await page.goto('/?engine=unavailable');
  await loadAuditGames(page);
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play e4, 7 games', exact: true })).toBeVisible();
  work.chesscomRequests.length = 0;

  await playRows(page, ['e4', 'e5', 'Nf3']);
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(notation(page)).toHaveText('e4 e5');
  await expect(page.getByRole('button', { name: 'Next move', exact: true })).toBeEnabled();
  await page.getByRole('radio', { name: /^Black/ }).check();
  await expect(page.getByRole('button', { name: 'Play d4, 4 games', exact: true })).toBeVisible();
  await expect(notation(page)).toHaveText('Start');
  await playRows(page, ['d4', 'd5']);
  await expect(notation(page)).toHaveText('d4 d5');

  await page.getByRole('radio', { name: /^White/ }).check();
  await expect(notation(page)).toHaveText('e4 e5');
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(notation(page)).toHaveText('e4 e5 Nf3');
  await page.getByRole('radio', { name: /^Black/ }).check();
  await expect(notation(page)).toHaveText('d4 d5');
  await expect(page.getByText('Matching games (4)', { exact: true })).toBeVisible();
  expect(work.chesscomRequests).toEqual([]);
  expect((await work.workerRequests()).filter((request) => request.type === 'INITIALIZE')).toEqual(
    []
  );

  await page.getByText('Matching games (4)', { exact: true }).click();
  await page
    .getByRole('region', { name: 'Games in this opening' })
    .getByRole('button')
    .first()
    .click();
  await expect(page).toHaveURL(/view=analysis/);
  const reviewUrl = page.url();
  const selectedGame = new URL(reviewUrl).searchParams.get('game');
  expect(selectedGame).toBeTruthy();
  await page.goBack();
  await expect(page).toHaveURL(/view=opening/);
  await expect(page.getByRole('radio', { name: /^Black/ })).toBeChecked();
  await expect(notation(page)).toHaveText('d4 d5');
  await expect(page.getByRole('button', { name: /^Play c4,/ })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(reviewUrl);
  expect(new URL(page.url()).searchParams.get('game')).toBe(selectedGame);
  await page.goBack();
  await expect(notation(page)).toHaveText('d4 d5');
  await page.getByRole('radio', { name: /^White/ }).check();
  await expect(notation(page)).toHaveText('e4 e5 Nf3');
  expect(work.chesscomRequests).toEqual([]);

  // Explicit scope choice survives a document reload independently of import filters.
  await page.getByRole('radio', { name: /^Black/ }).check();
  await expect(notation(page)).toHaveText('d4 d5');
  await page.reload();
  await expect(page).toHaveURL(/view=opening/);
  await expect(page.getByRole('radio', { name: /^Black/ })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Play d4, 4 games', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play e4, 2 games', exact: true })).toBeVisible();
});

test('T40: a changed dataset restores only a valid prefix and explains a reset', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await installOpeningScopeWorkspaceFixtures(page);
  await page.goto('/');
  await loadAuditGames(page);
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play e4, 7 games', exact: true })).toBeVisible();
  await playRows(page, ['e4', 'e5', 'Nf3']);
  await expect(notation(page)).toHaveText('e4 e5 Nf3');

  // The newest White fixture starts c4. A one-game White import invalidates e4
  // without changing the player or opening scope, so the valid prefix is the root.
  await page.getByRole('button', { name: 'Import games', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import games', exact: true });
  await dialog.getByRole('button', { name: 'Game filters', exact: true }).click();
  await dialog.getByLabel('Maximum games').fill('1');
  await dialog.getByRole('checkbox', { name: 'Black games', exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: /^Preview .*opponent-11/ })).toBeVisible();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^White/ })).toBeChecked();
  await expect(page.getByText(/Imported games or opening depth changed/)).toBeVisible();
  await expect(notation(page)).toHaveText('Start');
  await expect(page.getByRole('button', { name: 'Play c4, 1 games', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Play e4,/ })).toHaveCount(0);
  await expect(page.getByText('Matching games (1)', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next move', exact: true })).toBeDisabled();
  await playRows(page, ['c4', 'e5']);
  await expect(notation(page)).toHaveText('c4 e5');
  await expect(page.getByRole('button', { name: /^Play Nc3,/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('T37: an unrecorded exact route keeps position candidates and zero exact-line games', async ({
  page,
}) => {
  const work = await observeOpeningWork(page);
  await installTranspositionWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await expect(page.getByRole('button', { name: /^Preview .*opponent-two/i })).toBeVisible();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^White/ })).toBeChecked();
  await page.getByRole('radio', { name: /^Both/ }).check();
  await expect(page.getByRole('button', { name: /^Play d4,/ })).toBeVisible();
  const buildsBefore = (await work.workerRequests()).filter(
    (request) => request.type === 'BUILD_GRAPH'
  ).length;
  work.chesscomRequests.length = 0;

  await playRows(page, ['Nf3', 'd5', 'd4', 'Nf6', 'e3']);
  await expect(notation(page)).toHaveText('Nf3 d5 d4 Nf6 e3');
  await expect(page.getByRole('button', { name: /^Play e6,/ })).toBeVisible();
  await expect(page.getByText('Matching games (0)', { exact: true })).toBeVisible();
  await page.getByText('Matching games (0)', { exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Games in this opening' }).getByRole('button')
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await expect(notation(page)).toHaveText('Nf3 d5 d4 Nf6');
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(notation(page)).toHaveText('Nf3 d5 d4 Nf6 e3');

  await page.getByRole('button', { name: 'Starting position', exact: true }).click();
  for (const [from, to] of [
    ['g1', 'f3'],
    ['d7', 'd5'],
    ['d2', 'd4'],
    ['g8', 'f6'],
    ['e2', 'e3'],
  ]) {
    await page.locator(`[data-square="${from}"]`).click();
    await page.locator(`[data-square="${to}"]`).click();
  }
  await expect(notation(page)).toHaveText('Nf3 d5 d4 Nf6 e3');
  await expect(page.getByText('Matching games (0)', { exact: true })).toBeVisible();
  expect(
    (await work.workerRequests()).filter((request) => request.type === 'BUILD_GRAPH')
  ).toHaveLength(buildsBefore);
  expect((await work.workerRequests()).filter((request) => request.type === 'INITIALIZE')).toEqual(
    []
  );
  expect(work.chesscomRequests).toEqual([]);
});

test('T38: novelty clears candidates and membership, disables moves, and supports Return and redo', async ({
  page,
}) => {
  const work = await observeOpeningWork(page);
  await installOpeningScopeWorkspaceFixtures(page);
  await page.goto('/');
  await loadAuditGames(page);
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play e4, 7 games', exact: true })).toBeVisible();
  await expect(page.getByText('Matching games (12)', { exact: true })).toBeVisible();
  const buildsBefore = (await work.workerRequests()).filter(
    (request) => request.type === 'BUILD_GRAPH'
  ).length;
  work.chesscomRequests.length = 0;
  await page.locator('[data-square="a2"]').click();
  await page.locator('[data-square="a3"]').click();
  await expect(notation(page)).toHaveText('a3');
  await expect(page.getByRole('button', { name: /^Play / })).toHaveCount(0);
  await expect(page.getByText(/No observed games reach this position/)).toBeVisible();
  await expect(page.getByText('Matching games (0)', { exact: true })).toBeVisible();
  await expect(page.locator('[data-square="d7"]')).toHaveAttribute('draggable', 'false');
  await page.locator('[data-square="d7"]').click();
  await page.locator('[data-square="d5"]').click();
  await expect(notation(page)).toHaveText('a3');
  await expect(page.locator('[data-square="d7"] img')).toHaveCount(1);
  await expect(page.locator('[data-square="d5"] img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to observed opening tree', exact: true }).click();
  await expect(notation(page)).toHaveText('Start');
  await expect(page.getByRole('button', { name: 'Play e4, 7 games', exact: true })).toBeVisible();
  await expect(page.getByText('Matching games (12)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  await expect(notation(page)).toHaveText('a3');
  await expect(page.getByRole('button', { name: /^Play / })).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous move', exact: true }).click();
  await playRows(page, ['c4']);
  await expect(page.getByRole('button', { name: 'Next move', exact: true })).toBeDisabled();
  expect(
    (await work.workerRequests()).filter((request) => request.type === 'BUILD_GRAPH')
  ).toHaveLength(buildsBefore);
  expect((await work.workerRequests()).filter((request) => request.type === 'INITIALIZE')).toEqual(
    []
  );
  expect(work.chesscomRequests).toEqual([]);
});

test('T39: outer shortcuts share the cursor and ignore modifiers, text fields, and dialogs', async ({
  page,
}) => {
  await installWorkspaceFixtures(page);
  await page.goto('/');
  await loadFixtureGames(page);
  await expect(page.getByRole('button', { name: /^Preview .*opponent-two/i })).toBeVisible();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await playRows(page, ['Nf3', 'd5', 'd4']);
  const start = page.getByRole('button', { name: 'Starting position', exact: true });
  await start.focus();
  await page.keyboard.press('Home');
  await expect(notation(page)).toHaveText('Start');
  await page.keyboard.press('End');
  await expect(notation(page)).toHaveText('Nf3 d5 d4');
  await page.keyboard.press('ArrowLeft');
  await expect(notation(page)).toHaveText('Nf3 d5');
  for (const shortcut of ['Shift+Home', 'Control+End', 'Meta+Home'])
    await page.keyboard.press(shortcut);
  // Synthetic Alt avoids invoking the browser's own Alt+Left history command.
  await start.dispatchEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true });
  await expect(notation(page)).toHaveText('Nf3 d5');

  await page.getByText('Advanced opening settings', { exact: true }).click();
  await page.getByLabel('Opening horizon (plies)').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('End');
  await expect(notation(page)).toHaveText('Nf3 d5');
  await page.getByRole('button', { name: 'View move orders', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /Move orders to this position/ })).toBeVisible();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
  await expect(notation(page)).toHaveText('Nf3 d5');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Import games', exact: true }).click();
  await page.getByLabel('Username').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
  await expect(notation(page)).toHaveText('Nf3 d5');
  await page.getByRole('button', { name: /^Close import games$/i }).click();
  await expect(notation(page)).toHaveText('Nf3 d5');
  await page.getByRole('grid', { name: 'Chess board', exact: true }).press('Alt+ArrowRight');
  await expect(notation(page)).toHaveText('Nf3 d5 d4');
});

test('T40: excluded color loads only after an explicit import and preserves existing content on cancel', async ({
  page,
}) => {
  const work = await observeOpeningWork(page);
  await installOpeningScopeWorkspaceFixtures(page);
  await page.goto('/');
  await loadAuditGames(page, true);
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^White/ })).toBeChecked();
  await playRows(page, ['e4', 'e5']);
  work.chesscomRequests.length = 0;
  await page.getByRole('radio', { name: /^Black/ }).check();
  await expect(page.getByRole('button', { name: 'Load Black games', exact: true })).toBeVisible();
  await expect(page.getByText(/Black games were excluded from this import/)).toBeVisible();
  expect(work.chesscomRequests).toEqual([]);
  await page.getByRole('button', { name: 'Load Black games', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import games', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Game filters', exact: true }).click();
  await expect(dialog.getByRole('checkbox', { name: 'White games', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Black games', exact: true })).toBeChecked();
  await expect(dialog.getByText('12 games are available.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: /^Close import games$/i }).click();
  await expect(page.getByRole('button', { name: 'Load Black games', exact: true })).toBeVisible();
  expect(work.chesscomRequests).toEqual([]);

  await page.getByRole('button', { name: 'Load Black games', exact: true }).click();
  await dialog.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('20 games loaded', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^Black/ })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Play d4, 4 games', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load Black games', exact: true })).toHaveCount(0);
  expect((await work.workerRequests()).filter((request) => request.type === 'INITIALIZE')).toEqual(
    []
  );
});

test('T40: a horizon changed in Games is applied on Openings entry without importing or starting Stockfish', async ({
  page,
}) => {
  const work = await observeOpeningWork(page);
  await installOpeningScopeWorkspaceFixtures(page);
  await page.goto('/');
  await loadAuditGames(page);
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play e4, 7 games', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  work.chesscomRequests.length = 0;
  await page.getByRole('button', { name: 'Import games', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import games', exact: true });
  await dialog.getByText('Advanced opening settings', { exact: true }).click();
  await dialog.getByLabel('Opening horizon (plies)').fill('2');
  await dialog.getByRole('button', { name: /^Close import games$/i }).click();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(page.getByRole('radio', { name: /^White/ })).toBeEnabled();
  await playRows(page, ['e4', 'e5']);
  await expect(page.getByText(/Opening depth limit reached/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Play / })).toHaveCount(0);
  await page.getByText('Advanced opening settings', { exact: true }).click();
  await expect(page.getByLabel('Opening horizon (plies)')).toHaveValue('2');
  expect(
    (await work.workerRequests()).filter(
      (request) => request.type === 'BUILD_GRAPH' && request.horizon === 2
    ).length
  ).toBeGreaterThan(0);
  expect((await work.workerRequests()).filter((request) => request.type === 'INITIALIZE')).toEqual(
    []
  );
  expect(work.chesscomRequests).toEqual([]);
});
