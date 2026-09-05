// SPA-fallback guard test for apps/flockgeek/backend/src/server.js (Q53).
//
// server.js calls mongoose.connect() + app.listen() at module scope (via its
// start() call at the bottom of the file — see the CSRF suite's comment in
// auth.test.js for why this file can't be imported directly in a test). This
// suite instead rebuilds the exact static + catch-all wiring server.js uses
// (express.static(publicPath) then the extname-404 guard added for Q53) over
// a throwaway fixture directory, the same technique auth.test.js's
// buildGuardedDataApp() uses to test the real csrfGuard() mount without
// booting the whole process.
//
// Keep this in sync with server.js's catch-all if that ever changes shape.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

let publicDir;
let app;
const FIXTURE_MARKER = '<!-- flockgeek spaFallback.test.js fixture -->';

beforeAll(() => {
  publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flockgeek-spa-fallback-'));
  fs.writeFileSync(
    path.join(publicDir, 'index.html'),
    `${FIXTURE_MARKER}\n<html><body>flockgeek</body></html>\n`
  );

  app = express();
  app.use(express.static(publicDir));

  // Exact mirror of the fixed catch-all in src/server.js.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    if (path.extname(req.path)) {
      return res.status(404).type('text/plain').send('Not found');
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });
});

afterAll(() => {
  fs.rmSync(publicDir, { recursive: true, force: true });
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

  test('GET /api/whatever-unknown falls through to the JSON 404, not the SPA fallback', async () => {
    const res = await request(app).get('/api/whatever-unknown');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Route not found' });
  });
});
