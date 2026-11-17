/* Phase 8: same-configuration production profile of expanded membership only. */
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = require('../../tests/fixtures/openingScopeGames.json');
const url = process.env.PLAYWRIGHT_BASE_URL;
const output = process.env.PERF_OUTPUT_DIR;
if (!url || !output) throw new Error('Set PLAYWRIGHT_BASE_URL and PERF_OUTPUT_DIR');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  try {
    const results = [];
    for (const width of [1440, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 390 ? 844 : 1000 },
      });
      await page.addInitScript(() => {
        window.__membershipParses = [];
      });
      await page.route('**/*.js*', async (route) => {
        const response = await route.fetch();
        const source = await response.text();
        const modified = source.replace(
          /([A-Za-z_$][\w$]*)\.loadPgn\(/g,
          'globalThis.__membershipParse($1,'
        );
        const probe = `globalThis.__membershipParse = (board, ...args) => { const start = performance.now(); try { return board.loadPgn(...args); } finally { if (typeof document !== 'undefined') window.__membershipParses.push(performance.now() - start); } };\n`;
        await route.fulfill({ response, body: modified === source ? source : probe + modified });
      });
      const games = Array.from({ length: 500 }, (_, i) => ({
        ...base[i % base.length],
        uuid: `membership-${i}`,
        url: `https://www.chess.com/game/live/${530000000 + i}`,
      }));
      await page.route('https://api.chess.com/**', (route) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(
            route.request().url().endsWith('/archives')
              ? { archives: ['https://api.chess.com/pub/player/audit-player/games/2024/01'] }
              : route.request().url().endsWith('/2024/01')
                ? { games }
                : {}
          ),
        })
      );
      await page.goto(`${url}/?engine=unavailable`);
      await page.getByLabel('Username', { exact: true }).fill('audit-player');
      await page.getByRole('button', { name: 'Game filters', exact: true }).click();
      await page.getByRole('radio', { name: 'Custom', exact: true }).click();
      await page.getByLabel('From date').fill('2024-01-01');
      await page.getByLabel('To date').fill('2024-01-31');
      await page.getByLabel('Maximum games').fill('500');
      await page.getByRole('button', { name: 'Find games', exact: true }).click();
      await page.getByRole('heading', { name: 'Games (500)', exact: true }).waitFor();
      if (!(await page.getByRole('button', { name: 'Openings', exact: true }).isVisible()))
        await page.getByRole('button', { name: 'Open menu', exact: true }).click();
      await page.getByRole('button', { name: 'Openings', exact: true }).click();
      await page.getByRole('table', { name: 'Opening candidates', exact: true }).waitFor();
      await page.getByRole('radio', { name: /^Both/ }).click();
      await page.getByText('Matching games (500)', { exact: true }).waitFor();
      await page.evaluate(() => {
        window.__membershipParses = [];
      });
      const started = performance.now();
      await page.getByText('Matching games (500)', { exact: true }).click();
      await page.getByRole('heading', { name: 'Your games in this line' }).waitFor();
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
      const profile = await page.evaluate(() => ({
        parses: window.__membershipParses,
        rows: document.querySelectorAll('[aria-label="Games in this opening"] li').length,
        overflow: document.documentElement.scrollWidth - innerWidth,
      }));
      results.push({
        width,
        count: 500,
        expandedMs: performance.now() - started,
        ...profile,
        totalParseMs: profile.parses.reduce((a, b) => a + b, 0),
      });
      await page.screenshot({ path: path.join(output, `${width}-expanded.png`), fullPage: true });
      await page.close();
    }
    fs.writeFileSync(
      path.join(output, 'membership.json'),
      JSON.stringify(
        { buildId: fs.readFileSync('.next/BUILD_ID', 'utf8').trim(), results },
        null,
        2
      )
    );
    console.log(
      JSON.stringify(
        results.map(({ parses, ...rest }) => ({ ...rest, parseCount: parses.length })),
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
