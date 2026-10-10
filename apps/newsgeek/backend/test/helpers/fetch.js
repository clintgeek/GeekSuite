/**
 * An injected fetch for the ingest tests — never the network.
 * `routes` maps a URL to a handler (or a list of handlers, consumed in order;
 * the last one repeats). Every call is recorded with its request headers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function fixture(name) {
  return fs.readFileSync(path.join(here, '..', 'fixtures', name), 'utf8');
}

/** Response helpers. */
export const ok = (body, headers = {}) => () => new Response(body, { status: 200, headers: { 'content-type': 'application/rss+xml; charset=utf-8', ...headers } });
export const status = (code, headers = {}) => () => new Response(code === 304 ? null : 'nope', { status: code, headers });
export const networkError = () => () => { throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }); };

export function fakeFetch(routes = {}) {
  const calls = [];
  const queues = new Map(Object.entries(routes).map(([u, h]) => [u, Array.isArray(h) ? [...h] : [h]]));
  async function fetchImpl(url, init = {}) {
    calls.push({ url: String(url), headers: { ...(init.headers || {}) } });
    const q = queues.get(String(url));
    if (!q || !q.length) return new Response('not found', { status: 404 });
    const handler = q.length > 1 ? q.shift() : q[0];
    return handler(String(url), init);
  }
  fetchImpl.calls = calls;
  fetchImpl.set = (url, h) => queues.set(url, Array.isArray(h) ? [...h] : [h]);
  return fetchImpl;
}
