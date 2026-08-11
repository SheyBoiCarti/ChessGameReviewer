import { test, expect } from '@playwright/test';

test.describe('Production & Preview HTTP Response Headers', () => {
  test('returns security headers on document route /', async ({ request }) => {
    const response = await request.get('/');
    expect(response.status()).toBe(200);

    const headers = response.headers();
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['content-security-policy']).toContain('https://api.chess.com');
  });

  test('returns security headers on static/worker asset path', async ({ request }) => {
    const response = await request.get('/globals.css');
    const headers = response.headers();
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-embedder-policy']).toBe('require-corp');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });
});
