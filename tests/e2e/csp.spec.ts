import { test, expect } from '@playwright/test';

test.describe('Content Security Policy (CSP) Smoke Test', () => {
  test('allows approved PubAPI CORS request and blocks unauthorized connect-src target', async ({
    page,
  }) => {
    await page.route('https://api.chess.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ archives: [] }),
      });
    });
    await page.goto('/');

    // Test approved PubAPI fetch (https://api.chess.com)
    const pubApiResult = await page.evaluate(async () => {
      try {
        const response = await fetch('https://api.chess.com/pub/player/chesscom', {
          method: 'GET',
          mode: 'cors',
        });
        return { success: true, status: response.status };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { success: false, error: message };
      }
    });

    expect(pubApiResult).toEqual({ success: true, status: 200 });

    // Test unauthorized connect-src target (https://example.com)
    const unauthorizedResult = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/api', { method: 'GET' });
        return { blocked: false };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { blocked: true, error: message };
      }
    });

    // Unauthorized endpoint MUST be blocked by CSP
    expect(unauthorizedResult.blocked).toBe(true);
    expect(unauthorizedResult.error).toMatch(
      /Failed to fetch|Refused to connect|Content Security Policy|NetworkError|Load failed/i
    );
  });
});
