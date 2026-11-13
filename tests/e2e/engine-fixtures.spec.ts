import { expect, test } from '@playwright/test';
import { installEngineFixtures, createEvaluationFixture } from './helpers/engineFixtures';
import {
  installWorkspaceFixtures,
  loadFixtureGames,
  installOpeningScopeWorkspaceFixtures,
  installOldestFirstWorkspaceFixtures,
  installLongNameWorkspaceFixtures,
} from './helpers/workspaceFixtures';
import type { EngineWorkerRequest } from '../../workers/stockfish.protocol';

test('pauses after one completed move, cancels, and ignores a stale evaluation', async ({
  page,
}) => {
  const engine = await installEngineFixtures(page);
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Opening candidates' })).toBeVisible();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect
    .poll(async () => (await engine.requests()).filter((r) => r.type === 'INITIALIZE').length)
    .toBe(1);
  await engine.releaseReady();
  await page.getByRole('button', { name: 'Run review (Start analysis)', exact: true }).click();
  const nextMove = page.getByRole('button', { name: 'Next move', exact: true });
  await nextMove.click();
  const scrollBeforeProgress = await page.evaluate(() => window.scrollY);
  // Adjacent annotations share their boundary position: two evaluations complete ply 1.
  await engine.releaseEvaluations(2);
  await expect
    .poll(async () => (await engine.requests()).filter((r) => r.type === 'EVALUATE').length)
    .toBe(3);
  await expect(page.getByRole('progressbar', { name: 'Review progress' })).toHaveAttribute(
    'aria-valuenow',
    '1'
  );
  await expect(nextMove).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeProgress);
  const pending = (await engine.requests())
    .filter((r): r is Extract<EngineWorkerRequest, { type: 'EVALUATE' }> => r.type === 'EVALUATE')
    .at(-1)!;
  await page.getByRole('button', { name: 'Cancel analysis', exact: true }).click();
  // Current scheduler does not forward the parent abort into an active evaluation.
  // Settle that held request explicitly; later lifecycle tasks own this behavior.
  await engine.deliver({
    protocolVersion: 1,
    jobId: pending.jobId,
    type: 'FAILED',
    code: 'ABORTED',
    message: 'Analysis aborted.',
  });
  await page.locator('.review-summary > summary').click();
  await expect(
    page
      .getByRole('region', { name: 'Game Review Summary', exact: true })
      .getByText('Coverage: 1 of 8 eligible plies', { exact: true })
  ).toBeVisible();
  await engine.deliver({
    protocolVersion: 1,
    jobId: pending.jobId,
    type: 'RESULT',
    result: createEvaluationFixture(pending.fen),
  });
  await expect(
    page
      .getByRole('region', { name: 'Game Review Summary', exact: true })
      .getByText('Coverage: 1 of 8 eligible plies', { exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: /opponent-one/i }).click();
  await expect(
    page
      .getByRole('region', { name: 'Game Review Summary', exact: true })
      .getByText('Coverage: 1 of 8 eligible plies', { exact: true })
  ).toHaveCount(0);
  await engine.reset();
  expect(await engine.requests()).toEqual([]);
});

test('controls READY, failure, STOP, stale job delivery, disposal and per-document reset', async ({
  page,
}) => {
  const engine = await installEngineFixtures(page, { delayMs: 5 });
  await page.goto('/');
  await page.evaluate(() => {
    const worker = new Worker('/test-owned-worker-not-fetched.js');
    const state = window as unknown as { fixtureWorker: Worker; replies: unknown[] };
    state.fixtureWorker = worker;
    state.replies = [];
    worker.onmessage = (e) => state.replies.push(e.data);
    worker.postMessage({
      protocolVersion: 1,
      jobId: 'init',
      type: 'INITIALIZE',
      mode: 'single-thread',
      resources: { threads: 1, hashMb: 16 },
    });
  });
  expect((await engine.requests()).map((r) => r.jobId)).toEqual(['init']);
  expect(await page.evaluate(() => (window as unknown as { replies: unknown[] }).replies)).toEqual(
    []
  );
  await engine.releaseReady();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { replies: unknown[] }).replies))
    .toEqual([{ protocolVersion: 1, jobId: 'init', type: 'READY' }]);
  await engine.failNextInitialization();
  await page.evaluate(() =>
    (window as unknown as { fixtureWorker: Worker }).fixtureWorker.postMessage({
      protocolVersion: 1,
      jobId: 'bad-init',
      type: 'INITIALIZE',
      mode: 'single-thread',
      resources: { threads: 1, hashMb: 16 },
    })
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { replies: { type: string }[] }).replies.at(-1)?.type
      )
    )
    .toBe('FAILED');
  await page.evaluate(() => {
    const w = (window as unknown as { fixtureWorker: Worker }).fixtureWorker;
    w.postMessage({
      protocolVersion: 1,
      jobId: 'held',
      type: 'EVALUATE',
      fen: 'missing',
      limit: { depth: 12 },
      multiPv: 2,
    });
    w.postMessage({ protocolVersion: 1, jobId: 'stop', type: 'STOP' });
  });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { replies: unknown[] }).replies))
    .toContainEqual({
      protocolVersion: 1,
      jobId: 'held',
      type: 'FAILED',
      code: 'ABORTED',
      message: 'Analysis aborted.',
    });
  await engine.deliver({
    protocolVersion: 1,
    jobId: 'held',
    type: 'RESULT',
    result: { bestMove: '0000', lines: [] },
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { replies: { type: string }[] }).replies.at(-1)?.type
      )
    )
    .toBe('RESULT');
  await page.evaluate(() =>
    (window as unknown as { fixtureWorker: Worker }).fixtureWorker.terminate()
  );
  const before = await page.evaluate(
    () => (window as unknown as { replies: unknown[] }).replies.length
  );
  await engine.deliver({ protocolVersion: 1, jobId: 'held', type: 'READY' });
  expect(
    await page.evaluate(() => (window as unknown as { replies: unknown[] }).replies.length)
  ).toBe(before);
  await page.reload();
  expect(await engine.requests()).toEqual([]);
});

for (const scenario of ['mate', 'indeterminate'] as const) {
  test(`provides ${scenario} evaluation responses`, async ({ page }) => {
    const engine = await installEngineFixtures(page, {
      manualReady: false,
      manualEvaluations: false,
      ...(scenario === 'mate' ? { score: { kind: 'mate', value: 3 } } : { indeterminate: true }),
    });
    await installWorkspaceFixtures(page);
    await page.goto('/?engine=single');
    await loadFixtureGames(page);
    await page.getByRole('button', { name: /opponent-two/i }).click();
    await page.getByRole('button', { name: 'Review', exact: true }).click();
    await page.getByRole('button', { name: 'Run review (Start analysis)', exact: true }).click();
    await page.locator('.review-summary > summary').click();
    await expect(page.getByRole('heading', { name: 'Game Review Summary' })).toBeVisible();
    expect((await engine.requests()).filter((r) => r.type === 'EVALUATE').length).toBe(9);
  });
}

test('routes copied scope records, oldest-first archives and long names deterministically', async ({
  page,
}) => {
  await installOpeningScopeWorkspaceFixtures(page);
  await page.goto('/');
  const scope = await page.evaluate(async () =>
    (await fetch('https://api.chess.com/pub/player/audit-player/games/2024/01')).json()
  );
  expect(scope.games).toHaveLength(20);
  expect(scope.games[0].uuid).toBe('audit-0');
  expect(scope.games[19].uuid).toBe('audit-19');
  await installOldestFirstWorkspaceFixtures(page);
  const archives = await page.evaluate(async () =>
    (await fetch('https://api.chess.com/pub/player/fixture-user/games/archives')).json()
  );
  expect(archives.archives).toEqual([
    'https://api.chess.com/pub/player/fixture-user/games/2023/12',
    'https://api.chess.com/pub/player/fixture-user/games/2024/01',
  ]);
  const older = await page.evaluate(async () =>
    (await fetch('https://api.chess.com/pub/player/fixture-user/games/2023/12')).json()
  );
  expect(older.games[0].uuid).toBe('fixture-older-game');
  await installLongNameWorkspaceFixtures(page);
  await loadFixtureGames(page, 1);
  await expect(
    page.getByRole('button', { name: /opponent-with-a-very-long-name-for-layout-regressions/ })
  ).toBeVisible();
});

test('retries failed initialization while preserving playback and Openings', async ({
  page,
}, testInfo) => {
  const engine = await installEngineFixtures(page, {
    failInitialization: true,
    manualReady: false,
  });
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry engine' })).toBeEnabled();
  await page.getByRole('button', { name: /select ply 1\b/i }).click();
  await engine.failNextInitialization();
  await page.getByRole('button', { name: 'Retry engine' }).click();
  await expect(page.getByRole('button', { name: 'Retry engine' })).toBeEnabled();
  await expect(page.getByText('Playback and Openings remain available.')).toBeVisible();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.screenshot({
      path: testInfo.outputPath(`retry-engine-${viewport.width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Openings', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Opening candidates' })).toBeVisible();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Retry engine' }).click();
  await expect(page.getByText('Ready to review', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /select ply 1\b/i })).toHaveAttribute(
    'aria-current',
    'true'
  );
  expect((await engine.requests()).filter((request) => request.type === 'INITIALIZE')).toHaveLength(
    3
  );
});

test('one explicit Review game action starts once, then reopens its saved review without an engine', async ({
  page,
}) => {
  const engine = await installEngineFixtures(page);
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
  await expect(page.getByText('Checking analysis engine…')).toBeVisible();
  await engine.releaseReady();
  await expect(page.getByRole('progressbar', { name: 'Review progress' })).toBeVisible();
  await engine.releaseEvaluations(100);
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  const evaluations = (await engine.requests()).filter(
    (request) => request.type === 'EVALUATE'
  ).length;
  expect(evaluations).toBe(9);
  expect((await engine.requests()).filter((request) => request.type === 'INITIALIZE')).toHaveLength(
    1
  );
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  expect((await engine.requests()).filter((request) => request.type === 'EVALUATE')).toHaveLength(
    evaluations
  );
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: /opponent-two/i })).toBeVisible();
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  expect(
    (await engine.requests()).filter((request) => ['INITIALIZE', 'EVALUATE'].includes(request.type))
  ).toEqual([]);
});

test('switching game or view during readiness cancels the pending automatic start', async ({
  page,
}) => {
  const engine = await installEngineFixtures(page);
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review game', exact: true }).click();
  await expect(page.getByText('Checking analysis engine…')).toBeVisible();
  await expect
    .poll(async () => (await engine.requests()).filter((r) => r.type === 'INITIALIZE').length)
    .toBe(1);
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: /opponent-one/i }).click();
  await engine.releaseReady();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByText('Ready to review')).toBeVisible();
  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
  expect((await engine.requests()).filter((r) => r.type === 'EVALUATE')).toEqual([]);
});

test('keeps Summary open and focused when review progress arrives', async ({ page }) => {
  const engine = await installEngineFixtures(page, { manualReady: false });
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Run review (Start analysis)', exact: true }).click();
  const summary = page.locator('.review-summary > summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(summary.locator('..')).toHaveAttribute('open', '');
  await engine.releaseEvaluations(2);
  await expect(page.getByRole('progressbar', { name: 'Review progress' })).toHaveAttribute(
    'aria-valuenow',
    '1'
  );
  await expect(summary).toBeFocused();
  await expect(summary.locator('..')).toHaveAttribute('open', '');
});

test('keeps the review position and move list stable through completion and disclosures', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const engine = await installEngineFixtures(page, { manualReady: false });
  await installWorkspaceFixtures(page);
  await page.goto('/?engine=single');
  await loadFixtureGames(page);
  await page.getByRole('button', { name: /opponent-two/i }).click();
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.getByRole('button', { name: 'Run review (Start analysis)', exact: true }).click();
  await page.getByRole('button', { name: 'Next move', exact: true }).click();
  const moveList = page.locator('.analysis-move-list');
  const before = await moveList.boundingBox();
  await engine.releaseEvaluations(20);
  await expect(page.getByText('Review complete', { exact: true })).toBeVisible();
  const after = await moveList.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
  const summary = page.locator('.review-summary > summary');
  await summary.click();
  await expect(page.getByLabel('Position 1 of 8')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Review', selected: true })).toBeVisible();
  await expect(page.locator('.review-header')).toContainText('opponent-two');
  await summary.click();
  const beforeSettings = await moveList.boundingBox();
  await page.locator('.analysis-settings-disclosure > summary').click();
  const afterSettings = await moveList.boundingBox();
  expect(Math.abs(afterSettings!.y - beforeSettings!.y)).toBeLessThanOrEqual(1);
});
