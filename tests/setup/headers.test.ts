import { describe, it, expect } from 'vitest';
import nextConfig, { createSecurityHeaders, securityHeaders } from '../../next.config';

describe('Security Headers Configuration', () => {
  it('defines mandatory security headers array', () => {
    expect(securityHeaders).toBeDefined();
    expect(Array.isArray(securityHeaders)).toBe(true);
    expect(securityHeaders.length).toBeGreaterThan(0);
  });

  it('includes Cross-Origin-Opener-Policy: same-origin', () => {
    const coop = securityHeaders.find((h) => h.key === 'Cross-Origin-Opener-Policy');
    expect(coop).toBeDefined();
    expect(coop?.value).toBe('same-origin');
  });

  it('includes Cross-Origin-Embedder-Policy: require-corp', () => {
    const coep = securityHeaders.find((h) => h.key === 'Cross-Origin-Embedder-Policy');
    expect(coep).toBeDefined();
    expect(coep?.value).toBe('require-corp');
  });

  it('includes X-Content-Type-Options: nosniff', () => {
    const nosniff = securityHeaders.find((h) => h.key === 'X-Content-Type-Options');
    expect(nosniff).toBeDefined();
    expect(nosniff?.value).toBe('nosniff');
  });

  it('includes framing restrictions', () => {
    const frameOptions = securityHeaders.find((h) => h.key === 'X-Frame-Options');
    expect(frameOptions).toBeDefined();
    expect(frameOptions?.value).toMatch(/DENY|SAMEORIGIN/i);
  });

  it('includes appropriate Referrer-Policy', () => {
    const ref = securityHeaders.find((h) => h.key === 'Referrer-Policy');
    expect(ref).toBeDefined();
    expect(ref?.value).toBe('strict-origin-when-cross-origin');
  });

  it('includes a CSP limiting connect-src to self and https://api.chess.com', () => {
    const csp = securityHeaders.find((h) => h.key === 'Content-Security-Policy');
    expect(csp).toBeDefined();
    const val = csp?.value ?? '';
    expect(val).toContain('connect-src');
    expect(val).toContain('https://api.chess.com');
    expect(val).toContain('wasm-unsafe-eval');
    expect(val).toContain("frame-ancestors 'none'");
  });

  it('does not permit general unsafe eval', () => {
    const csp = securityHeaders.find((header) => header.key === 'Content-Security-Policy');
    expect(csp?.value).toContain("'wasm-unsafe-eval'");
    expect(csp?.value).not.toMatch(/(?:^|\s)'unsafe-eval'(?:\s|;|$)/);
  });

  it('permits general unsafe eval only for React development debugging', () => {
    const developmentCsp = createSecurityHeaders(true).find(
      (header) => header.key === 'Content-Security-Policy'
    );
    const productionCsp = createSecurityHeaders(false).find(
      (header) => header.key === 'Content-Security-Policy'
    );

    expect(developmentCsp?.value).toMatch(/(?:^|\s)'unsafe-eval'(?:\s|;|$)/);
    expect(productionCsp?.value).not.toMatch(/(?:^|\s)'unsafe-eval'(?:\s|;|$)/);
  });

  it('configures headers async method for Next.js routes matching /:path*', async () => {
    expect(typeof nextConfig.headers).toBe('function');
    if (nextConfig.headers) {
      const routes = await nextConfig.headers();
      expect(routes.some((r) => r.source === '/:path*')).toBe(true);
      const mainRoute = routes.find((r) => r.source === '/:path*');
      expect(mainRoute?.headers).toEqual(securityHeaders);
    }
  });
});
