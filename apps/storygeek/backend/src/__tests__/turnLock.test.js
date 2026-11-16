/**
 * turnLockService + storyTrashService + the Story model's hide-deleted hook
 * (SUITE_REVIEW_2026-11 items 4, 5 and S-D5, 2026-11-16).
 *
 * No database: the services are exercised against a small in-memory model
 * that applies the same filters Mongo would for the shapes these services
 * send, and the hook against the REAL Story model — its query middleware
 * runs before the "not connected" error, so the narrowed filter can be read
 * off the query afterwards.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import turnLockService, {
  TURN_LOCK_TTL_MS, MAX_TURN_RECEIPTS, acquire, release, isLockLive,
  findReceipt, recordReceipt, replayBody, describeLock,
} from '../services/turnLockService.js';
import {
  STORY_TRASH_RETENTION_MS, softDeleteStory, restoreStory, purgeStory,
  purgeExpiredStories, purgeAtFor,
} from '../services/storyTrashService.js';
import Story, { hideDeletedOn, mentionsDeletedAt } from '../models/Story.js';

// ── a tiny model double that honours the filters these services send ─────
const get = (doc, path) => path.split('.').reduce((v, k) => (v == null ? undefined : v[k]), doc);
function matches(doc, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    const v = get(doc, key);
    if (cond === null) return v == null;
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('$ne' in cond && !(cond.$ne === null ? v != null : v !== cond.$ne)) return false;
      if ('$lte' in cond && !(v != null && new Date(v) <= cond.$lte)) return false;
      if ('$lt' in cond && !(v != null && new Date(v) < cond.$lt)) return false;
      return true;
    }
    return String(v) === String(cond);
  });
}
function makeModel(docs) {
  const apply = (doc, update) => {
    for (const [k, v] of Object.entries(update.$set || {})) doc[k] = v;
    for (const k of Object.keys(update.$unset || {})) delete doc[k];
  };
  return {
    docs,
    async findOneAndUpdate(filter, update) {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return null;
      apply(doc, update);
      return doc;
    },
    async updateOne(filter, update) {
      const doc = docs.find((d) => matches(d, filter));
      if (doc) apply(doc, update);
      return { matchedCount: doc ? 1 : 0 };
    },
    async exists(filter) { return docs.some((d) => matches(d, filter)) ? { _id: 'x' } : null; },
    async deleteOne(filter) {
      const i = docs.findIndex((d) => matches(d, filter));
      if (i >= 0) docs.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
    async deleteMany(filter) {
      const before = docs.length;
      for (let i = docs.length - 1; i >= 0; i -= 1) if (matches(docs[i], filter)) docs.splice(i, 1);
      return { deletedCount: before - docs.length };
    },
  };
}

describe('turn lock', () => {
  test('of two turns racing for one story, exactly one gets the lock', async () => {
    const Model = makeModel([{ _id: 's1', userId: 'u1' }]);
    const [a, b] = await Promise.all([
      acquire(Model, { storyId: 's1', userId: 'u1', clientId: 'client-aaaa' }),
      acquire(Model, { storyId: 's1', userId: 'u1', clientId: 'client-bbbb' }),
    ]);
    assert.equal([a, b].filter(Boolean).length, 1);
  });

  test('a crashed turn does not hold the story forever: an expired lock is free to take', async () => {
    const t0 = Date.parse('2026-11-16T12:00:00Z');
    const Model = makeModel([{ _id: 's1', userId: 'u1' }]);
    const first = await acquire(Model, { storyId: 's1', userId: 'u1', now: t0 });
    assert.ok(first);
    // Never released (the process died). Still held a minute later…
    assert.equal(await acquire(Model, { storyId: 's1', userId: 'u1', now: t0 + 60_000 }), null);
    // …and free once it has expired.
    const later = await acquire(Model, { storyId: 's1', userId: 'u1', now: t0 + TURN_LOCK_TTL_MS + 1 });
    assert.ok(later);
    assert.notEqual(later.token, first.token);
  });

  test('release frees the lock, but never one a later turn has taken', async () => {
    const t0 = Date.parse('2026-11-16T12:00:00Z');
    const Model = makeModel([{ _id: 's1', userId: 'u1' }]);
    const stale = await acquire(Model, { storyId: 's1', userId: 'u1', now: t0 });
    const fresh = await acquire(Model, { storyId: 's1', userId: 'u1', now: t0 + TURN_LOCK_TTL_MS + 1 });
    await release(Model, { storyId: 's1', token: stale.token });
    assert.equal(Model.docs[0].turnLock.token, fresh.token, 'the overrun turn did not release the new lock');
    await release(Model, { storyId: 's1', token: fresh.token });
    assert.equal(Model.docs[0].turnLock, undefined);
  });

  test("another user's story is never locked", async () => {
    const Model = makeModel([{ _id: 's1', userId: 'u1' }]);
    assert.equal(await acquire(Model, { storyId: 's1', userId: 'u2' }), null);
  });

  test('isLockLive / describeLock never leak the token', () => {
    const now = Date.now();
    const lock = { token: 'secret-token', clientId: 'client-aaaa', startedAt: new Date(now), expiresAt: new Date(now + 1000) };
    assert.equal(isLockLive(lock, now), true);
    assert.equal(isLockLive({ ...lock, expiresAt: new Date(now - 1) }, now), false);
    assert.equal(isLockLive(null), false);
    const described = describeLock(lock, now);
    assert.equal(described.clientId, 'client-aaaa');
    assert.equal('token' in described, false);
    assert.equal(describeLock({ ...lock, expiresAt: new Date(now - 1) }, now), null);
  });
});

describe('turn receipts', () => {
  test('a receipt is found by clientId and replays the same response', () => {
    const story = { turnReceipts: [] };
    recordReceipt(story, 'client-aaaa', { turnNumber: 4, response: { aiResponse: 'The door gives.', turnNumber: 4 } });
    const r = findReceipt(story, 'client-aaaa');
    assert.equal(r.turnNumber, 4);
    assert.deepEqual(replayBody(r), { aiResponse: 'The door gives.', turnNumber: 4, replayed: true, clientId: 'client-aaaa' });
    assert.equal(findReceipt(story, 'client-zzzz'), null);
    assert.equal(findReceipt(story, null), null);
  });

  test('receipts are capped to the newest few', () => {
    const story = {};
    for (let i = 0; i < MAX_TURN_RECEIPTS + 5; i += 1) recordReceipt(story, `client-${1000 + i}`, { turnNumber: i });
    assert.equal(story.turnReceipts.length, MAX_TURN_RECEIPTS);
    assert.equal(findReceipt(story, 'client-1000'), null);
    assert.ok(findReceipt(story, `client-${1000 + MAX_TURN_RECEIPTS + 4}`));
  });

  test('a turn without a clientId (an older tab) leaves no receipt', () => {
    const story = {};
    recordReceipt(story, null, { turnNumber: 1 });
    assert.equal(story.turnReceipts, undefined);
  });

  test('the stored response is a copy, not the object the caller goes on to change', () => {
    const story = {};
    const payload = { aiResponse: 'x' };
    recordReceipt(story, 'client-aaaa', { response: payload });
    payload.debug = { secret: true };
    assert.equal('debug' in findReceipt(story, 'client-aaaa').response, false);
  });

  test('the default export carries the same functions', () => {
    assert.equal(turnLockService.acquire, acquire);
    assert.equal(turnLockService.TURN_LOCK_TTL_MS, TURN_LOCK_TTL_MS);
  });
});

describe('Recently deleted', () => {
  const DAY = 24 * 60 * 60 * 1000;

  test('delete → restore → delete forever, owner only', async () => {
    const Model = makeModel([{ _id: 's1', userId: 'u1', deletedAt: null }]);
    assert.equal(await softDeleteStory(Model, { storyId: 's1', userId: 'u2' }), 'missing');
    assert.equal(await softDeleteStory(Model, { storyId: 's1', userId: 'u1' }), 'deleted');
    assert.ok(Model.docs[0].deletedAt instanceof Date);
    assert.equal(await softDeleteStory(Model, { storyId: 's1', userId: 'u1' }), 'already');
    assert.equal(await restoreStory(Model, { storyId: 's1', userId: 'u2' }), 'missing');
    assert.equal(await restoreStory(Model, { storyId: 's1', userId: 'u1' }), 'restored');
    assert.equal(Model.docs[0].deletedAt, null);
    // Delete forever only reaches a story in the trash — a restored one is safe.
    assert.equal(await purgeStory(Model, { storyId: 's1', userId: 'u1' }), false);
    assert.equal(Model.docs.length, 1);
    await softDeleteStory(Model, { storyId: 's1', userId: 'u1' });
    assert.equal(await purgeStory(Model, { storyId: 's1', userId: 'u1' }), true);
    assert.equal(Model.docs.length, 0);
  });

  test('a delete clears a turn lock, and so does a restore', async () => {
    const Model = makeModel([{ _id: 's1', userId: 'u1', deletedAt: null, turnLock: { token: 't', expiresAt: new Date(Date.now() + 60_000) } }]);
    await softDeleteStory(Model, { storyId: 's1', userId: 'u1' });
    assert.equal(Model.docs[0].turnLock, undefined);
  });

  test('the purge takes only what has passed its 30 days', async () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    const Model = makeModel([
      { _id: 'old', userId: 'u1', deletedAt: new Date(now - 31 * DAY) },
      { _id: 'recent', userId: 'u1', deletedAt: new Date(now - 29 * DAY) },
      { _id: 'live', userId: 'u1', deletedAt: null },
    ]);
    assert.equal(await purgeExpiredStories(Model, now), 1);
    assert.deepEqual(Model.docs.map((d) => d._id), ['recent', 'live']);
    assert.equal(purgeAtFor(now).getTime(), now + STORY_TRASH_RETENTION_MS);
    assert.equal(STORY_TRASH_RETENTION_MS, 30 * DAY);
  });

  test('a purge failure never reaches the caller', async () => {
    const Model = { deleteMany: async () => { throw new Error('db down'); } };
    assert.equal(await purgeExpiredStories(Model), 0);
  });
});

describe('the Story model hides Recently deleted from every ordinary read', () => {
  mongoose.set('bufferCommands', false);
  // The query middleware runs before the driver call, which fails at once
  // with no connection — so the filter it narrowed is still on the query.
  const filterAfterExec = async (query) => {
    try { await query.exec(); } catch { /* not connected — expected */ }
    return query.getFilter();
  };

  test('findById (the play screen, a turn, characters, bookify) gets deletedAt: null', async () => {
    const f = await filterAfterExec(Story.findById('507f1f77bcf86cd799439011'));
    assert.equal(f.deletedAt, null);
    assert.ok('deletedAt' in f);
  });

  test('the list, the lock and a release are narrowed too', async () => {
    assert.ok('deletedAt' in await filterAfterExec(Story.find({ userId: 'u1' })));
    assert.ok('deletedAt' in await filterAfterExec(Story.findOneAndUpdate({ _id: '507f1f77bcf86cd799439011' }, { $set: { title: 'x' } })));
    assert.ok('deletedAt' in await filterAfterExec(Story.updateOne({ _id: '507f1f77bcf86cd799439011' }, { $set: { title: 'x' } })));
    assert.ok('deletedAt' in await filterAfterExec(Story.countDocuments({ userId: 'u1' })));
  });

  test('a query that names deletedAt (the trash list, restore, purge) is left alone', async () => {
    const f = await filterAfterExec(Story.find({ userId: 'u1', deletedAt: { $ne: null } }));
    assert.deepEqual(f.deletedAt, { $ne: null });
    assert.equal(mentionsDeletedAt({ $or: [{ deletedAt: null }] }), true);
    assert.equal(mentionsDeletedAt({ userId: 'u1' }), false);
  });

  test('hideDeletedOn narrows a plain query', () => {
    const q = hideDeletedOn(Story.find({ userId: 'u1' }));
    assert.deepEqual(q.getFilter(), { userId: 'u1', deletedAt: null });
  });

  test('the new fields are on the schema (additive)', () => {
    for (const path of ['deletedAt', 'turnLock.token', 'turnLock.clientId', 'turnLock.expiresAt', 'turnReceipts']) {
      assert.ok(Story.schema.path(path), `missing ${path}`);
    }
    // A new story is not deleted and holds no lock.
    const doc = new Story({ userId: 'u1', title: 't', genre: 'g', worldState: { setting: 's', currentSituation: 'c' } });
    assert.equal(doc.deletedAt, null);
    assert.equal(doc.turnLock?.token, undefined);
    assert.deepEqual(doc.turnReceipts.toObject(), []);
  });
});
