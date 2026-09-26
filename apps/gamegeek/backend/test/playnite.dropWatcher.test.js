/**
 * The Nextcloud drop watcher (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md, folder
 * import). Run against real temp directories and real files — only the
 * mongoose models are mocked (the same statics playnite.route.test.js mocks),
 * so what's under test is entirely the part that decides WHEN and WHETHER a
 * file is imported, and that the drop folder is never written to. The commit
 * path itself (importPlanner/commit.js) has its own suite and is exercised
 * here for real.
 */
import { describe, test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Game from '../src/models/Game.js';
import GamePlayer from '../src/models/GamePlayer.js';
import Profile from '../src/models/Profile.js';
import PlayniteDropFile from '../src/models/PlayniteDropFile.js';
import {
  isCandidateFile, waitForStableJson, processFile, startPlayniteDropImport,
  getPlayniteDropStatus, folderNameFor,
} from '../src/playnite/dropWatcher.js';

const FAST = { intervalMs: 5, attempts: 6 };

const entry = (over = {}) => ({
  playniteId: over.playniteId ?? 'pid-1',
  name: over.name ?? 'Hades',
  sourceName: 'Epic',
  steamAppIdConfidence: 'none',
  platforms: ['PC (Windows)'],
  genres: [],
  categories: [],
  tags: [],
  playtimeSeconds: 0,
  hidden: false,
  ...over,
});

const exportJson = (games, generatedAtUtc = '2026-09-20T00:00:00Z') => ({
  schemaVersion: 1,
  generatedAtUtc,
  games,
});

let ledger;
let profiles;

function fakeLedgerFindOne(filter) {
  return {
    lean: async () => ledger.find((r) => Object.entries(filter).every(([k, v]) => r[k] === v)) ?? null,
    sort: () => ({ lean: async () => [...ledger].sort((a, b) => (b.processedAt ?? 0) - (a.processedAt ?? 0))[0] ?? null }),
  };
}

beforeEach(() => {
  ledger = [];
  profiles = new Map(); // userId -> profile doc
  mock.restoreAll();
  mock.method(PlayniteDropFile, 'findOne', fakeLedgerFindOne);
  mock.method(PlayniteDropFile, 'findOneAndUpdate', async (filter, update) => {
    const idx = ledger.findIndex((r) => r.userId === filter.userId && r.relPath === filter.relPath);
    const set = update.$set ?? {};
    if (idx === -1) ledger.push({ ...set });
    else ledger[idx] = { ...ledger[idx], ...set };
    return null;
  });
  mock.method(Game, 'find', () => ({ lean: async () => [] }));
  mock.method(GamePlayer, 'find', () => ({ lean: async () => [] }));
  mock.method(Game, 'bulkWrite', async () => ({}));
  mock.method(GamePlayer, 'bulkWrite', async () => ({}));
  mock.method(Profile, 'findOne', (filter) => ({ lean: async () => profiles.get(filter.userId) ?? null }));
  mock.method(Profile, 'findOneAndUpdate', async (filter, update) => {
    const before = profiles.get(filter.userId) ?? { userId: filter.userId };
    const after = { ...before };
    for (const [k, v] of Object.entries(update.$set ?? {})) {
      if (k.startsWith('playnite.')) {
        after.playnite = { ...after.playnite, [k.slice('playnite.'.length)]: v };
      } else {
        after[k] = v;
      }
    }
    profiles.set(filter.userId, after);
    return after;
  });
});

test('isCandidateFile: only non-dotfile .json files', () => {
  assert.equal(isCandidateFile('playnite-library.json'), true);
  assert.equal(isCandidateFile('EXPORT.JSON'), true);
  assert.equal(isCandidateFile('.hidden.json'), false);
  assert.equal(isCandidateFile('report.pdf'), false);
  assert.equal(isCandidateFile(''), false);
});

describe('waitForStableJson', () => {
  let root;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'gamegeek-drop-')); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  test('a file already stable and valid settles on the first pass', async () => {
    const file = path.join(root, 'a.json');
    await fs.writeFile(file, JSON.stringify(exportJson([entry()])));
    const result = await waitForStableJson(file, FAST);
    assert.ok(result);
    assert.equal(JSON.parse(result.buffer.toString('utf8')).schemaVersion, 1);
  });

  test('a half-written file is retried, not ledgered, until it stops changing', async () => {
    const file = path.join(root, 'growing.json');
    const full = JSON.stringify(exportJson([entry()]));
    await fs.writeFile(file, full.slice(0, 10)); // truncated, invalid JSON
    let writes = 0;
    const timer = setInterval(async () => {
      writes += 1;
      const next = full.slice(0, Math.min(full.length, 10 + writes * 20));
      await fs.writeFile(file, next);
      if (next.length >= full.length) clearInterval(timer); // the "upload" is done
    }, 4);
    try {
      const result = await waitForStableJson(file, { intervalMs: 5, attempts: 40 });
      assert.ok(result, 'should eventually settle once the write finishes');
      assert.equal(JSON.parse(result.buffer.toString('utf8')).games.length, 1);
    } finally {
      clearInterval(timer);
    }
  });

  test('a file that never becomes valid JSON gives up and returns null', async () => {
    const file = path.join(root, 'junk.json');
    await fs.writeFile(file, 'not json at all');
    const result = await waitForStableJson(file, FAST);
    assert.equal(result, null);
  });

  test('a file that vanishes mid-check returns null', async () => {
    const file = path.join(root, 'gone.json');
    await fs.writeFile(file, JSON.stringify(exportJson([entry()])));
    const p = waitForStableJson(file, { intervalMs: 30, attempts: 5 });
    await fs.rm(file);
    assert.equal(await p, null);
  });
});

describe('processFile', () => {
  let root;
  let dir;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'gamegeek-drop-'));
    dir = path.join(root, 'clint@clintgeek.com');
    await fs.mkdir(dir);
  });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  const put = (name, data) => fs.writeFile(path.join(dir, name), typeof data === 'string' ? data : JSON.stringify(data));
  const call = (filename, over = {}) =>
    processFile({ root, folder: 'clint@clintgeek.com', userId: 'user-1', filename, settle: FAST, ...over });

  test('imports a new export, ledgers it by (userId, relPath), and stamps the profile as folder-sourced', async () => {
    await put('playnite-library.json', exportJson([entry()]));
    const outcome = await call('playnite-library.json');
    assert.equal(outcome, 'imported');
    assert.equal(ledger.length, 1);
    assert.match(ledger[0].sha256, /^[0-9a-f]{64}$/);
    assert.equal(ledger[0].status, 'imported');
    assert.equal(ledger[0].relPath, 'clint@clintgeek.com/playnite-library.json');
    assert.deepEqual(ledger[0].counts, { create: 1, addCopy: 0, update: 0, unchanged: 0, skippedHidden: 0, notInFile: 0, invalid: 0, movedToPlaying: 0, flaggedUninstalled: 0 });
    assert.equal(profiles.get('user-1').playnite.lastSource, 'folder');
    assert.equal(profiles.get('user-1').playnite.lastTotal, 1);
  });

  test('hidden entries are never imported by the auto path — no setting can turn it on', async () => {
    await put('playnite-library.json', exportJson([entry({ hidden: true })]));
    const outcome = await call('playnite-library.json');
    assert.equal(outcome, 'imported');
    assert.deepEqual(ledger[0].counts, { create: 0, addCopy: 0, update: 0, unchanged: 0, skippedHidden: 1, notInFile: 0, invalid: 0, movedToPlaying: 0, flaggedUninstalled: 0 });
  });

  test('re-processing the exact same bytes is a cheap no-op ("unchanged")', async () => {
    await put('playnite-library.json', exportJson([entry()]));
    assert.equal(await call('playnite-library.json'), 'imported');
    assert.equal(await call('playnite-library.json'), 'unchanged');
    assert.equal(ledger.length, 1); // no second row
  });

  test('the same content, seen under a different sha history, is a sha duplicate — not re-committed', async () => {
    await put('playnite-library.json', exportJson([entry()], '2026-09-20T00:00:00Z'));
    assert.equal(await call('playnite-library.json'), 'imported');

    // A second, differently-named path with byte-identical content (e.g. a
    // one-off manual copy dropped next to it) must not commit twice.
    await fs.mkdir(path.join(root, 'other-copy'));
    const bytes = await fs.readFile(path.join(dir, 'playnite-library.json'));
    await fs.writeFile(path.join(root, 'other-copy', 'playnite-library.json'), bytes);
    const outcome = await processFile({ root, folder: 'other-copy', userId: 'user-1', filename: 'playnite-library.json', settle: FAST });
    assert.equal(outcome, 'skipped-duplicate');
    assert.equal(ledger.filter((r) => r.status === 'imported').length, 1);
  });

  test('generatedAtUtc no newer than the profile\'s last import is skipped-older, never overwriting a newer state', async () => {
    profiles.set('user-1', { userId: 'user-1', playnite: { lastGeneratedAtUtc: '2026-09-22T00:00:00Z', lastTotal: 50 } });
    await put('playnite-library.json', exportJson([entry()], '2026-09-20T00:00:00Z'));
    const outcome = await call('playnite-library.json');
    assert.equal(outcome, 'skipped-older');
    assert.equal(ledger[0].status, 'skipped-older');
    // The profile must be untouched — an older export never overwrites a newer one.
    assert.equal(profiles.get('user-1').playnite.lastTotal, 50);
  });

  test('a file that fails to parse is ledgered failed and not retried until its sha changes', async () => {
    await put('playnite-library.json', '{"schemaVersion": 2, "games": []}');
    assert.equal(await call('playnite-library.json'), 'failed');
    assert.equal(ledger[0].status, 'failed');
    assert.match(ledger[0].error, /schemaVersion/);

    // Same bad bytes again — not re-attempted (still 1 ledger row, still failed).
    assert.equal(await call('playnite-library.json'), 'unchanged');
    assert.equal(ledger.length, 1);

    // Now the content changes (fixed) — it IS retried, because the sha changed.
    await put('playnite-library.json', exportJson([entry()]));
    assert.equal(await call('playnite-library.json'), 'imported');
    assert.equal(ledger[0].status, 'imported');
  });

  test('a commit failure (e.g. a household write blowing up) is ledgered failed, not thrown', async () => {
    mock.method(Game, 'bulkWrite', async () => { throw new Error('mongo is down'); });
    await put('playnite-library.json', exportJson([entry()]));
    const outcome = await call('playnite-library.json');
    assert.equal(outcome, 'failed');
    assert.match(ledger[0].error, /mongo is down/);
  });

  test('a file that never settles is not-ready and nothing is ledgered', async () => {
    // No file at all — waitForStableJson's stat rejects immediately.
    const outcome = await call('does-not-exist.json');
    assert.equal(outcome, 'not-ready');
    assert.equal(ledger.length, 0);
  });

  test('never writes to, renames, or deletes anything under the drop root', async () => {
    await put('playnite-library.json', exportJson([entry()]));
    const before = await fs.readFile(path.join(dir, 'playnite-library.json'));
    const listingBefore = (await fs.readdir(root, { recursive: true })).sort();
    await call('playnite-library.json');
    const after = await fs.readFile(path.join(dir, 'playnite-library.json'));
    const listingAfter = (await fs.readdir(root, { recursive: true })).sort();
    assert.deepEqual(before, after);
    assert.deepEqual(listingBefore, listingAfter);
  });
});

describe('startPlayniteDropImport', () => {
  let root;
  beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'gamegeek-drop-')); });
  afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

  test('PLAYNITE_DROP_DISABLED wins even with a real root', async () => {
    await fs.mkdir(path.join(root, 'someone'));
    const resolveUser = mock.fn(async () => 'user-1');
    const importer = startPlayniteDropImport({ root, disabled: '1', resolveUser });
    await importer.idle();
    await importer.stop();
    assert.equal(getPlayniteDropStatus().enabled, false);
    assert.equal(resolveUser.mock.callCount(), 0);
  });

  test('no root and no default mount -> off', async () => {
    const importer = startPlayniteDropImport({ root: '', defaultRoot: path.join(root, 'nope') });
    await importer.idle();
    await importer.stop();
    assert.equal(getPlayniteDropStatus().enabled, false);
  });

  test('imports each known user\'s folder, skips a folder nobody owns, and reports who is being watched', async () => {
    const USERS = { 'clint@clintgeek.com': 'user-clint', jess: 'user-jess' };
    const resolveUser = async (name) => USERS[name.toLowerCase()] ?? null;
    await fs.mkdir(path.join(root, 'clint@clintgeek.com'));
    await fs.mkdir(path.join(root, 'Jess'));
    await fs.mkdir(path.join(root, 'stranger'));
    await fs.writeFile(path.join(root, 'clint@clintgeek.com', 'playnite-library.json'), JSON.stringify(exportJson([entry()])));
    await fs.writeFile(path.join(root, 'Jess', 'playnite-library.json'), JSON.stringify(exportJson([entry({ playniteId: 'pid-2' })])));
    await fs.writeFile(path.join(root, 'stranger', 'playnite-library.json'), JSON.stringify(exportJson([entry({ playniteId: 'pid-3' })])));

    const importer = startPlayniteDropImport({ root, settle: FAST, debounceMs: 10, resolveUser });
    await importer.idle();

    assert.equal(getPlayniteDropStatus().enabled, true);
    assert.equal(folderNameFor('user-clint'), 'clint@clintgeek.com');
    assert.equal(folderNameFor('user-jess'), 'Jess');
    assert.equal(folderNameFor('user-unknown'), null);
    assert.deepEqual(ledger.map((r) => r.userId).sort(), ['user-clint', 'user-jess']);

    await importer.stop();
    assert.equal(getPlayniteDropStatus().enabled, false, 'stop() clears the singleton');
  });

  test('a user folder created after boot is found and imported without a restart', async () => {
    const resolveUser = async (name) => (name === 'heather' ? 'user-heather' : null);
    const importer = startPlayniteDropImport({ root, settle: FAST, debounceMs: 10, resolveUser });
    await importer.idle();

    await fs.mkdir(path.join(root, 'heather'));
    await fs.writeFile(path.join(root, 'heather', 'playnite-library.json'), JSON.stringify(exportJson([entry()])));

    const until = Date.now() + 3000;
    while (ledger.length === 0) {
      if (Date.now() > until) throw new Error('timed out waiting for the late folder to be picked up');
      await new Promise((r) => setTimeout(r, 15));
    }
    await importer.stop();
    assert.deepEqual(ledger.map((r) => r.userId), ['user-heather']);
  });

  test('the periodic rescan catches a folder that appeared with no watch on it yet', async () => {
    const resolveUser = async (name) => (name === 'late-user' ? 'user-late' : null);
    const importer = startPlayniteDropImport({ root, settle: FAST, rescanMs: 40, resolveUser });
    await importer.idle();

    // Simulate the folder appearing without relying on the root watch firing
    // (covered by the previous test) — the rescan alone must still find it.
    await fs.mkdir(path.join(root, 'late-user'));
    await fs.writeFile(path.join(root, 'late-user', 'playnite-library.json'), JSON.stringify(exportJson([entry()])));

    const until = Date.now() + 3000;
    while (ledger.length === 0) {
      if (Date.now() > until) throw new Error('timed out waiting for the rescan');
      await new Promise((r) => setTimeout(r, 15));
    }
    await importer.stop();
    assert.equal(ledger[0].userId, 'user-late');
  });
});
