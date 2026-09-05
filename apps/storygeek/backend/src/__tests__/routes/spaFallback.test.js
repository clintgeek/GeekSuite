// SPA-fallback guard test for apps/storygeek/backend/src/app.js (Q53).
//
// The catch-all at the bottom of app.js serves index.html for any
// non-API/non-graphql GET so client-side routes survive a refresh. Before
// this pass it did that unconditionally — including for a hashed asset path
// a deploy has just deleted (e.g. an old service worker retrying
// /assets/<stale-hash>.js). Answering that with 200 text/html lets a runtime
// StaleWhileRevalidate cache rule store the HTML body under the asset's URL,
// poisoning the cache until the user clears site data (DOCS/CONTEXT.md
// landmine; see the extname-404 guard bujogeek/notegeek/bookgeek/fitnessgeek
// already carry).
//
// No fixture build exists in this checkout (public/ is a build output, not
// checked in), so this file creates a throwaway public/index.html for the
// duration of the suite and removes the whole directory afterward — it does
// not exist beforehand (verified) so cleanup is unconditional and safe.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public');
const INDEX_HTML = path.join(PUBLIC_DIR, 'index.html');
const FIXTURE_MARKER = '<!-- storygeek spaFallback.test.js fixture -->';

let app;
let request;

beforeAll(async () => {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.writeFileSync(INDEX_HTML, `${FIXTURE_MARKER}\n<html><body>storygeek</body></html>\n`);

  ({ default: app } = await import('../../app.js'));
  ({ default: request } = await import('supertest'));
});

afterAll(() => {
  fs.rmSync(PUBLIC_DIR, { recursive: true, force: true });
});

describe('SPA fallback — extname 404 guard (Q53)', () => {
  test('GET /assets/nope-DEAD.js -> 404 text/plain, never index.html', async () => {
    const res = await request(app).get('/assets/nope-DEAD.js');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).not.toContain(FIXTURE_MARKER);
  });

  test('GET /some/spa/route (no extension) -> 200, serves index.html', async () => {
    const res = await request(app).get('/some/spa/route');

    expect(res.status).toBe(200);
    expect(res.text).toContain(FIXTURE_MARKER);
  });

  test('GET /api/whatever still 404s as a JSON API miss, not the SPA fallback', async () => {
    const res = await request(app).get('/api/whatever-unknown');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Route not found' });
  });
});
