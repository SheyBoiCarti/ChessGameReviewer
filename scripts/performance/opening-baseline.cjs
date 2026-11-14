/* Production-only measurement. Routing instrumentation never changes repository assets. */
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { gzipSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const base = require('../../tests/fixtures/openingScopeGames.json');
const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
const outputDir = process.env.PERF_OUTPUT_DIR;
if (!baseUrl || !outputDir) throw new Error('Set PLAYWRIGHT_BASE_URL and PERF_OUTPUT_DIR');
const buildId = fs.readFileSync('.next/BUILD_ID', 'utf8').trim();
const counts = [20, 100, 500];
if (fs.existsSync(path.join(outputDir, 'baseline.json')) && process.env.PERF_RESUME !== '1')
  throw new Error(
    'Choose a new PERF_OUTPUT_DIR, or use PERF_RESUME=1 for an identical-build recovery'
  );
fs.mkdirSync(outputDir, { recursive: true });

// Also runs inside dedicated worker bundles. Actual strict loadPgn calls are counted,
// separately from RPC requests, including repeats and warm-cache validation.
const parseProbe = `globalThis.__baselineParse = (chess, ...args) => {
  const start = performance.timeOrigin + performance.now();
  try { return chess.loadPgn(...args); }
  finally {
    const event = {kind:'parse', start, end:performance.timeOrigin + performance.now(), strict:args[1]?.strict === true, stack:new Error().stack?.split('\\n').slice(1), view:typeof document === 'undefined' ? 'worker' : new URL(location.href).searchParams.get('view')};
    if (typeof document === 'undefined') self.postMessage({__baseline:event});
    else window.__baseline.events.push(event);
  }
};\n`;

async function instrument(page) {
  await page.addInitScript(() => {
    const now = () => performance.timeOrigin + performance.now();
    window.__baseline = {
      events: [],
      messages: [],
      responses: [],
      transactions: [],
      reads: [],
      workers: 0,
      longTasks: [],
    };
    new PerformanceObserver((list) => {
      for (const task of list.getEntries())
        window.__baseline.longTasks.push({
          start: performance.timeOrigin + task.startTime,
          duration: task.duration,
          name: task.name,
        });
    }).observe({ type: 'longtask', buffered: true });
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        const worker = ++window.__baseline.workers;
        this.addEventListener('message', ({ data }) => {
          if (data.__baseline) window.__baseline.events.push({ ...data.__baseline, worker });
          else
            window.__baseline.responses.push({
              at: now(),
              worker,
              jobId: data.jobId,
              type: data.type,
              parsedCount: data.parsedCount,
              builtCount: data.builtCount,
              included: data.snapshot?.includedGameCount,
            });
        });
        const post = this.postMessage;
        this.postMessage = function (data, ...rest) {
          window.__baseline.messages.push({
            at: now(),
            worker,
            jobId: data.jobId,
            type: data.type,
            games: data.games?.length,
          });
          return post.call(this, data, ...rest);
        };
      }
    };
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key) {
      const entry = { key: String(key), store: this.name, start: now() };
      const request = get.call(this, key);
      request.addEventListener('success', () => {
        entry.end = now();
        entry.hit = request.result !== undefined;
      });
      window.__baseline.reads.push(entry);
      return request;
    };
    const transact = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, ...rest) {
      const entry = {
        stores: Array.from(typeof stores === 'string' ? [stores] : stores),
        mode: rest[0] ?? 'readonly',
        start: now(),
      };
      const transaction = transact.call(this, stores, ...rest);
      transaction.addEventListener('complete', () => {
        entry.end = now();
      });
      window.__baseline.transactions.push(entry);
      return transaction;
    };
  });
  page.__baselineRouteErrors = [];
  await page.route('**/*.js*', async (route) => {
    try {
      if (new URL(route.request().url()).origin !== new URL(baseUrl).origin) return route.abort();
      const response = await route.fetch({ maxRetries: 2 });
      const source = await response.text();
      const modified = source.replace(
        /([A-Za-z_$][\w$]*)\.loadPgn\(/g,
        'globalThis.__baselineParse($1,'
      );
      await route.fulfill({ response, body: modified === source ? source : parseProbe + modified });
    } catch (error) {
      if (!page.__baselineClosing && !page.isClosed()) {
        page.__baselineRouteErrors.push(String(error));
        await route.abort().catch(() => {});
      }
    }
  });
}
async function navigate(page, name) {
  const target = page.getByRole('button', { name, exact: true });
  if (!(await target.isVisible()))
    await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  await target.click();
}
const now = (page) => page.evaluate(() => performance.timeOrigin + performance.now());
async function painted(page) {
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
}

async function startTrace(page) {
  const session = await page.context().newCDPSession(page);
  await session.send('Tracing.start', {
    categories: 'toplevel,devtools.timeline,v8,blink.user_timing',
    transferMode: 'ReturnAsStream',
  });
  return async (file) => {
    const done = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
    await session.send('Tracing.end');
    const { stream } = await done;
    let text = '';
    for (;;) {
      const chunk = await session.send('IO.read', { handle: stream });
      text += chunk.data;
      if (chunk.eof) break;
    }
    await session.send('IO.close', { handle: stream });
    fs.writeFileSync(file, gzipSync(text));
    const events = JSON.parse(text).traceEvents;
    const longTasks = events.filter(
      (e) => e.ph === 'X' && e.dur > 50000 && /RunTask$/.test(e.name)
    );
    const attribution = longTasks.map((task) => ({
      durationMs: task.dur / 1000,
      name: task.name,
      threadName: events.find(
        (event) =>
          event.ph === 'M' &&
          event.name === 'thread_name' &&
          event.pid === task.pid &&
          event.tid === task.tid
      )?.args?.name,
      process: task.pid,
      thread: task.tid,
      calls: events
        .filter(
          (e) =>
            e.pid === task.pid &&
            e.tid === task.tid &&
            e.ts >= task.ts &&
            e.ts < task.ts + task.dur &&
            ['FunctionCall', 'EvaluateScript', 'v8.compile', 'Layout', 'UpdateLayoutTree'].includes(
              e.name
            )
        )
        .map((e) => ({ name: e.name, durationMs: (e.dur ?? 0) / 1000, data: e.args?.data })),
    }));
    await session.detach();
    return attribution;
  };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const results =
      process.env.PERF_RESUME === '1'
        ? JSON.parse(fs.readFileSync(path.join(outputDir, 'baseline.json'), 'utf8'))
        : [];
    if (
      results.some(
        (sample) =>
          sample.environment.buildId !== buildId || sample.environment.browser !== browser.version()
      )
    )
      throw new Error('Resume requires the identical build and browser');
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      for (const count of counts) {
        for (const engineState of ['idle', 'active']) {
          const matches = (sample) =>
            sample.count === count &&
            sample.engineState === engineState &&
            sample.viewport.width === viewport.width;
          const previous = results.filter(matches);
          const sampleKeys = new Set(
            previous.map((sample) => `${sample.coldContext}:${sample.repetition}`)
          );
          const expectedKeys = [
            '0:0',
            '1:0',
            '2:0',
            '3:0',
            ...Array.from({ length: 11 }, (_, i) => `4:${i}`),
          ];
          if (previous.length === 15 && expectedKeys.every((key) => sampleKeys.has(key))) continue;
          // Recover only incomplete groups, rerunning all five cold contexts and ten warm
          // repetitions in that group. A completed group is never mixed with a new cache.
          for (let i = results.length - 1; i >= 0; i--)
            if (matches(results[i])) results.splice(i, 1);
          // Five independent cold contexts, then ten repetitions on the fifth context's IndexedDB.
          for (let coldContext = 0; coldContext < 5; coldContext++) {
            const context = await browser.newContext({ viewport });
            let page;
            try {
              page = await context.newPage();
              page.setDefaultTimeout(60000);
              await instrument(page);
              const games = Array.from({ length: count }, (_, i) => ({
                ...base[i % 20],
                uuid: `perf-${i}`,
                url: `https://www.chess.com/game/live/${520000000 + i}`,
              }));
              const network = [];
              await page.route('https://api.chess.com/**', async (route) => {
                const start = Date.now(),
                  url = route.request().url();
                await route.fulfill({
                  contentType: 'application/json',
                  body: JSON.stringify(
                    url.endsWith('/archives')
                      ? {
                          archives: ['https://api.chess.com/pub/player/audit-player/games/2024/01'],
                        }
                      : url.endsWith('/2024/01')
                        ? { games }
                        : {}
                  ),
                });
                network.push({
                  url,
                  start,
                  end: Date.now(),
                  source: 'local deterministic route; no upstream latency',
                });
              });
              await page.addInitScript(() =>
                localStorage.setItem(
                  'chess-game-reviewer:preferences',
                  JSON.stringify({ analysisStrength: 'deep' })
                )
              );
              await page.goto(`${baseUrl}/?engine=single`);
              const serverBuildId = await page
                .locator('script')
                .evaluateAll((scripts) => scripts.map((s) => s.textContent).join('\n'));
              if (!serverBuildId.includes(buildId))
                throw new Error('Server build ID differs from .next/BUILD_ID');
              await page.getByLabel('Username', { exact: true }).fill('audit-player');
              await page.getByRole('button', { name: 'Game filters', exact: true }).click();
              await page.getByRole('radio', { name: 'Custom', exact: true }).click();
              await page.getByLabel('From date').fill('2024-01-01');
              await page.getByLabel('To date').fill('2024-01-31');
              await page.getByLabel('Maximum games').fill(String(count));
              await page.getByLabel('Black games', { exact: true }).uncheck();
              const repetitions = coldContext === 4 ? 11 : 1;
              for (let repetition = 0; repetition < repetitions; repetition++) {
                const cacheState = repetition === 0 ? 'cold' : 'warm';
                if (repetition > 0) {
                  await page.getByRole('button', { name: 'Import games', exact: true }).click();
                }
                const traceName = `${viewport.width}-${count}-${engineState}-${cacheState}-trace.json.gz`;
                const stopTrace =
                  coldContext === 4 && repetition <= 1 ? await startTrace(page) : null;
                const start = await now(page);
                await page.getByRole('button', { name: 'Find games', exact: true }).click();
                if (repetition > 0)
                  await page
                    .getByRole('dialog', { name: 'Import games' })
                    .waitFor({ state: 'hidden' });
                await page.getByText(`${count * 0.6} games loaded`, { exact: true }).waitFor();
                await page.getByRole('list', { name: 'Games', exact: true }).waitFor();
                const imported = await now(page);
                const graphWait = page.waitForFunction(
                  (since) =>
                    window.__baseline.responses.some((e) => e.at >= since && e.type === 'COMPLETE'),
                  start
                );
                // Attach a handler immediately; context teardown must not turn a later
                // graph wait into an unhandled rejection hiding the original failure.
                void graphWait.catch(() => {});
                const reviewStart = await now(page);
                await navigate(page, 'Review');
                await page
                  .getByRole('heading', { name: 'Local Stockfish analysis', exact: true })
                  .waitFor();
                await page.getByLabel('Position 0 of 6').waitFor();
                await painted(page);
                const reviewReady = await now(page);
                // Review navigation itself must be measured separately from engine readiness.
                let engineActiveAtNavigation = false;
                if (engineState === 'active') {
                  // Imports are warm; evaluation cache is deliberately cold so the active
                  // workload remains real work on every repetition rather than a cache hit.
                  await page.evaluate(async () => {
                    const databases = await indexedDB.databases();
                    if (!databases[0]) return;
                    await new Promise((resolve, reject) => {
                      const request = indexedDB.open(databases[0].name);
                      request.onsuccess = () => {
                        const database = request.result;
                        const transaction = database.transaction('evaluations', 'readwrite');
                        transaction.objectStore('evaluations').clear();
                        transaction.oncomplete = () => {
                          database.close();
                          resolve();
                        };
                        transaction.onerror = () => reject(transaction.error);
                      };
                    });
                  });
                  const run = page.getByRole('button', {
                    name: /^(Run review \(Start analysis\)|Resume analysis|Run again)$/,
                  });
                  await run.waitFor();
                  await run.click();
                  await page.waitForFunction(
                    (since) =>
                      window.__baseline.messages.some(
                        (e) => e.at >= since && e.type === 'EVALUATE'
                      ),
                    reviewStart
                  );
                  engineActiveAtNavigation = await page
                    .getByRole('button', { name: 'Cancel analysis', exact: true })
                    .isVisible();
                  if (!engineActiveAtNavigation) throw new Error('Active engine sample was idle');
                }
                if (engineState === 'idle') {
                  await page
                    .getByRole('button', { name: 'Run review (Start analysis)', exact: true })
                    .waitFor();
                }
                const engineReady = await now(page);
                await navigate(page, 'Games');
                const engineReviewStart = await now(page);
                await navigate(page, 'Review');
                await page
                  .getByRole('heading', { name: 'Local Stockfish analysis', exact: true })
                  .waitFor();
                await painted(page);
                const engineReviewReady = await now(page);
                if (
                  engineState === 'active' &&
                  !(await page
                    .getByRole('button', { name: 'Cancel analysis', exact: true })
                    .isVisible())
                )
                  throw new Error('Engine stopped before active Review entry was measured');
                const navigationStart = await now(page);
                const board = page.getByRole('grid', { name: 'Chess board' });
                for (let i = 0; i < 6; i++) await board.press('ArrowRight');
                await page.getByLabel('Position 6 of 6').waitFor();
                await board.press('Home');
                await page.getByLabel('Position 0 of 6').waitFor();
                const navigationEnd = await now(page);
                if (engineState === 'active') {
                  await page.getByRole('button', { name: 'Cancel analysis', exact: true }).click();
                  await page
                    .getByText('Stopping analysis…', { exact: true })
                    .waitFor({ state: 'hidden' });
                }
                const gameNavigationStart = await now(page);
                await navigate(page, 'Games');
                const previews = page
                  .getByRole('list', { name: 'Games', exact: true })
                  .getByRole('button', { name: /^Preview/ });
                await previews.nth(1).click();
                await previews.first().click();
                const gameNavigationEnd = await now(page);
                await navigate(page, 'Review');
                await page
                  .getByRole('heading', { name: 'Local Stockfish analysis', exact: true })
                  .waitFor();
                await painted(page);
                if (coldContext === 4 && repetition <= 1)
                  await page.screenshot({
                    path: path.join(
                      outputDir,
                      `${viewport.width}-${count}-${engineState}-${cacheState}-review.png`
                    ),
                    fullPage: true,
                  });
                // Visit Openings only AFTER measuring Games/Review so its membership callsite
                // can identify actual bulk replay rather than inferring it from worker RPCs.
                await graphWait;
                const graphReady = await now(page);
                const scopeStart = await now(page);
                await navigate(page, 'Openings');
                await page
                  .getByRole('table', { name: 'Opening candidates', exact: true })
                  .waitFor();
                await painted(page);
                const ready = await now(page);
                if (coldContext === 4 && repetition <= 1)
                  await page.screenshot({
                    path: path.join(
                      outputDir,
                      `${viewport.width}-${count}-${engineState}-${cacheState}-openings.png`
                    ),
                    fullPage: true,
                  });
                const audit = await page.evaluate(() => window.__baseline);
                const parses = audit.events.filter((e) => e.start >= start && e.end <= ready);
                const openingCallsites = new Set(
                  parses
                    .filter((e) => !e.worker && e.start >= scopeStart)
                    .map((e) => {
                      const index = e.stack?.findIndex((frame) => frame.includes('Array.map'));
                      return index > 0 ? e.stack[index - 1] : null;
                    })
                    .filter(Boolean)
                );
                if (!openingCallsites.size)
                  throw new Error('Opening membership parse callsite was not observed');
                const bulkOpeningReplayCount = parses.filter(
                  (e) =>
                    !e.worker &&
                    e.start < scopeStart &&
                    e.stack?.some((frame) => openingCallsites.has(frame))
                ).length;
                const navigationMonthlyRequests = network.filter(
                  (e) =>
                    e.start >= navigationStart &&
                    e.start <= gameNavigationEnd &&
                    /games\/\d{4}\/\d{2}$/.test(e.url)
                ).length;
                if (bulkOpeningReplayCount)
                  throw new Error('Games/Review replayed opening membership');
                if (navigationMonthlyRequests)
                  throw new Error('Move navigation fetched an archive');
                const traceAttribution = stopTrace
                  ? await stopTrace(path.join(outputDir, traceName))
                  : null;
                if (page.__baselineRouteErrors.length)
                  throw new Error(page.__baselineRouteErrors.join('\n'));
                results.push({
                  count,
                  cacheState,
                  coldContext,
                  repetition,
                  viewport,
                  engineState,
                  engineActiveAtNavigation,
                  bulkOpeningReplayCount,
                  navigationMonthlyRequests,
                  openingMembershipCallsites: [...openingCallsites],
                  stages: {
                    importMs: imported - start,
                    selectedReviewReadyMs: reviewReady - start,
                    reviewRenderMs: reviewReady - reviewStart,
                    engineSetupMs: engineReady - reviewReady,
                    reviewRenderWithEngineMs: engineReviewReady - engineReviewStart,
                    navigationMs: navigationEnd - navigationStart,
                    gameNavigationMs: gameNavigationEnd - gameNavigationStart,
                    scopeToCandidateMs: ready - scopeStart,
                  },
                  action: {
                    start,
                    imported,
                    reviewStart,
                    reviewReady,
                    engineReady,
                    engineReviewStart,
                    engineReviewReady,
                    navigationStart,
                    navigationEnd,
                    gameNavigationStart,
                    gameNavigationEnd,
                    graphReady,
                    scopeStart,
                    ready,
                  },
                  parseCounts: {
                    strict: parses.filter((e) => e.strict).length,
                    other: parses.filter((e) => !e.strict).length,
                    gamesAndReviewMainThread: parses.filter(
                      (e) => !e.worker && e.start < scopeStart
                    ).length,
                  },
                  messages: audit.messages.filter((e) => e.at >= start),
                  responses: audit.responses.filter((e) => e.at >= start),
                  reads: audit.reads.filter((e) => e.start >= start),
                  transactions: audit.transactions.filter((e) => e.start >= start),
                  longTasks: audit.longTasks.filter((e) => e.start >= start && e.start <= ready),
                  trace: stopTrace ? traceName : null,
                  traceAttribution,
                  network: network.filter((e) => e.start >= start),
                  environment: {
                    buildId,
                    checkout: execFileSync('git', ['rev-parse', 'HEAD'], {
                      encoding: 'utf8',
                    }).trim(),
                    browser: browser.version(),
                    baseUrl,
                    node: process.version,
                    platform: `${os.platform()} ${os.release()}`,
                    cpu: os.cpus()[0]?.model,
                    fixture: '20 legal six-ply records repeated; 60% White; White-only import',
                    cache:
                      'Five fresh IndexedDB contexts; ten warm imports on fifth. Game/graph/review caches retained; engine evaluation cache cleared before each active run to ensure real work. Routing disables HTTP cache.',
                    instrumentation:
                      'Actual loadPgn wrapper, Worker/IDB probes, Long Tasks API, CDP timeline traces on fifth cold and first warm.',
                  },
                });
                fs.writeFileSync(
                  path.join(outputDir, 'baseline.json'),
                  JSON.stringify(results, null, 2)
                );
                console.log(
                  viewport.width,
                  count,
                  engineState,
                  cacheState,
                  coldContext,
                  repetition,
                  Math.round(reviewReady - start),
                  'ms review ready'
                );
              }
            } finally {
              if (page) page.__baselineClosing = true;
              await context.close();
            }
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
