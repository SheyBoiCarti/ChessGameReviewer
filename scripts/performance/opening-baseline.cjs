/* Production-only measurement. Routing instrumentation never changes repository assets. */
const { chromium, expect: playwrightExpect } = require('@playwright/test');
// Observation deadlines allow long cold workloads to finish. Performance targets
// remain separate and are evaluated from the recorded, uncapped elapsed times.
const observationTimeoutMs = 120000;
const expect = playwrightExpect.configure({ timeout: observationTimeoutMs });
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { gzipSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const harnessSha = createHash('sha256')
  .update(fs.readFileSync(__filename))
  .update(fs.readFileSync(require.resolve('./opening-workloads.cjs')))
  .digest('hex');
const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
const outputDir = process.env.PERF_OUTPUT_DIR;
if (!baseUrl || !outputDir) throw new Error('Set PLAYWRIGHT_BASE_URL and PERF_OUTPUT_DIR');
const buildId = fs.readFileSync('.next/BUILD_ID', 'utf8').trim();
const { workloads } = require('./opening-workloads.cjs');
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
              resources: data.snapshot
                ? {
                    snapshotBytes: new TextEncoder().encode(JSON.stringify(data.snapshot))
                      .byteLength,
                    positions: data.snapshot.positions.length,
                    paths: data.snapshot.paths.length,
                    edges: data.snapshot.positions.reduce((n, p) => n + p.edges.length, 0),
                  }
                : undefined,
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
      if (response.headers()['x-opening-replay-probe'] === '1') return route.fulfill({ response });
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

const percentile = (values, q) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
const selected = process.env.PERF_WORKLOADS?.split(',');
const widths = process.env.PERF_WIDTHS?.split(',').map(Number) ?? [1440, 390];
const states = process.env.PERF_ENGINES?.split(',') ?? ['idle', 'active'];
async function countsSince(page, since) {
  return page.evaluate((since) => {
    const audit = window.__baseline;
    return {
      workerReplays: audit.events.filter((e) => e.worker && e.start >= since).length,
      mainReplays: audit.events.filter((e) => !e.worker && e.start >= since).length,
      validations: audit.messages.filter((e) => e.at >= since && e.type === 'VALIDATE_PGNS').length,
      builds: audit.messages.filter((e) => e.at >= since && e.type === 'BUILD_GRAPH').length,
      longTasks: audit.longTasks.filter((e) => e.start >= since),
    };
  }, since);
}
async function waitForOpeningBuilds(page, since, expectedJobs) {
  await page.waitForFunction(
    ({ since, expectedJobs }) => {
      const audit = window.__baseline;
      const jobs = audit.messages.filter(
        (message) => message.at >= since && message.type === 'BUILD_GRAPH'
      );
      const terminal = new Set(
        audit.responses
          .filter((response) =>
            ['COMPLETE', 'PARTIAL', 'LIMITED', 'FAILED', 'CANCELLED'].includes(response.type)
          )
          .map((response) => response.jobId)
      );
      return jobs.length >= expectedJobs && jobs.every((job) => terminal.has(job.jobId));
    },
    { since, expectedJobs }
  );
}
async function ready(page) {
  await expect(page.getByRole('table', { name: 'Opening candidates', exact: true })).toBeVisible();
  await expect(page.getByText('Preparing opening candidates…', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Play / }).first()).toBeEnabled();
  await painted(page);
}
async function submit(page, count, first) {
  if (!first) await page.getByRole('button', { name: 'Import games', exact: true }).click();
  await page.getByRole('button', { name: 'Find games', exact: true }).click();
  await expect(page.getByText(`${count} games loaded`, { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Import games' })).toBeHidden();
  await navigate(page, 'Openings');
  await ready(page);
}
(async () => {
  const browser = await chromium.launch();
  const results =
    process.env.PERF_RESUME === '1'
      ? JSON.parse(fs.readFileSync(path.join(outputDir, 'baseline.json'), 'utf8'))
      : [];
  if (
    results.some(
      (s) =>
        s.environment.buildId !== buildId ||
        s.environment.browser !== browser.version() ||
        s.environment.harnessSha !== harnessSha
    )
  )
    throw new Error('Resume requires identical build/browser');
  const environment = {
    harnessSha,
    buildId,
    checkout: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }),
    browser: browser.version(),
    baseUrl,
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    cpu: os.cpus()[0]?.model,
    timing:
      'Browser timestamp from action initiation through candidate readiness + two animation frames. Instrumentation/automation included; not physical paint or real-phone INP.',
    network: 'Deterministic local API routes; HTTP cache disabled by routing.',
    engine:
      'Local single-thread Stockfish; deep analysis with cold evaluation cache for active samples.',
    observationTimeoutMs,
  };
  const save = () => {
    fs.writeFileSync(path.join(outputDir, 'baseline.json'), JSON.stringify(results, null, 2));
    const groups = [
      ...new Set(results.map((s) => `${s.workload}/${s.width}/${s.engineState}/${s.cacheState}`)),
    ].map((key) => {
      const group = results.filter(
        (s) => `${s.workload}/${s.width}/${s.engineState}/${s.cacheState}` === key
      );
      return {
        key,
        samples: group.length,
        medianReadyMs: percentile(
          group.map((s) => s.readyMs),
          0.5
        ),
        p95ReadyMs: percentile(
          group.map((s) => s.readyMs),
          0.95
        ),
        maxWorkerReplays: Math.max(...group.map((s) => s.operations.workerReplays)),
        maxBuilds: Math.max(...group.map((s) => s.operations.builds)),
        navigationP95Ms: percentile(
          group.flatMap((s) => s.navigation?.durations ?? []),
          0.95
        ),
      };
    });
    fs.writeFileSync(
      path.join(outputDir, 'summary.json'),
      JSON.stringify(
        {
          environment,
          groups,
          limitations: [
            'No same-build pre-optimization comparison exists; the 40%/60% improvement targets cannot be claimed.',
            'CDP heap is main renderer heap only; snapshot and IndexedDB bytes are storage accounting, not total process memory.',
            'Mobile is a viewport emulation, not real-device INP.',
            'Import readiness is measured before engine start; active scenarios separately measure tree entry and scope/navigation while real Stockfish runs.',
          ],
        },
        null,
        2
      )
    );
  };
  try {
    for (const workload of workloads.filter((w) => !selected || selected.includes(w.name))) {
      const games = workload.games();
      if (new Set(games.map((g) => g.pgn)).size < (workload.plies > 6 ? 1000 : 1))
        throw new Error('Diverse workload is not diverse');
      for (const width of widths)
        for (const engineState of states) {
          const group = (s) =>
            s.workload === workload.name && s.width === width && s.engineState === engineState;
          const diskReport = path.join(
            outputDir,
            `${workload.name}-${width}-${engineState}-disk.json`
          );
          if (results.filter(group).length === 15 && fs.existsSync(diskReport)) continue;
          // Restart incomplete groups; never mix cache lifetimes across resumed processes.
          for (let i = results.length - 1; i >= 0; i--) if (group(results[i])) results.splice(i, 1);
          for (let coldContext = 0; coldContext < 5; coldContext++) {
            const context = await browser.newContext({
              viewport: { width, height: width === 390 ? 844 : 1000 },
            });
            const page = await context.newPage();
            page.setDefaultTimeout(observationTimeoutMs);
            const network = [];
            page.on('request', (request) => network.push({ at: Date.now(), url: request.url() }));
            try {
              await instrument(page);
              await page.route('https://api.chess.com/**', (route) => {
                const url = route.request().url();
                return route.fulfill({
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
              });
              await page.addInitScript(() =>
                localStorage.setItem(
                  'chess-game-reviewer:preferences',
                  JSON.stringify({ analysisStrength: 'deep' })
                )
              );
              await page.goto(`${baseUrl}/?engine=single`);
              const source = await page
                .locator('script')
                .evaluateAll((scripts) => scripts.map((s) => s.textContent).join('\n'));
              if (!source.includes(buildId))
                throw new Error('Server build does not match .next/BUILD_ID');
              await page.getByLabel('Username', { exact: true }).fill('audit-player');
              await page.getByRole('button', { name: 'Game filters', exact: true }).click();
              await page.getByRole('radio', { name: 'Custom', exact: true }).click();
              await page.getByLabel('From date').fill('2024-01-01');
              await page.getByLabel('To date').fill('2024-01-31');
              await page.getByLabel('Maximum games').fill(String(workload.count));
              for (let repetition = 0; repetition < (coldContext === 4 ? 11 : 1); repetition++) {
                const traceName = `${workload.name}-${width}-${engineState}-${repetition}-trace.json.gz`;
                const stopTrace =
                  coldContext === 4 && repetition <= 1 ? await startTrace(page) : null;
                const start = await now(page);
                await submit(page, games.length, repetition === 0);
                const end = await now(page);
                const operations = await countsSince(page, start);
                const requests = network.filter(
                  (e) => e.at >= start && e.at <= end && e.url.includes('/games')
                );
                if (repetition === 0) expect(operations.workerReplays).toBe(games.length);
                else {
                  expect(operations.workerReplays).toBe(0);
                  expect(operations.builds).toBe(0);
                  expect(requests).toHaveLength(0);
                }
                let activeEntryMs = null;
                if (engineState === 'active') {
                  await navigate(page, 'Review');
                  await page.getByRole('tab', { name: 'Analysis', exact: true }).click();
                  await page.evaluate(async () => {
                    const names = await indexedDB.databases();
                    const opened = await new Promise((resolve, reject) => {
                      const r = indexedDB.open(names[0].name);
                      r.onsuccess = () => resolve(r.result);
                      r.onerror = () => reject(r.error);
                    });
                    await new Promise((resolve, reject) => {
                      const tx = opened.transaction('evaluations', 'readwrite');
                      tx.objectStore('evaluations').clear();
                      tx.oncomplete = resolve;
                      tx.onerror = () => reject(tx.error);
                    });
                    opened.close();
                  });
                  await page
                    .getByRole('button', {
                      name: /^(Run review \(Start analysis\)|Run again|Resume analysis)$/,
                    })
                    .click();
                  await expect(
                    page.getByRole('button', { name: 'Cancel analysis', exact: true })
                  ).toBeVisible();
                  const activeEntryStart = await now(page);
                  await navigate(page, 'Openings');
                  await ready(page);
                  activeEntryMs = (await now(page)) - activeEntryStart;
                }
                // Prime both scopes, then measure actual retained returns, while engine is active if requested.
                for (const scope of ['Black', 'White']) {
                  await page.getByRole('radio', { name: scope, exact: true }).click();
                  await ready(page);
                }
                const scopeStart = await now(page);
                for (const scope of ['Black', 'White']) {
                  await page.getByRole('radio', { name: scope, exact: true }).click();
                  await ready(page);
                }
                const scopeOps = await countsSince(page, scopeStart);
                expect(scopeOps.workerReplays).toBe(0);
                expect(scopeOps.mainReplays).toBe(0);
                expect(scopeOps.builds).toBe(0);
                let navigation = null;
                if (coldContext === 4 && repetition <= 1) {
                  const since = await now(page),
                    durations = [],
                    hover = [],
                    focus = [];
                  const candidate = page.getByRole('button', { name: /^Play / }).first();
                  for (let i = 0; i < 50; i++) {
                    let at = await now(page);
                    await candidate.click();
                    await painted(page);
                    durations.push((await now(page)) - at);
                    at = await now(page);
                    await page.getByRole('button', { name: 'Previous move', exact: true }).click();
                    await painted(page);
                    durations.push((await now(page)) - at);
                  }
                  for (let i = 0; i < 20; i++) {
                    let at = await now(page);
                    await candidate.focus();
                    await expect(page.locator('.opening-arrow--active')).toHaveCount(1);
                    await painted(page);
                    focus.push((await now(page)) - at);
                    await candidate.evaluate((el) => el.blur());
                    await page.mouse.move(0, 0);
                    at = await now(page);
                    await candidate.hover();
                    await expect(page.locator('.opening-arrow--active')).toHaveCount(1);
                    await painted(page);
                    hover.push((await now(page)) - at);
                    await page.mouse.move(0, 0);
                  }
                  const counts = await countsSince(page, since);
                  const fetches = network.filter((e) => e.at >= since).length;
                  expect(durations).toHaveLength(100);
                  expect(fetches).toBe(0);
                  expect(counts.workerReplays).toBe(0);
                  expect(counts.mainReplays).toBe(0);
                  expect(counts.builds).toBe(0);
                  navigation = {
                    durations,
                    hover,
                    focus,
                    fetches,
                    operations: counts,
                    p95Ms: percentile(durations, 0.95),
                    hoverP95Ms: percentile(hover, 0.95),
                    focusP95Ms: percentile(focus, 0.95),
                    targetMet: percentile(durations, 0.95) <= 100,
                    hoverTargetMet: percentile(hover, 0.95) <= 50,
                    focusTargetMet: percentile(focus, 0.95) <= 50,
                  };
                  await page.screenshot({
                    path: path.join(
                      outputDir,
                      `${workload.name}-${width}-${engineState}-${repetition}.png`
                    ),
                    fullPage: true,
                  });
                }
                if (engineState === 'active') {
                  await navigate(page, 'Review');
                  const cancel = page.getByRole('button', { name: 'Cancel analysis', exact: true });
                  // Report whether engine work survived the entire navigation sample.
                  const stillActive = await cancel.isVisible();
                  if (stillActive) {
                    await cancel.click();
                    await expect(
                      page.getByText('Stopping analysis…', { exact: true })
                    ).toBeHidden();
                  }
                  if (navigation) navigation.engineStillActiveAtEnd = stillActive;
                  await navigate(page, 'Openings');
                }
                const session = await context.newCDPSession(page);
                const heap = await session.send('Runtime.getHeapUsage');
                await session.detach();
                const resources = await page.evaluate(async () => {
                  const snapshots = window.__baseline.responses
                    .filter((e) => e.resources)
                    .map((e) => e.resources);
                  const names = await indexedDB.databases();
                  const database = await new Promise((resolve, reject) => {
                    const r = indexedDB.open(names[0].name);
                    r.onsuccess = () => resolve(r.result);
                    r.onerror = () => reject(r.error);
                  });
                  const result = {};
                  for (const name of ['graphSnapshots', 'normalizedMonths'])
                    if (database.objectStoreNames.contains(name)) {
                      const records = await new Promise((resolve, reject) => {
                        const tx = database.transaction(name);
                        const r = tx.objectStore(name).getAll();
                        r.onsuccess = () => resolve(r.result);
                        r.onerror = () => reject(r.error);
                      });
                      result[name] = {
                        count: records.length,
                        bytes: records.reduce(
                          (n, r) =>
                            n +
                            (r.byteSize ?? new TextEncoder().encode(JSON.stringify(r)).byteLength),
                          0
                        ),
                      };
                    }
                  database.close();
                  return {
                    snapshots,
                    disk: result,
                    overflow: document.documentElement.scrollWidth - innerWidth,
                  };
                });
                const traceAttribution = stopTrace
                  ? await stopTrace(path.join(outputDir, traceName))
                  : null;
                results.push({
                  trace: stopTrace ? traceName : null,
                  traceAttribution,
                  workload: workload.name,
                  plies: workload.plies,
                  count: games.length,
                  width,
                  engineState,
                  coldContext,
                  repetition,
                  cacheState: repetition === 0 ? 'cold' : 'warm',
                  readyMs: end - start,
                  importEngineState: 'idle',
                  activeEntryMs,
                  operations,
                  requests,
                  scopeOps,
                  navigation,
                  heap,
                  resources,
                  environment,
                });
                save();
                console.log(
                  workload.name,
                  width,
                  engineState,
                  coldContext,
                  repetition,
                  Math.round(end - start),
                  'ms',
                  JSON.stringify(operations)
                );
              }
              if (coldContext === 4) {
                const start = Date.now();
                await page.reload();
                await ready(page);
                const operations = await countsSince(page, start);
                expect(operations.workerReplays).toBe(0);
                expect(operations.builds).toBe(0);
                // Age complete fetch coverage, then measure a real network refresh.
                await page.evaluate(async () => {
                  const names = await indexedDB.databases();
                  const database = await new Promise((resolve, reject) => {
                    const r = indexedDB.open(names[0].name);
                    r.onsuccess = () => resolve(r.result);
                    r.onerror = () => reject(r.error);
                  });
                  await new Promise((resolve, reject) => {
                    const tx = database.transaction('archiveSync', 'readwrite');
                    const store = tx.objectStore('archiveSync');
                    const r = store.getAll();
                    r.onsuccess = () =>
                      r.result.forEach((record) =>
                        store.put({ ...record, lastSuccessfulFetchAt: 0 })
                      );
                    tx.oncomplete = resolve;
                    tx.onerror = () => reject(tx.error);
                  });
                  database.close();
                });
                const refreshStart = await now(page);
                await submit(page, games.length, false);
                const refreshOps = await countsSince(page, refreshStart);
                const refreshRequests = network.filter(
                  (e) => e.at >= refreshStart && e.url.endsWith('/2024/01')
                ).length;
                expect(refreshRequests).toBe(1);
                expect(refreshOps.workerReplays).toBe(0);
                expect(refreshOps.builds).toBe(0);
                const horizonStart = await now(page);
                await page.getByText('Advanced opening settings', { exact: true }).click();
                await page.getByLabel('Opening horizon (plies)').fill('12');
                await page.waitForFunction(
                  (since) =>
                    window.__baseline.messages.some(
                      (m) => m.at >= since && m.type === 'BUILD_GRAPH'
                    ),
                  horizonStart
                );
                await ready(page);
                // The scoped and repertoire jobs must finish before deliberately evicting
                // disk snapshots; otherwise a still-running writer can refill the probe cache.
                await waitForOpeningBuilds(page, horizonStart, 2);
                const horizonOps = await countsSince(page, horizonStart);
                expect(horizonOps.workerReplays).toBe(0);
                const misses = [];
                for (const reason of ['missing-projection', 'parser-version']) {
                  await page.evaluate(async (reason) => {
                    const names = await indexedDB.databases();
                    const database = await new Promise((resolve, reject) => {
                      const r = indexedDB.open(names[0].name);
                      r.onsuccess = () => resolve(r.result);
                      r.onerror = () => reject(r.error);
                    });
                    await new Promise((resolve, reject) => {
                      const tx = database.transaction(
                        ['games', 'normalizedMonths', 'graphSnapshots'],
                        'readwrite'
                      );
                      tx.objectStore('graphSnapshots').clear();
                      for (const storeName of ['games', 'normalizedMonths']) {
                        const store = tx.objectStore(storeName);
                        const request = store.getAll();
                        request.onsuccess = () =>
                          request.result.forEach((record) => {
                            if (storeName === 'games') delete record.openingProjection;
                            else
                              for (const candidate of record.candidates) {
                                delete candidate.game.openingProjection;
                                delete candidate.validation.projection;
                                if (reason === 'parser-version')
                                  candidate.validation.parserVersion = 'incompatible-test-version';
                              }
                            store.put(record);
                          });
                      }
                      tx.oncomplete = resolve;
                      tx.onerror = () => reject(tx.error);
                    });
                    database.close();
                  }, reason);
                  const missStart = Date.now();
                  await page.reload();
                  await ready(page);
                  const missOps = await countsSince(page, missStart);
                  expect(missOps.workerReplays).toBe(games.length);
                  expect(missOps.builds).toBeGreaterThan(0);
                  expect(missOps.validations).toBe(reason === 'parser-version' ? 1 : 0);
                  misses.push({ reason, readyMs: Date.now() - missStart, operations: missOps });
                }
                fs.writeFileSync(
                  path.join(outputDir, `${workload.name}-${width}-${engineState}-disk.json`),
                  JSON.stringify(
                    { operations, refreshOps, refreshRequests, horizonOps, misses },
                    null,
                    2
                  )
                );
              }
            } finally {
              page.__baselineClosing = true;
              await context.close();
            }
          }
        }
    }
  } finally {
    save();
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
