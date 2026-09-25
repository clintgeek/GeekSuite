/**
 * SPA-fallback guard proof, mirroring src/app.js's catch-all exactly (same
 * technique as apps/bookgeek/api/test/spaFallback.test.js): a fixture
 * express app over a throwaway `public` directory, since exercising the real
 * createApp() would mean writing an `index.html` into the backend's actual
 * `public/` folder just for the test. Keep this in sync with app.js's
 * catch-all if that ever changes shape.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

const FIXTURE_MARKER = '<!-- gamegeek spaFallback.test.js fixture -->';

let publicPath;
let server;
let baseUrl;

before(async () => {
  publicPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gamegeek-spa-fallback-'));
  fs.writeFileSync(
    path.join(publicPath, 'index.html'),
    `${FIXTURE_MARKER}\n<html><body>gamegeek</body></html>\n`,
  );

  const app = express();
  app.use(express.static(publicPath));

  // Exact mirror of src/app.js's catch-all.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/graphql')) {
      return next();
    }
    if (path.extname(req.path)) {
      return res.status(404).type('text/plain').send('Not found');
    }
    return res.sendFile(path.join(publicPath, 'index.html'));
  });

  app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(publicPath, { recursive: true, force: true });
});

describe('SPA fallback', () => {
  test('GET /assets/nope-DEAD.js -> 404 text/plain, never index.html', async () => {
    const res = await fetch(`${baseUrl}/assets/nope-DEAD.js`);
    const text = await res.text();
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type') || '', /text\/plain/);
    assert.ok(!text.includes(FIXTURE_MARKER));
  });

  test('GET /game/abc123 (no extension) -> 200, serves index.html', async () => {
    const res = await fetch(`${baseUrl}/game/abc123`);
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.ok(text.includes(FIXTURE_MARKER));
  });

  test('GET /api/whatever-unknown is excluded from the SPA fallback', async () => {
    const res = await fetch(`${baseUrl}/api/whatever-unknown`);
    const json = await res.json();
    assert.equal(res.status, 404);
    assert.deepEqual(json, { message: 'Route not found' });
  });

  test('GET /graphql is excluded from the SPA fallback', async () => {
    const res = await fetch(`${baseUrl}/graphql`);
    assert.equal(res.status, 404);
    const json = await res.json();
    assert.deepEqual(json, { message: 'Route not found' });
  });
});
