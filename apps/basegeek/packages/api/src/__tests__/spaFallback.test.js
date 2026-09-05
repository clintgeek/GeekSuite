// SPA-fallback guard test for apps/basegeek/packages/api/src/server.js (Q53).
//
// server.js connects Mongo/Redis/aiGeek and boots Apollo + app.listen() at
// module scope, so it can't be imported directly in a test (every other test
// in this directory that needs an Express app builds its own — see
// adminGates.test.js, openaiCompat.test.js, csrfGuard.test.js). This suite
// rebuilds the exact static + catch-all wiring server.js uses
// (express.static(uiBuildPath) then the extname-404 guard added for Q53)
// over a throwaway fixture directory.
//
// Keep this in sync with server.js's catch-all if that ever changes shape.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';

let uiBuildPath;
let app;
const FIXTURE_MARKER = '<!-- basegeek spaFallback.test.js fixture -->';

beforeAll(() => {
  uiBuildPath = fs.mkdtempSync(path.join(os.tmpdir(), 'basegeek-spa-fallback-'));
  fs.writeFileSync(
    path.join(uiBuildPath, 'index.html'),
    `${FIXTURE_MARKER}\n<html><body>basegeek</body></html>\n`
  );

  app = express();
  app.use(express.static(uiBuildPath));

  // Exact mirror of the fixed catch-all in src/server.js.
  app.get('*', (req, res) => {
    if (path.extname(req.path)) {
      return res.status(404).type('text/plain').send('Not found');
    }
    res.sendFile(path.join(uiBuildPath, 'index.html'), (err) => {
      if (err && !res.headersSent) {
        res.status(404).send('UI not found. Is it built?');
      }
    });
  });
});

afterAll(() => {
  fs.rmSync(uiBuildPath, { recursive: true, force: true });
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
});
