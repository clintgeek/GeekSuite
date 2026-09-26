/**
 * src/jobs/purge.js — the only place bytes are deleted.
 */
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { runPurge, startPurgeSchedule } from '../src/jobs/purge.js';
import { createFakeModel } from './helpers/fakeModel.js';
import { makeTempDir, newId } from './helpers/harness.js';

const NOW = new Date('2026-09-25T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86_400_000);
const now = () => NOW;

let root;
beforeEach(() => { root = makeTempDir('thinggeek-purge-'); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function fileRec({ household = 'default', age = 40, name = String(newId()), thumb = true } = {}) {
  const rel = `${household}/2026/01/${name}.jpg`;
  const thumbRel = thumb ? `${household}/2026/01/${name}.thumb.webp` : null;
  fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), 'bytes');
  if (thumbRel) fs.writeFileSync(path.join(root, thumbRel), 'thumb');
  return { _id: newId(), householdId: household, kind: 'photo', mime: 'image/jpeg', size: 5, sha256: name, path: rel, thumbPath: thumbRel, createdAt: daysAgo(age), updatedAt: daysAgo(age) };
}
const thing = (o = {}) => ({ _id: newId(), householdId: 'default', name: 't', photos: [], documents: [], relationships: [], deletedAt: null, ...o });
const onDisk = (rel) => fs.existsSync(path.join(root, rel));

function models(things, files, hooks = {}) {
  return {
    Thing: createFakeModel(things, { now, hooks: hooks.Thing }),
    ThingFile: createFakeModel(files, { now, hooks: hooks.ThingFile }),
  };
}

describe('things', () => {
  test('trashed longer than TRASH_DAYS → hard-deleted; young trash and live things kept', async () => {
    const old = thing({ deletedAt: daysAgo(31) });
    const young = thing({ deletedAt: daysAgo(5) });
    const live = thing({ relationships: [{ _id: newId(), kind: 'equipped-with', thingId: old._id }, { _id: newId(), kind: 'stored-with', thingId: young._id }] });
    const { Thing, ThingFile } = models([old, young, live], []);
    const out = await runPurge({ Thing, ThingFile, filesRoot: root, now });
    assert.equal(out.things, 1);
    const ids = Thing.docs.map((d) => String(d._id));
    assert.ok(!ids.includes(String(old._id)));
    assert.ok(ids.includes(String(young._id)));
    assert.ok(ids.includes(String(live._id)));
    // The purged thing's inbound edges are pulled; the young one's stay.
    const rels = Thing.docs.find((d) => String(d._id) === String(live._id)).relationships;
    assert.deepEqual(rels.map((r) => String(r.thingId)), [String(young._id)]);
  });

  test('a restore that lands between find and delete is honoured', async () => {
    const old = thing({ deletedAt: daysAgo(40) });
    const { Thing, ThingFile } = models([old], [], {
      Thing: { beforeDelete: (f, m) => { m.docs[0].deletedAt = null; } },
    });
    const out = await runPurge({ Thing, ThingFile, filesRoot: root, now });
    assert.equal(out.things, 0);
    assert.equal(Thing.docs.length, 1);
  });

  test('other households are purged on their own terms, never across', async () => {
    const mine = thing({ deletedAt: daysAgo(40) });
    const theirs = thing({ householdId: 'other', deletedAt: daysAgo(40) });
    const { Thing, ThingFile } = models([mine, theirs], []);
    const out = await runPurge({ Thing, ThingFile, filesRoot: root, now });
    assert.equal(out.things, 2);
    for (const call of Thing.calls.filter(([op]) => ['find', 'deleteMany', 'updateMany', 'exists'].includes(op))) {
      assert.ok(call[1].householdId, `${call[0]} must be household-scoped`);
    }
  });
});

describe('files', () => {
  test('unreferenced and old → record, bytes and thumbnail removed', async () => {
    const f = fileRec({ age: 40 });
    const { Thing, ThingFile } = models([], [f]);
    const out = await runPurge({ Thing, ThingFile, filesRoot: root, now });
    assert.equal(out.files, 1);
    assert.equal(ThingFile.docs.length, 0);
    assert.ok(!onDisk(f.path));
    assert.ok(!onDisk(f.thumbPath));
  });

  test('unreferenced but young → kept', async () => {
    const f = fileRec({ age: 3 });
    const { Thing, ThingFile } = models([], [f]);
    await runPurge({ Thing, ThingFile, filesRoot: root, now });
    assert.equal(ThingFile.docs.length, 1);
    assert.ok(onDisk(f.path));
  });

  test('referenced by a live thing (photo or document) → never deleted, however old', async () => {
    const a = fileRec({ age: 400 });
    const b = fileRec({ age: 400 });
    const t = thing({ photos: [{ _id: newId(), fileId: a._id, role: 'overview' }], documents: [{ _id: newId(), fileId: b._id, role: 'receipt' }] });
    const { Thing, ThingFile } = models([t], [a, b]);
    const out = await runPurge({ Thing, ThingFile, filesRoot: root, now });
    assert.equal(out.files, 0);
    assert.equal(ThingFile.docs.length, 2);
    assert.ok(onDisk(a.path) && onDisk(b.path) && onDisk(a.thumbPath));
  });

  test('referenced only by a trashed-but-young thing → kept (trash still owns its files)', async () => {
    const f = fileRec({ age: 400 });
    const t = thing({ deletedAt: daysAgo(10), photos: [{ _id: newId(), fileId: f._id, role: 'overview' }] });
    const { Thing, ThingFile } = models([t], [f]);
    await runPurge({ Thing, ThingFile, filesRoot: root, now });
    assert.equal(Thing.docs.length, 1);
    assert.equal(ThingFile.docs.length, 1);
    assert.ok(onDisk(f.path));
  });

  test('a thing purged this pass frees its old files in the same pass', async () => {
    const f = fileRec({ age: 60 });
    const t = thing({ deletedAt: daysAgo(31), photos: [{ _id: newId(), fileId: f._id, role: 'overview' }] });
    const { Thing, ThingFile } = models([t], [f]);
    const out = await runPurge({ Thing, ThingFile, filesRoot: root, now });
    assert.deepEqual([out.things, out.files], [1, 1]);
    assert.ok(!onDisk(f.path));
  });

  test('a reference that appears just before the delete is re-checked → kept', async () => {
    const f = fileRec({ age: 40 });
    const holder = thing();
    let checks = 0;
    const { Thing, ThingFile } = models([holder], [f], {
      Thing: {
        // The batch-level scan saw nothing; an upload attaches the file
        // between the scan and the per-file check.
        beforeExists: (filter, m) => {
          checks += 1;
          if (filter.$or) m.docs[0].photos.push({ _id: newId(), fileId: f._id, role: 'overview' });
        },
      },
    });
    const out = await runPurge({ Thing, ThingFile, filesRoot: root, now });
    assert.ok(checks >= 1);
    assert.equal(out.files, 0);
    assert.equal(ThingFile.docs.length, 1);
    assert.ok(onDisk(f.path));
  });

  test('a dedupe reuse (updatedAt touched) racing the delete → kept', async () => {
    const f = fileRec({ age: 40 });
    const { Thing, ThingFile } = models([], [f], {
      ThingFile: { beforeDelete: (filter, m) => { m.docs[0].updatedAt = NOW; } },
    });
    const out = await runPurge({ Thing, ThingFile, filesRoot: root, now });
    assert.equal(out.files, 0);
    assert.ok(onDisk(f.path));
  });

  test("a household's files are checked against its own things only", async () => {
    const f = fileRec({ household: 'other', age: 40 });
    // A same-id reference from ANOTHER household must not keep it alive…
    const decoy = thing({ photos: [{ _id: newId(), fileId: f._id, role: 'overview' }] });
    const { Thing, ThingFile } = models([decoy], [f]);
    const out = await runPurge({ Thing, ThingFile, filesRoot: root, now });
    assert.equal(out.files, 1);
    assert.ok(!onDisk(f.path));
  });

  test('bytes shared with a surviving record are not unlinked', async () => {
    const a = fileRec({ age: 40, name: 'samesha' });
    const b = { ...fileRec({ age: 1, name: 'samesha' }), _id: newId() };
    const { Thing, ThingFile } = models([], [a, b]);
    const out = await runPurge({ Thing, ThingFile, filesRoot: root, now });
    assert.equal(out.files, 1);
    assert.equal(ThingFile.docs.length, 1);
    assert.ok(onDisk(a.path), 'the young record still needs these bytes');
  });

  test('a stored path outside FILES_PATH is never unlinked', async () => {
    const outside = path.join(path.dirname(root), `thinggeek-keep-${process.pid}.txt`);
    fs.writeFileSync(outside, 'keep');
    try {
      const f = { ...fileRec({ age: 40 }), path: `../${path.basename(outside)}`, thumbPath: outside };
      const { Thing, ThingFile } = models([], [f]);
      await runPurge({ Thing, ThingFile, filesRoot: root, now });
      assert.ok(fs.existsSync(outside));
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });

  test('batches page through more files than one batch', async () => {
    const files = Array.from({ length: 7 }, () => fileRec({ age: 40, thumb: false }));
    const keep = fileRec({ age: 40 });
    const t = thing({ photos: [{ _id: newId(), fileId: keep._id, role: 'overview' }] });
    const { Thing, ThingFile } = models([t], [...files, keep]);
    const out = await runPurge({ Thing, ThingFile, filesRoot: root, now, batchSize: 3 });
    assert.equal(out.files, 7);
    assert.equal(out.filesKept, 1);
    assert.deepEqual(ThingFile.docs.map((d) => String(d._id)), [String(keep._id)]);
  });
});

describe('schedule', () => {
  test('off outside production, and off with PURGE_DISABLED=1', () => {
    const { Thing, ThingFile } = models([], []);
    assert.equal(startPurgeSchedule({ Thing, ThingFile, env: { NODE_ENV: 'development' } }).enabled, false);
    assert.equal(startPurgeSchedule({ Thing, ThingFile, env: { NODE_ENV: 'production', PURGE_DISABLED: '1' } }).enabled, false);
  });

  test('on in production: unref\'d timers, stoppable', () => {
    const { Thing, ThingFile } = models([], []);
    const s = startPurgeSchedule({ Thing, ThingFile, filesRoot: root, env: { NODE_ENV: 'production' } });
    assert.equal(s.enabled, true);
    s.stop();
  });

  test('logs counts only — no ids, paths or names', async () => {
    const f = fileRec({ age: 40 });
    const lines = [];
    const log = { info: (o) => lines.push(o), warn: (o) => lines.push(o), error: (o) => lines.push(o) };
    const { Thing, ThingFile } = models([thing({ deletedAt: daysAgo(40) })], [f]);
    await runPurge({ Thing, ThingFile, filesRoot: root, now, log });
    const text = JSON.stringify(lines);
    assert.ok(!text.includes(String(f._id)));
    assert.ok(!text.includes(f.path));
    assert.ok(!text.includes(f.sha256));
  });
});
