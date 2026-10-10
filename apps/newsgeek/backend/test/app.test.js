/**
 * src/app.js — health (with worker status), JSON 404s under /api, the SPA
 * fallback and its asset-path 404s (the service-worker cache landmine).
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import createApp from '../src/app.js';

let publicPath;
let app;
before(() => {
  publicPath = fs.mkdtempSync(path.join(os.tmpdir(), 'newsgeek-public-'));
  fs.writeFileSync(path.join(publicPath, 'index.html'), '<!doctype html><title>NewsGeek</title>');
  fs.mkdirSync(path.join(publicPath, 'assets'));
  fs.writeFileSync(path.join(publicPath, 'assets', 'index-abc123.js'), 'console.log(1)');
  app = createApp({
    publicPath,
    dbState: () => 1,
    workerStatus: () => ({ enabled: true, running: false, lastTickAt: new Date('2026-10-10T15:00:00Z'), lastTickMs: 1200, lastTickError: null, activeSources: 30, feedsDue: 2, lastTickPolled: 2, lastTickFailed: 0 }),
  });
});
after(() => fs.rmSync(publicPath, { recursive: true, force: true }));

describe('/api/health', () => {
  test('no auth; database + worker status', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'healthy');
    assert.equal(res.body.database, 'connected');
    assert.equal(res.body.worker.enabled, true);
    assert.equal(res.body.worker.lastTickAt, '2026-10-10T15:00:00.000Z');
    assert.equal(res.body.worker.activeSources, 30);
    assert.equal(res.body.worker.feedsDue, 2);
  });
});

describe('routing', () => {
  test('unknown /api paths answer JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'NOT_FOUND');
  });

  test('/api/me needs a session', async () => {
    const res = await request(app).get('/api/me');
    assert.equal(res.status, 401);
  });

  test('a real hashed asset is served, cached forever', async () => {
    const res = await request(app).get('/assets/index-abc123.js');
    assert.equal(res.status, 200);
    assert.match(res.headers['cache-control'], /immutable/);
  });

  test('app routes get index.html', async () => {
    for (const p of ['/', '/sources', '/story/abc', '/s/local']) {
      const res = await request(app).get(p);
      assert.equal(res.status, 200, p);
      assert.match(res.text, /<title>NewsGeek<\/title>/);
    }
  });

  test('missing asset paths 404 — never index.html (stale SW caches would be poisoned)', async () => {
    for (const p of ['/assets/index-OLD999.js', '/assets/index-OLD999.css', '/assets/no-extension', '/sw.js', '/manifest.webmanifest', '/favicon.ico', '/icons/x.png']) {
      const res = await request(app).get(p);
      assert.equal(res.status, 404, p);
      assert.ok(!res.text.includes('<title>NewsGeek'), p);
    }
  });
});
