/**
 * The service worker never caches the Attic (DOCS/THINGGEEK_PLAN.md "The
 * Attic"). Workbox takes the FIRST matching route, so for every Attic
 * request — the vault, a sealed field, a sealed image loaded by an <img>
 * (destination "image"!) — the first match must be NetworkOnly, and nothing
 * may be precached from /api. tools/pwa-audit.mjs checks the built sw.js too.
 */
import { describe, expect, it } from 'vitest';
import { runtimeCaching } from '../../../pwa/runtimeCaching.js';

const req = (path, { destination = '', method = 'GET' } = {}) => {
  const url = new URL(path, 'https://thinggeek.clintgeek.com');
  return { url, request: { url: url.href, method, destination } };
};
const firstRoute = (r) => runtimeCaching.find((route) => route.urlPattern(r));

const ATTIC = [
  req('/api/attic/vault'),
  req('/api/attic/vault/unlock/pin', { method: 'POST' }),
  req('/api/attic/documents/abc/identifiers/number'),
  req('/api/attic/files/0123456789abcdef01234567', { destination: 'image' }),
  req('/api/attic/files/0123456789abcdef01234567?download=1', { destination: 'document' }),
  req('/api/attic/files/0123456789abcdef01234567', { destination: 'iframe' }),
];

describe('the Attic is never cached by the service worker', () => {
  it.each(ATTIC.map((r) => [r.url.pathname + r.url.search + ` (${r.request.destination || 'fetch'})`, r]))('%s → NetworkOnly attic-no-store', (_label, r) => {
    const route = firstRoute(r);
    expect(route.handler).toBe('NetworkOnly');
    expect(route.options.cacheName).toBe('attic-no-store');
  });

  it('the Attic route is the very first one', () => {
    expect(runtimeCaching[0].options.cacheName).toBe('attic-no-store');
    expect(runtimeCaching[0].handler).toBe('NetworkOnly');
  });

  it('no caching route would take an Attic request even if the order changed', () => {
    for (const route of runtimeCaching.filter((x) => x.handler !== 'NetworkOnly')) {
      for (const r of ATTIC) expect(route.urlPattern(r)).toBe(false);
    }
  });

  it('every urlPattern is self-contained (generateSW copies its source into sw.js)', () => {
    for (const route of runtimeCaching) expect(route.urlPattern.toString()).not.toMatch(/isAtticUrl|\bnotHtml\b/);
  });

  it('thing photos still cache; the rest of /api does not', () => {
    expect(firstRoute(req('/api/files/f1/thumb', { destination: 'image' })).handler).toBe('CacheFirst');
    expect(firstRoute(req('/api/things/t1/files', { method: 'POST' })).handler).toBe('NetworkOnly');
    expect(firstRoute(req('/assets/index-abc.js', { destination: 'script' })).handler).toBe('StaleWhileRevalidate');
  });
});
