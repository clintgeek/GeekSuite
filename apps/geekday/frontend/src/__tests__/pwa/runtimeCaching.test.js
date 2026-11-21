/**
 * Workbox takes the FIRST matching route, so which rule answers a request is
 * the whole caching policy. Auth state must be NetworkOnly and first
 * (PWA_STANDARD §2A); the rest of /api is NetworkOnly; only static assets
 * may be cached, and never an HTML response.
 */
import { describe, expect, it } from 'vitest';
import { runtimeCaching } from '../../../pwa/runtimeCaching.js';

const req = (path, { destination = '', method = 'GET' } = {}) => {
  const url = new URL(path, 'https://geekday.clintgeek.com');
  return { url, request: { url: url.href, method, destination } };
};
const firstRoute = (r) => runtimeCaching.find((route) => route.urlPattern(r));

describe('auth state is never cached', () => {
  it.each(['/api/me', '/api/auth/refresh', '/api/auth/login', '/api/users/me'])('%s → NetworkOnly auth-bypass', (p) => {
    const route = firstRoute(req(p));
    expect(route.handler).toBe('NetworkOnly');
    expect(route.options.cacheName).toBe('auth-bypass');
  });

  it('the auth rule is the very first one', () => {
    expect(runtimeCaching[0].options.cacheName).toBe('auth-bypass');
    expect(runtimeCaching[0].handler).toBe('NetworkOnly');
  });

  it('no caching route would take an auth request even if the order changed', () => {
    for (const route of runtimeCaching.filter((x) => x.handler !== 'NetworkOnly')) {
      for (const p of ['/api/me', '/api/auth/refresh', '/api/users/me']) {
        expect(route.urlPattern(req(p, { destination: 'script' }))).toBe(false);
      }
    }
  });
});

describe('the rest of the policy', () => {
  it('/api/health → NetworkOnly api-bypass', () => {
    const route = firstRoute(req('/api/health'));
    expect(route.handler).toBe('NetworkOnly');
    expect(route.options.cacheName).toBe('api-bypass');
  });

  it('a script request → StaleWhileRevalidate geekday-assets', () => {
    const route = firstRoute(req('/assets/index-abc.js', { destination: 'script' }));
    expect(route.handler).toBe('StaleWhileRevalidate');
    expect(route.options.cacheName).toBe('geekday-assets');
  });

  it('an image under /api is not an asset', () => {
    expect(firstRoute(req('/api/whatever.png', { destination: 'image' })).handler).toBe('NetworkOnly');
  });

  it('every urlPattern is self-contained (generateSW copies its source into sw.js)', () => {
    for (const route of runtimeCaching) expect(route.urlPattern.toString()).not.toMatch(/\bnotHtml\b/);
  });

  it('the asset rule refuses to store text/html', async () => {
    const guard = runtimeCaching.find((r) => r.options.cacheName === 'geekday-assets').options.plugins[0];
    const html = new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
    const js = new Response('x', { status: 200, headers: { 'content-type': 'text/javascript' } });
    expect(await guard.cacheWillUpdate({ response: html })).toBeNull();
    expect(await guard.cacheWillUpdate({ response: js })).toBe(js);
  });
});
