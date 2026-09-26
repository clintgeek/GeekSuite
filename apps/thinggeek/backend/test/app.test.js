/**
 * createApp() boots without Mongo; the SPA fallback; and the auth + MEMBER
 * gate on every /api route this backend serves (health excepted).
 */
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import createApp from '../src/app.js';
import { buildHarness, auth, makeTempDir, validateSession, newId } from './helpers/harness.js';

describe('boot', () => {
  test('the default createApp() (real models, no Mongo) answers /api/health', async () => {
    const res = await request(createApp()).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'healthy');
    assert.equal(res.body.database, 'disconnected');
  });

  test('unknown /api paths answer JSON 404, not the SPA', async () => {
    const res = await request(createApp()).get('/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'NOT_FOUND');
  });
});

describe('SPA fallback (the SW cache-poison landmine)', () => {
  const MARKER = '<!-- thinggeek fixture -->';
  let app;
  let publicPath;
  before(() => {
    publicPath = makeTempDir('thinggeek-spa-');
    fs.mkdirSync(path.join(publicPath, 'assets'));
    fs.writeFileSync(path.join(publicPath, 'index.html'), `${MARKER}<html></html>`);
    fs.writeFileSync(path.join(publicPath, 'assets', 'app-ABC123.js'), 'console.log(1)');
    app = createApp({ publicPath, validateSession });
  });
  after(() => fs.rmSync(publicPath, { recursive: true, force: true }));

  test('a missing hashed asset 404s as text/plain, never index.html', async () => {
    const res = await request(app).get('/assets/gone-DEAD.js');
    assert.equal(res.status, 404);
    assert.match(res.headers['content-type'], /text\/plain/);
    assert.ok(!res.text.includes(MARKER));
  });

  test('any path with an extension 404s', async () => {
    const res = await request(app).get('/thing/abc.css');
    assert.equal(res.status, 404);
    assert.ok(!res.text.includes(MARKER));
  });

  test('a real asset is served with immutable caching', async () => {
    const res = await request(app).get('/assets/app-ABC123.js');
    assert.equal(res.status, 200);
    assert.match(res.headers['cache-control'], /immutable/);
  });

  test('a client route (no extension) serves index.html', async () => {
    const res = await request(app).get('/thing/64b7f0000000000000000000');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes(MARKER));
  });

  test('/api and /graphql are excluded from the fallback', async () => {
    const api = await request(app).get('/api/whatever');
    assert.equal(api.status, 404);
    assert.equal(api.body.code, 'NOT_FOUND');
    const gql = await request(app).get('/graphql');
    assert.equal(gql.status, 404);
    assert.ok(!gql.text.includes(MARKER));
  });
});

describe('401 without a session, 403 NOT_A_MEMBER for a non-member — every /api route but health', () => {
  const h = buildHarness();
  after(() => h.cleanup());
  const thingId = String(newId());
  const fileId = String(newId());
  const routes = [
    ['get', '/api/me'],
    ['get', '/api/auth/me'],
    ['get', `/api/files/${fileId}`],
    ['get', `/api/files/${fileId}/thumb`],
    ['post', `/api/things/${thingId}/files`],
  ];

  for (const [method, url] of routes) {
    test(`${method.toUpperCase()} ${url} with no session → 401`, async () => {
      const res = await request(h.app)[method](url);
      assert.equal(res.status, 401);
    });

    test(`${method.toUpperCase()} ${url} as a non-member → 403 NOT_A_MEMBER`, async () => {
      const res = await request(h.app)[method](url).set(auth('stranger'));
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'NOT_A_MEMBER');
      assert.ok(res.body.message);
    });
  }

  test('a non-member upload is refused before any record or byte is written', async () => {
    const res = await request(h.app).post(`/api/things/${thingId}/files`).set(auth('stranger'))
      .field('kind', 'photo').attach('file', Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'x.jpg');
    assert.equal(res.status, 403);
    assert.equal(h.ThingFile.docs.length, 0);
    assert.deepEqual(fs.readdirSync(h.filesPath), []);
  });

  test('GET /api/me as a member → 200 with the user', async () => {
    const res = await request(h.app).get('/api/me').set(auth('chef'));
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, '6818c2bddcf626909f6a93a1');
  });

  test('GET /api/health needs nothing', async () => {
    const res = await request(h.app).get('/api/health');
    assert.equal(res.status, 200);
  });
});

describe('CSRF guard on the upload', () => {
  const h = buildHarness();
  after(() => h.cleanup());
  test('a cookie-authenticated upload from a foreign origin → 403', async () => {
    const res = await request(h.app).post(`/api/things/${newId()}/files`)
      .set('Cookie', 'geek_token=chef').set('Origin', 'https://evil.example')
      .field('kind', 'photo');
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'csrf_origin_rejected');
  });
});
