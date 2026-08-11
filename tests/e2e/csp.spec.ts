import { test, expect } from '@playwright/test';

test.describe('Content Security Policy (CSP) Smoke Test', () => {
  test('allows approved PubAPI CORS request and blocks unauthorized connect-src target', async ({
    page,
  }) => {
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

    // Approved endpoint should not be blocked by CSP
    if (!pubApiResult.success) {
      expect(pubApiResult.error).not.toMatch(/Content Security Policy|Refused to connect/i);
    }

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
      /Failed to fetch|Refused to connect|Content Security Policy/i
    );
  });
});
