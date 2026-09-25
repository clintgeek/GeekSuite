/**
 * GET /api/import/playnite/drop/status — the Nextcloud auto-import's state
 * for the calling user (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md, folder
 * import). Runs the real watcher against a temp directory so `enabled` and
 * `watching` reflect real folder resolution; only the ledger read is mocked.
 */
import { describe, test, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import createApp from '../src/app.js';
import PlayniteDropFile from '../src/models/PlayniteDropFile.js';
import { startPlayniteDropImport } from '../src/playnite/dropWatcher.js';

let fakeBasegeek;
let previousUrl;
const USERS = {
  'good-token': { id: 'user-1', username: 'clint@clintgeek.com' },
  'other-token': { id: 'user-2', username: 'nofolder-person' },
};

before(async () => {
  fakeBasegeek = http.createServer((req, res) => {
    const auth = req.headers.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    const user = token && USERS[token];
    res.writeHead(user ? 200 : 401, { 'content-type': 'application/json' });
    res.end(JSON.stringify(user ? { user } : { message: 'nope' }));
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

const app = createApp();
const statusAs = (token) => request(app).get('/api/import/playnite/drop/status').set('Authorization', `Bearer ${token}`);

describe('GET /api/import/playnite/drop/status — the watcher is running', () => {
  let root;
  let importer;

  beforeEach(async () => {
    mock.restoreAll();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'gamegeek-drop-status-'));
    await fs.mkdir(path.join(root, 'clint@clintgeek.com'));
    const resolveUser = async (name) => (name.toLowerCase() === 'clint@clintgeek.com' ? 'user-1' : null);
    importer = startPlayniteDropImport({ root, settle: { intervalMs: 5, attempts: 3 }, debounceMs: 10, resolveUser });
    await importer.idle();
  });

  afterEach(async () => {
    await importer.stop();
    await fs.rm(root, { recursive: true, force: true });
  });

  test('401 with no session', async () => {
    const res = await request(app).get('/api/import/playnite/drop/status');
    assert.equal(res.status, 401);
  });

  test('a user whose folder exists and resolved: enabled, watching, and the display folder path', async () => {
    mock.method(PlayniteDropFile, 'findOne', () => ({ sort: () => ({ lean: async () => null }) }));
    const res = await statusAs('good-token');
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);
    assert.equal(res.body.watching, true);
    assert.equal(res.body.folder, 'gamegeek-import/clint@clintgeek.com/');
    assert.equal(res.body.lastFile, null);
  });

  test('a user with no matching folder: enabled, but not watching, folder line still shown', async () => {
    mock.method(PlayniteDropFile, 'findOne', () => ({ sort: () => ({ lean: async () => null }) }));
    const res = await statusAs('other-token');
    assert.equal(res.status, 200);
    assert.equal(res.body.enabled, true);
    assert.equal(res.body.watching, false);
    assert.equal(res.body.folder, 'gamegeek-import/nofolder-person/');
  });

  test('reports the last processed file for this user, most recent first', async () => {
    const row = {
      relPath: 'clint@clintgeek.com/playnite-library.json',
      status: 'imported',
      processedAt: new Date('2026-09-25T10:00:00Z'),
      generatedAtUtc: new Date('2026-09-25T09:00:00Z'),
      counts: { create: 3, addCopy: 0, update: 1, unchanged: 900, skippedHidden: 200, notInFile: 0, invalid: 0 },
      error: null,
    };
    mock.method(PlayniteDropFile, 'findOne', () => ({ sort: () => ({ lean: async () => row }) }));
    const res = await statusAs('good-token');
    assert.deepEqual(res.body.lastFile, {
      name: 'playnite-library.json',
      status: 'imported',
      processedAt: '2026-09-25T10:00:00.000Z',
      generatedAtUtc: '2026-09-25T09:00:00.000Z',
      counts: row.counts,
      error: null,
    });
  });

  test('a failed last file surfaces its error, quietly', async () => {
    const row = {
      relPath: 'clint@clintgeek.com/playnite-library.json',
      status: 'failed',
      processedAt: new Date('2026-09-25T10:00:00Z'),
      generatedAtUtc: null,
      counts: null,
      error: 'Unsupported Playnite export schemaVersion (2); expected 1',
    };
    mock.method(PlayniteDropFile, 'findOne', () => ({ sort: () => ({ lean: async () => row }) }));
    const res = await statusAs('good-token');
    assert.equal(res.body.lastFile.status, 'failed');
    assert.equal(res.body.lastFile.error, row.error);
  });
});

describe('GET /api/import/playnite/drop/status — the watcher is off', () => {
  test('disabled: enabled false, watching false, no folder line', async () => {
    mock.restoreAll();
    const importer = startPlayniteDropImport({ disabled: '1' });
    await importer.idle();
    mock.method(PlayniteDropFile, 'findOne', () => ({ sort: () => ({ lean: async () => null }) }));
    const res = await statusAs('good-token');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { enabled: false, watching: false, folder: null, lastFile: null });
    await importer.stop();
  });
});
