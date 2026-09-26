/**
 * POST /api/import/playnite — the HTTP contract
 * (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md §Endpoint).
 *
 * Auth goes through the real attachUser() against a loopback fake of
 * basegeek's /api/users/me. The models' read/write statics are mocked, so no
 * Mongo is needed.
 */
import { describe, test, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import createApp from '../src/app.js';
import Game from '../src/models/Game.js';
import GamePlayer from '../src/models/GamePlayer.js';
import Profile from '../src/models/Profile.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, 'fixtures', 'playnite-library.sample.json');
const fixtureText = fs.readFileSync(FIXTURE, 'utf8');
const fixture = JSON.parse(fixtureText);

const TOKEN = 'good-token';
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
  await new Promise((resolve) => fakeBasegeek.close(resolve));
});

let writes;
beforeEach(() => {
  mock.restoreAll();
  writes = { game: [], player: [], profile: [] };
  const lean = (rows) => ({ lean: async () => rows });
  mock.method(Game, 'find', () => lean([]));
  mock.method(GamePlayer, 'find', () => lean([]));
  mock.method(Game, 'bulkWrite', async (ops) => writes.game.push(...ops));
  mock.method(GamePlayer, 'bulkWrite', async (ops) => writes.player.push(...ops));
  mock.method(Profile, 'findOneAndUpdate', async (filter, update) => writes.profile.push({ filter, update }));
});

const app = createApp();
const post = (query = '') =>
  request(app).post(`/api/import/playnite${query}`).set('Authorization', `Bearer ${TOKEN}`);

describe('POST /api/import/playnite', () => {
  test('401 with no session', async () => {
    const res = await request(app).post('/api/import/playnite').send(fixture);
    assert.equal(res.status, 401);
    assert.equal(Game.find.mock.callCount(), 0);
  });

  test('JSON body: a dry run by default, with the documented shape, writing nothing', async () => {
    const res = await post().send(fixture);
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['committed', 'counts', 'generatedAtUtc', 'samples', 'schemaVersion', 'total']);
    assert.equal(res.body.committed, false);
    assert.equal(res.body.schemaVersion, 1);
    assert.equal(res.body.total, 14);
    assert.deepEqual(res.body.counts, { create: 10, addCopy: 0, update: 0, unchanged: 0, skippedHidden: 4, notInFile: 0, invalid: 0, movedToPlaying: 0, flaggedUninstalled: 0 });
    assert.deepEqual(Object.keys(res.body.samples).sort(), ['addCopy', 'create', 'flaggedUninstalled', 'movedToPlaying', 'notInFile', 'update']);
    assert.equal(writes.game.length + writes.player.length + writes.profile.length, 0);
    // Scoped to the caller's household and user.
    assert.deepEqual(Game.find.mock.calls[0].arguments[0], { householdId: 'default' });
    assert.deepEqual(GamePlayer.find.mock.calls[0].arguments[0], { userId: 'user-1', householdId: 'default' });
  });

  test('multipart file: accepted, flags as fields ("true"/"false" strings)', async () => {
    const res = await post()
      .field('includeHidden', 'true')
      .field('dryRun', 'true')
      .attach('file', Buffer.from(fixtureText), { filename: 'playnite-library.json', contentType: 'application/json' });
    assert.equal(res.status, 200);
    assert.equal(res.body.counts.create, 13);
    assert.equal(res.body.counts.addCopy, 1);
    assert.equal(res.body.counts.skippedHidden, 0);
    assert.equal(res.body.committed, false);
  });

  test('includeHidden as a query param', async () => {
    const res = await post('?includeHidden=true').send(fixture);
    assert.equal(res.body.counts.skippedHidden, 0);
    const off = await post('?includeHidden=false').send(fixture);
    assert.equal(off.body.counts.skippedHidden, 4);
  });

  test('dryRun=false commits: games, player rows and the profile stamp', async () => {
    const res = await post('?dryRun=false').send(fixture);
    assert.equal(res.status, 200);
    assert.equal(res.body.committed, true);
    assert.equal(writes.game.filter((o) => o.insertOne).length, 10);
    assert.equal(writes.player.length, 10);
    assert.equal(writes.profile.length, 1);
    const { filter, update } = writes.profile[0];
    assert.deepEqual(filter, { userId: 'user-1' });
    assert.ok(update.$set['playnite.lastImportAt'] instanceof Date);
    assert.equal(update.$set['playnite.lastGeneratedAtUtc'].toISOString(), '2026-09-25T16:21:03.000Z');
    assert.equal(update.$set['playnite.lastTotal'], 14);
  });

  test('400 PLAYNITE_BAD_FILE: unknown schemaVersion, not JSON, no file', async () => {
    const wrongVersion = await post().send({ ...fixture, schemaVersion: 2 });
    assert.equal(wrongVersion.status, 400);
    assert.equal(wrongVersion.body.code, 'PLAYNITE_BAD_FILE');

    const notJsonFile = await post().attach('file', Buffer.from('{nope'), { filename: 'x.json', contentType: 'application/json' });
    assert.equal(notJsonFile.status, 400);
    assert.equal(notJsonFile.body.code, 'PLAYNITE_BAD_FILE');

    const notJsonBody = await post().set('Content-Type', 'application/json').send('{nope');
    assert.equal(notJsonBody.status, 400);
    assert.equal(notJsonBody.body.code, 'PLAYNITE_BAD_FILE');

    const noFile = await post().field('dryRun', 'true');
    assert.equal(noFile.status, 400);
    assert.equal(noFile.body.code, 'PLAYNITE_BAD_FILE');

    const plainText = await post().set('Content-Type', 'text/plain').send('hello');
    assert.equal(plainText.status, 400);
    assert.equal(plainText.body.code, 'PLAYNITE_BAD_FILE');
  });

  test('accepts a JSON body far above the app-wide 100 kB limit', async () => {
    const pad = 'x'.repeat(150);
    const big = { ...fixture, games: Array.from({ length: 2000 }, (_, i) => ({ ...fixture.games[0], playniteId: `p${i}`, name: `Game ${i}`, note: pad })) };
    assert.ok(JSON.stringify(big).length > 500 * 1024);
    const res = await post().send(big);
    assert.equal(res.status, 200);
    assert.equal(res.body.counts.create, 2000);
  });

  test('413 above 20 MB', async () => {
    const res = await post().set('Content-Type', 'application/json').send(`{"schemaVersion":1,"games":[],"pad":"${'x'.repeat(21 * 1024 * 1024)}"}`);
    assert.equal(res.status, 413);
    assert.equal(res.body.code, 'PLAYNITE_TOO_LARGE');
  });

  test('the larger limit is this route only: other routes keep the default JSON limit', async () => {
    const res = await request(app)
      .post('/api/import/steam')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ steamId: 'x'.repeat(200 * 1024) }));
    assert.equal(res.status, 413);
  });
});
