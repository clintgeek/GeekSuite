/**
 * GET /api/games/:id/media — auth, household scope, and the 200/502 shapes.
 * Auth goes through the real attachUser() against a loopback fake of
 * basegeek's /api/users/me; Game.findOne is mocked and the media service is
 * swapped for a fake, so nothing here reaches Mongo or a provider.
 */
import { describe, test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import createApp from '../src/app.js';
import Game from '../src/models/Game.js';
import { setMediaService } from '../src/media/mediaService.js';

const TOKEN = 'good-token';
const ID = '507f1f77bcf86cd799439011';
let fakeBasegeek;
let previousUrl;

before(async () => {
  fakeBasegeek = http.createServer((req, res) => {
    const ok = req.url === '/api/users/me' && req.headers.authorization === `Bearer ${TOKEN}`;
    res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
    res.end(JSON.stringify(ok ? { user: { id: 'user-1', username: 'chef' } } : { message: 'nope' }));
  });
  await new Promise((resolve) => fakeBasegeek.listen(0, '127.0.0.1', resolve));
  previousUrl = process.env.BASEGEEK_URL;
  process.env.BASEGEEK_URL = `http://127.0.0.1:${fakeBasegeek.address().port}`;
});

after(async () => {
  if (previousUrl === undefined) delete process.env.BASEGEEK_URL;
  else process.env.BASEGEEK_URL = previousUrl;
  setMediaService(null);
  await new Promise((resolve) => fakeBasegeek.close(resolve));
});

beforeEach(() => mock.restoreAll());

const app = createApp();
const authed = (req) => req.set('Authorization', `Bearer ${TOKEN}`);

function fakeService(impl) {
  const calls = [];
  setMediaService({
    async getMedia(game) {
      calls.push(game);
      return impl(game);
    },
  });
  return calls;
}

const MEDIA = { links: [{ kind: 'steam', label: 'Steam store', url: 'https://store.steampowered.com/app/1/' }], screenshots: [], videos: [], source: null, fetchedAt: null, partial: false, errors: [] };

describe('GET /api/games/:id/media', () => {
  test('401 without a session — no DB read, no provider call', async () => {
    const findOne = mock.method(Game, 'findOne', () => {
      throw new Error('must not reach the DB');
    });
    const calls = fakeService(() => MEDIA);
    const res = await request(app).get(`/api/games/${ID}/media`);
    assert.equal(res.status, 401);
    assert.equal(findOne.mock.callCount(), 0);
    assert.equal(calls.length, 0);
  });

  test('a malformed id → 404, no DB read', async () => {
    const findOne = mock.method(Game, 'findOne', () => ({ lean: async () => null }));
    const res = await authed(request(app).get('/api/games/not-an-id/media'));
    assert.equal(res.status, 404);
    assert.equal(findOne.mock.callCount(), 0);
  });

  test("another household's game → 404, and the read is household-scoped", async () => {
    const findOne = mock.method(Game, 'findOne', () => ({ lean: async () => null }));
    const calls = fakeService(() => MEDIA);
    const res = await authed(request(app).get(`/api/games/${ID}/media`));
    assert.equal(res.status, 404);
    assert.deepEqual(findOne.mock.calls[0].arguments[0], { _id: ID, householdId: 'default' });
    assert.equal(calls.length, 0);
  });

  test('200 with the service answer; the game handed over is the scoped one', async () => {
    const lean = { _id: ID, householdId: 'default', externalIds: { steamAppId: '1' } };
    mock.method(Game, 'findOne', () => ({ lean: async () => lean }));
    const calls = fakeService(() => MEDIA);
    const res = await authed(request(app).get(`/api/games/${ID}/media`));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, MEDIA);
    assert.equal(res.headers['cache-control'], 'private, no-store');
    assert.deepEqual(calls, [lean]);
  });

  test('a partial answer is still a 200', async () => {
    mock.method(Game, 'findOne', () => ({ lean: async () => ({ _id: ID, externalIds: { steamAppId: '1' } }) }));
    fakeService(() => ({ ...MEDIA, partial: true, errors: ['steam'] }));
    const res = await authed(request(app).get(`/api/games/${ID}/media`));
    assert.equal(res.status, 200);
    assert.equal(res.body.partial, true);
  });

  test('an unexpected failure → a quiet 502, no internals', async () => {
    mock.method(Game, 'findOne', () => ({ lean: async () => ({ _id: ID, externalIds: {} }) }));
    fakeService(() => {
      throw new Error('secret internals at /srv/thing');
    });
    const res = await authed(request(app).get(`/api/games/${ID}/media`));
    assert.equal(res.status, 502);
    assert.deepEqual(res.body, { message: 'Media unavailable', code: 'MEDIA_UNAVAILABLE' });
  });
});
