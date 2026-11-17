import fs from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page } from '@playwright/test';

interface Audit {
  events: Array<{ kind: string; worker?: number }>;
  messages: Array<{ type: string }>;
}

/** Use the production harness's actual loadPgn and worker probes, without changing assets. */
export async function instrumentOpenings(page: Page) {
  const source = fs.readFileSync('scripts/performance/opening-baseline.cjs', 'utf8');
  const start = source.indexOf('const parseProbe =');
  const end = source.indexOf('async function navigate(');
  if (start < 0 || end <= start) throw new Error('Opening instrumentation boundary is missing');
  const createProbe = new Function(
    'baseUrl',
    source.slice(start, end) + '\nreturn {instrument, parseProbe};'
  ) as (url: string) => { instrument: (page: Page) => Promise<void>; parseProbe: string };
  const upstream = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
  let parseProbe = '';
  // Firefox does not route dedicated-worker script requests through Playwright.
  // A loopback proxy transforms the actual served script bytes in every browser.
  const proxy = createServer(async (request, response) => {
    try {
      const upstreamResponse = await fetch(new URL(request.url ?? '/', upstream));
      const headers = new Headers(upstreamResponse.headers);
      for (const name of ['content-encoding', 'content-length', 'transfer-encoding', 'connection'])
        headers.delete(name);
      let body = Buffer.from(await upstreamResponse.arrayBuffer());
      if (/\.js(?:\?|$)/.test(request.url ?? '')) {
        const original = body.toString('utf8');
        const modified = original.replace(
          /([A-Za-z_$][\w$]*)\.loadPgn\(/g,
          'globalThis.__baselineParse($1,'
        );
        if (modified !== original) {
          body = Buffer.from(parseProbe + modified);
          headers.set('x-opening-replay-probe', '1');
        }
      }
      headers.set('cache-control', 'no-store');
      response.writeHead(upstreamResponse.status, Object.fromEntries(headers));
      response.end(body);
    } catch (error) {
      response.writeHead(502);
      response.end(String(error));
    }
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  const probe = createProbe(baseUrl);
  parseProbe = probe.parseProbe;
  page.once('close', () => {
    proxy.closeAllConnections();
    proxy.close();
  });
  await probe.instrument(page);
  return baseUrl;
}

export async function openingCounts(page: Page) {
  return page.evaluate(() => {
    const audit = (window as unknown as { __baseline: Audit }).__baseline;
    return {
      replays: audit.events.filter((e) => e.kind === 'parse' && e.worker).length,
      builds: audit.messages.filter((e) => e.type === 'BUILD_GRAPH').length,
      validations: audit.messages.filter((e) => e.type === 'VALIDATE_PGNS').length,
    };
  });
}

export async function resetOpeningCounts(page: Page) {
  await page.evaluate(() => {
    const audit = (window as unknown as { __baseline: Audit }).__baseline;
    audit.events = [];
    audit.messages = [];
  });
}
