/**
 * The enrichment endpoints' HTTP contract. Auth goes through the real
 * attachUser() against a loopback fake of basegeek's /api/users/me; the Game
 * model's reads are mocked, and nothing here reaches a provider.
 */
import { describe, test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import createApp from '../src/app.js';
import Game from '../src/models/Game.js';

const TOKEN = 'good-token';
const ID = '507f1f77bcf86cd799439011';
let fakeBasegeek;
let previous;

before(async () => {
  fakeBasegeek = http.createServer((req, res) => {
    const ok = req.url === '/api/users/me' && req.headers.authorization === `Bearer ${TOKEN}`;
    res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
    res.end(JSON.stringify(ok ? { user: { id: 'user-1', username: 'chef' } } : { message: 'nope' }));
  });
  await new Promise((resolve) => fakeBasegeek.listen(0, '127.0.0.1', resolve));
  previous = { url: process.env.BASEGEEK_URL, rawg: process.env.RAWG_API_KEY, igdb: process.env.IGDB_CLIENT_ID };
  process.env.BASEGEEK_URL = `http://127.0.0.1:${fakeBasegeek.address().port}`;
  delete process.env.RAWG_API_KEY;
  delete process.env.IGDB_CLIENT_ID;
});

after(async () => {
  for (const [k, v] of [['BASEGEEK_URL', previous.url], ['RAWG_API_KEY', previous.rawg], ['IGDB_CLIENT_ID', previous.igdb]]) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  await new Promise((resolve) => fakeBasegeek.close(resolve));
});

beforeEach(() => mock.restoreAll());

const app = createApp();
const authed = (req) => req.set('Authorization', `Bearer ${TOKEN}`);

describe('401 without a session', () => {
  const routes = [
    ['get', '/api/metadata/enrich/status'],
    ['post', '/api/metadata/enrich/run'],
    ['post', `/api/games/${ID}/metadata/refresh`],
    ['get', `/api/games/${ID}/metadata/candidates`],
    ['post', `/api/games/${ID}/metadata/apply`],
    ['post', `/api/games/${ID}/metadata/unlink`],
  ];
  for (const [method, url] of routes) {
    test(`${method.toUpperCase()} ${url}`, async () => {
      mock.method(Game, 'findOne', () => {
        throw new Error('must not reach the DB');
      });
      const res = await request(app)[method](url).send({});
      assert.equal(res.status, 401);
    });
  }
});

describe('validation and scoping', () => {
  test('a malformed game id → 404, no DB read', async () => {
    const findOne = mock.method(Game, 'findOne', () => ({ lean: async () => null }));
    const res = await authed(request(app).post('/api/games/not-an-id/metadata/unlink'));
    assert.equal(res.status, 404);
    assert.equal(findOne.mock.callCount(), 0);
  });

  test('a game outside the household → 404, and the read is household-scoped', async () => {
    const findOne = mock.method(Game, 'findOne', () => ({ lean: async () => null }));
    const res = await authed(request(app).get(`/api/games/${ID}/metadata/candidates`));
    assert.equal(res.status, 404);
    assert.deepEqual(findOne.mock.calls[0].arguments[0], { _id: ID, householdId: 'default' });
  });

  test('apply: provider and a numeric providerId are required', async () => {
    for (const body of [{}, { provider: 'gog', providerId: '1' }, { provider: 'steam', providerId: '../x' }, { provider: 'steam' }]) {
      const res = await authed(request(app).post(`/api/games/${ID}/metadata/apply`)).send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.code, 'VALIDATION_ERROR');
    }
  });

  test('apply with a provider the server has no key for → 400 PROVIDER_NOT_CONFIGURED', async () => {
    mock.method(Game, 'findOne', () => ({ lean: async () => ({ _id: ID, householdId: 'default', title: 'X' }) }));
    const res = await authed(request(app).post(`/api/games/${ID}/metadata/apply`)).send({ provider: 'rawg', providerId: 5 });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'PROVIDER_NOT_CONFIGURED');
    assert.match(res.body.message, /server/);
  });

  test('GET /api/metadata/providers lists rawg', async () => {
    const res = await authed(request(app).get('/api/metadata/providers'));
    assert.equal(res.status, 200);
    assert.equal(res.body.rawg, false);
    assert.equal(res.body.steamStore, true);
  });

  test('GET status answers the documented shape', async () => {
    mock.method(Game, 'countDocuments', async () => 0);
    const res = await authed(request(app).get('/api/metadata/enrich/status'));
    assert.equal(res.status, 200);
    for (const k of ['running', 'queued', 'counts', 'providers', 'lastRunAt']) assert.ok(k in res.body, k);
    assert.deepEqual(Object.keys(res.body.counts).sort(), ['ambiguous', 'error', 'matched', 'noMatch', 'pending', 'unlinked']);
    assert.deepEqual(res.body.providers, { steam: true, igdb: false, rawg: false });
  });
});
