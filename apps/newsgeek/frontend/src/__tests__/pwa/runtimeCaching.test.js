/**
 * NewsGeek's service worker: auth and live data are never cached; static
 * assets the precache missed are, but never as HTML. Workbox takes the
 * FIRST matching route. tools/pwa-audit.mjs checks the built sw.js too.
 */
import { runtimeCaching } from '../../../pwa/runtimeCaching.js';

const req = (path, { destination = '', method = 'GET' } = {}) => {
  const url = new URL(path, 'https://newsgeek.clintgeek.com');
  return { url, request: { url: url.href, method, destination } };
};
const firstRoute = (r) => runtimeCaching.find((route) => route.urlPattern(r));

describe('runtime caching', () => {
  it.each([req('/api/me'), req('/api/auth/refresh', { method: 'POST' }), req('/api/users/me/preferences')])('auth %# is NetworkOnly auth-bypass', (r) => {
    expect(firstRoute(r).options.cacheName).toBe('auth-bypass');
    expect(firstRoute(r).handler).toBe('NetworkOnly');
  });

  it('the API and the gateway are never cached', () => {
    expect(firstRoute(req('/api/feeds/check', { method: 'POST' })).handler).toBe('NetworkOnly');
    expect(firstRoute(req('/graphql', { method: 'POST' })).handler).toBe('NetworkOnly');
  });

  it('missed static assets are stale-while-revalidate', () => {
    expect(firstRoute(req('/assets/index-abc.js', { destination: 'script' })).handler).toBe('StaleWhileRevalidate');
    expect(firstRoute(req('/assets/newsreader-latin-400-normal.woff2', { destination: 'font' })).handler).toBe('StaleWhileRevalidate');
  });

  it('every urlPattern is self-contained (generateSW copies its source into sw.js)', () => {
    for (const route of runtimeCaching) expect(route.urlPattern.toString()).not.toMatch(/\bnotHtml\b/);
  });
});
