/* Production-only measurement. Routing instrumentation never changes repository assets. */
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const base = require('../../tests/fixtures/openingScopeGames.json');
const baseUrl = process.env.PLAYWRIGHT_BASE_URL;
const outputDir = process.env.PERF_OUTPUT_DIR;
if (!baseUrl || !outputDir) throw new Error('Set PLAYWRIGHT_BASE_URL and PERF_OUTPUT_DIR');
const buildId = fs.readFileSync('.next/BUILD_ID', 'utf8').trim();
const counts = [20, 100, 500];
fs.mkdirSync(outputDir, { recursive: true });

// Also runs inside dedicated worker bundles. Actual strict loadPgn calls are counted,
// separately from RPC requests, including repeats and warm-cache validation.
const parseProbe = `globalThis.__baselineParse = (chess, ...args) => {
  const start = performance.timeOrigin + performance.now();
  try { return chess.loadPgn(...args); }
  finally {
    const event = {kind:'parse', start, end:performance.timeOrigin + performance.now(), strict:args[1]?.strict === true};
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
    };
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
  await page.route('**/*.js*', async (route) => {
    if (new URL(route.request().url()).origin !== new URL(baseUrl).origin) return route.abort();
    const response = await route.fetch();
    const source = await response.text();
    const modified = source.replace(
      /([A-Za-z_$][\w$]*)\.loadPgn\(/g,
      'globalThis.__baselineParse($1,'
    );
    await route.fulfill({ response, body: modified === source ? source : parseProbe + modified });
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

(async () => {
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const viewport of [
      { width: 1440, height: 1000 },
      { width: 390, height: 844 },
    ]) {
      for (const count of counts) {
        const context = await browser.newContext({ viewport });
        try {
          const page = await context.newPage();
          page.setDefaultTimeout(60000);
          await instrument(page);
          const games = Array.from({ length: count }, (_, i) => ({
            ...base[i % 20],
            uuid: `perf-${i}`,
            url: `https://www.chess.com/game/live/${520000000 + i}`,
          }));
          const network = [];
          await page.route('https://api.chess.com/**', async (route) => {
            const start = Date.now();
            const url = route.request().url();
            await route.fulfill({
              contentType: 'application/json',
              body: JSON.stringify(
                url.endsWith('/archives')
                  ? { archives: ['https://api.chess.com/pub/player/audit-player/games/2024/01'] }
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
          await page.goto(baseUrl, { waitUntil: 'networkidle' });
          const serverBuildId = await page
            .locator('script')
            .evaluateAll((scripts) => scripts.map((s) => s.textContent).join('\n'));
          if (!serverBuildId.includes(buildId))
            throw new Error('Server build ID differs from .next/BUILD_ID');
          await page.getByLabel('Username', { exact: true }).fill('audit-player');
          await page.getByRole('radio', { name: 'Custom', exact: true }).click();
          await page.getByLabel('From date').fill('2024-01-01');
          await page.getByLabel('To date').fill('2024-01-31');
          await page.getByRole('button', { name: 'Game filters', exact: true }).click();
          await page.getByLabel('Maximum games').fill(String(count));
          await page.getByLabel('Black games', { exact: true }).uncheck();
          for (const cacheState of ['cold', 'warm']) {
            if (cacheState === 'warm')
              await page.getByRole('button', { name: 'Import games', exact: true }).click();
            const start = await now(page);
            await page.getByRole('button', { name: 'Load games', exact: true }).click();
            await page.getByText(`${count * 0.6} games loaded`, { exact: true }).waitFor();
            const imported = await now(page);
            // Graph construction starts after saved-review reads in the current controller.
            await page.waitForFunction(
              (since) =>
                window.__baseline.responses.some((e) => e.at >= since && e.type === 'COMPLETE'),
              start
            );
            const graphReady = await now(page);
            const reviewStart = await now(page);
            await navigate(page, 'Review');
            await page
              .getByRole('heading', { name: 'Local Stockfish analysis', exact: true })
              .waitFor();
            await painted(page);
            const reviewReady = await now(page);
            await page.screenshot({
              path: path.join(outputDir, `${viewport.width}-${count}-${cacheState}-review.png`),
              fullPage: true,
            });
            const scopeStart = await now(page);
            await navigate(page, 'Openings');
            await page.getByRole('table', { name: 'Opening candidates', exact: true }).waitFor();
            await painted(page);
            const ready = await now(page);
            await page.screenshot({
              path: path.join(outputDir, `${viewport.width}-${count}-${cacheState}-openings.png`),
              fullPage: true,
            });
            const audit = await page.evaluate(() => window.__baseline);
            const messages = audit.messages.filter((e) => e.at >= start && e.at <= ready);
            const responses = audit.responses.filter((e) => e.at >= start && e.at <= ready);
            const parses = audit.events.filter((e) => e.start >= start && e.end <= ready);
            const reads = audit.reads.filter((e) => e.start >= start && e.start <= ready);
            const transactions = audit.transactions.filter(
              (e) => e.start >= start && e.start <= ready
            );
            results.push({
              count,
              cacheState,
              viewport,
              durationMs: ready - start,
              action: { start, imported, graphReady, reviewStart, reviewReady, scopeStart, ready },
              stages: {
                importMs: imported - start,
                graphAndRestoreTailMs: graphReady - imported,
                reviewRenderMs: reviewReady - reviewStart,
                scopeToCandidateMs: ready - scopeStart,
              },
              parseCounts: {
                strict: parses.filter((e) => e.strict).length,
                other: parses.filter((e) => !e.strict).length,
              },
              workerCount: audit.workers,
              messages,
              responses,
              parses,
              transactions,
              reads,
              network: network.filter((e) => e.start >= start),
              engineWait:
                'No engine analysis requested; automatic capability probe recorded separately in worker messages',
              environment: {
                buildId,
                checkout: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
                browser: browser.version(),
                baseUrl,
                node: process.version,
                platform: `${os.platform()} ${os.release()}`,
                cpu: os.cpus()[0]?.model,
                fixture: '20 legal six-ply records repeated; 60% White; White-only import',
                cache:
                  'Fresh context for cold; same IndexedDB for warm. Route instrumentation disables HTTP cache.',
              },
            });
            fs.writeFileSync(
              path.join(outputDir, 'baseline.json'),
              JSON.stringify(results, null, 2)
            );
            console.log(
              viewport.width,
              count,
              cacheState,
              Math.round(ready - start),
              'ms',
              results.at(-1).parseCounts
            );
          }
        } finally {
          await context.close();
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
