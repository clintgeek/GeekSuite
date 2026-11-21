/**
 * GeekDay backend: boots with no database, serves the SPA safely, answers
 * health, gates /api/me, proxies sign-in to basegeek, and CSRF-guards
 * cookie-authenticated mutations.
 */
import { describe, test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import createApp from '../src/app.js';

const MARKER = '<!-- geekday fixture -->';

function makePublic() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'geekday-spa-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'index.html'), `${MARKER}<html></html>`);
  fs.writeFileSync(path.join(dir, 'assets', 'app-ABC123.js'), 'console.log(1)');
  return dir;
}

describe('health', () => {
  test('GET /api/health is { status: "ok" } with no database field', async () => {
    const res = await request(createApp()).get('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok' });
  });
});

describe('SPA fallback', () => {
  let app;
  let publicPath;
  before(() => {
    publicPath = makePublic();
    app = createApp({ publicPath });
  });
  after(() => fs.rmSync(publicPath, { recursive: true, force: true }));

  test('a deep client route serves index.html', async () => {
    const res = await request(app).get('/day/2026-11-20');
    assert.equal(res.status, 200);
    assert.ok(res.text.includes(MARKER));
  });

  test('a path with a file extension 404s as text/plain, never index.html', async () => {
    const res = await request(app).get('/assets/gone-DEAD.js');
    assert.equal(res.status, 404);
    assert.match(res.headers['content-type'], /text\/plain/);
    assert.ok(!res.text.includes(MARKER));
  });

  test('a real hashed asset is served with immutable caching', async () => {
    const res = await request(app).get('/assets/app-ABC123.js');
    assert.equal(res.status, 200);
    assert.match(res.headers['cache-control'], /immutable/);
  });

  test('/graphql is not answered by the fallback', async () => {
    const res = await request(app).get('/graphql');
    assert.equal(res.status, 404);
    assert.ok(!res.text.includes(MARKER));
  });

  test('unknown /api paths answer JSON 404, not the SPA', async () => {
    const res = await request(app).get('/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'NOT_FOUND');
  });
});

describe('session gate', () => {
  test('GET /api/me with no session is 401', async () => {
    const res = await request(createApp()).get('/api/me');
    assert.equal(res.status, 401);
    assert.equal(res.body.message, 'Authentication token required');
  });

  test('GET /api/auth/me with no session is 401', async () => {
    const res = await request(createApp()).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  test('GET /api/me with a valid session returns the user, no-store', async () => {
    const app = createApp({ validateSession: async () => ({ id: 'u1', username: 'chef' }) });
    const res = await request(app).get('/api/me').set('Cookie', 'geek_token=abc');
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, 'u1');
    assert.equal(res.headers['cache-control'], 'no-store');
  });
});

describe('auth proxy to basegeek', () => {
  const realFetch = globalThis.fetch;
  let calls;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.BASEGEEK_URL;
  });

  function mockFetch(impl) {
    calls = [];
    process.env.BASEGEEK_URL = 'http://basegeek.test/';
    globalThis.fetch = async (url, init) => {
      calls.push({ url: String(url), init });
      return impl(url, init);
    };
  }

  test('login posts to basegeek with app "geekday" and forwards Set-Cookie', async () => {
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append('set-cookie', 'geek_token=t1; Path=/; HttpOnly');
    headers.append('set-cookie', 'geek_refresh_token=r1; Path=/; HttpOnly');
    mockFetch(async () => new Response(JSON.stringify({ user: { id: 'u1' } }), { status: 200, headers }));

    const res = await request(createApp()).post('/api/auth/login').send({ identifier: 'chef', password: 'pw' });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(calls[0].url, 'http://basegeek.test/api/auth/login');
    assert.deepEqual(JSON.parse(calls[0].init.body), { identifier: 'chef', password: 'pw', app: 'geekday' });
    assert.equal(res.headers['set-cookie'].length, 2);
  });

  test('refresh forwards the cookie and the CSRF header', async () => {
    mockFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const res = await request(createApp()).post('/api/auth/refresh')
      .set('Cookie', 'geek_refresh_token=r1')
      .set('X-CSRF-Token', 'csrf-abc')
      .send({});
    assert.equal(res.status, 200);
    assert.equal(calls[0].url, 'http://basegeek.test/api/auth/refresh');
    assert.equal(calls[0].init.headers.Cookie, 'geek_refresh_token=r1');
    assert.equal(calls[0].init.headers['X-CSRF-Token'], 'csrf-abc');
  });

  test('an upstream rejection keeps its status and message', async () => {
    mockFetch(async () => new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401, headers: { 'content-type': 'application/json' } }));
    const res = await request(createApp()).post('/api/auth/login').send({ identifier: 'x', password: 'y' });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.message, 'Bad credentials');
  });

  test('an unreachable basegeek answers 502 UPSTREAM_UNREACHABLE', async () => {
    mockFetch(async () => { throw new TypeError('fetch failed'); });
    const res = await request(createApp()).post('/api/auth/login').send({ identifier: 'x', password: 'y' });
    assert.equal(res.status, 502);
    assert.equal(res.body.code, 'UPSTREAM_UNREACHABLE');
  });

  test('refresh with an unreachable basegeek also answers 502', async () => {
    mockFetch(async () => { throw new TypeError('fetch failed'); });
    const res = await request(createApp()).post('/api/auth/refresh').send({});
    assert.equal(res.status, 502);
  });

  test('logout still succeeds locally when basegeek is down', async () => {
    mockFetch(async () => { throw new TypeError('fetch failed'); });
    const res = await request(createApp()).post('/api/auth/logout').send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  });
});

describe('CSRF guard', () => {
  test('a cookie-authenticated POST from a disallowed origin is 403 csrf_origin_rejected', async () => {
    const res = await request(createApp()).post('/api/auth/logout')
      .set('Cookie', 'geek_token=abc').set('Origin', 'https://evil.example').send({});
    assert.equal(res.status, 403);
    assert.equal(res.body.error, 'csrf_origin_rejected');
  });

  test('the same POST from the app origin is not blocked by the guard', async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    try {
      const res = await request(createApp()).post('/api/auth/logout')
        .set('Cookie', 'geek_token=abc').set('Origin', 'https://geekday.clintgeek.com').send({});
      assert.equal(res.status, 200);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test('CORS_ORIGINS overrides the default allow-list', async () => {
    process.env.CORS_ORIGINS = 'https://other.example';
    try {
      const res = await request(createApp()).post('/api/auth/logout')
        .set('Cookie', 'geek_token=abc').set('Origin', 'https://geekday.clintgeek.com').send({});
      assert.equal(res.status, 403);
    } finally {
      delete process.env.CORS_ORIGINS;
    }
  });
});
