/**
 * src/jobs/storyAssigner.js — the story queue: what it picks (a vector, no
 * story, recent, oldest first), what it writes (stories, then only `storyId`
 * on the articles), that a later pass joins stories an earlier pass made,
 * the schedule switches, the purge, and the /api/health fields.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createStoryAssigner, ASSIGN_DAYS } from '../src/jobs/storyAssigner.js';
import { runStoryPurge, STORY_CLOSED_DAYS } from '../src/jobs/purge.js';
import createApp from '../src/app.js';
import { startMongo, stopMongo, clearAll } from './helpers/mongo.js';

const MODEL = 'mxbai-embed-large';
const NOW = new Date('2026-11-27T12:00:00Z');
const H = 60 * 60 * 1000;
const DAY = 24 * H;
const at = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180), 0];

let Article; let Story; let Source;
before(async () => { ({ Article, Story, Source } = await startMongo()); });
after(stopMongo);
beforeEach(clearAll);

let n = 0;
async function article(deg, { hoursAgo = 1, publisher = 'Example', sourceId = new mongoose.Types.ObjectId(), title, model = MODEL, vector = at(deg), storyId = null } = {}) {
  n += 1;
  // Long enough to compare (cluster/stories.js MIN_TEXT_CHARS).
  const t = title || `a headline long enough to be compared, number ${n}`;
  return Article.create({
    sourceId, feedUrl: 'https://example.com/feed', guid: `g${n}`, url: `https://example.com/a${n}`, canonicalUrl: `https://example.com/a${n}`,
    title: t, titleKey: t.toLowerCase(), publisher, publishedAt: new Date(NOW.getTime() - hoursAgo * H), fetchedAt: NOW,
    embedding: vector ? { model, vector } : undefined, storyId,
  });
}
const assigner = (extra = {}) => createStoryAssigner({ models: { Article, Story, Source }, currentModel: () => MODEL, now: () => NOW, ...extra });
const storyOf = async (doc) => (await Article.findById(doc._id).lean()).storyId;

describe('assigning', () => {
  test('two outlets on one event share a story; a different event gets its own', async () => {
    const a = await article(0, { hoursAgo: 5, publisher: 'KATV' });
    const b = await article(10, { hoursAgo: 4, publisher: 'KARK' });
    const c = await article(90, { hoursAgo: 3, publisher: 'THV11' });
    const out = await assigner().tick();
    assert.equal(out.assigned, 3);
    assert.equal(out.joined, 1);
    assert.equal(out.pending, 0);
    assert.equal(String(await storyOf(a)), String(await storyOf(b)));
    assert.notEqual(String(await storyOf(a)), String(await storyOf(c)));
    const story = await Story.findById(await storyOf(a)).lean();
    assert.equal(story.articleCount, 2);
    assert.deepEqual(story.outlets, ['katv', 'kark']);
    assert.equal(story.model, MODEL);
    assert.equal(story.sum.length, 3);
    assert.deepEqual(story.seed, at(0));
  });

  test('writes only storyId on the article (updatedAt untouched)', async () => {
    const a = await article(0);
    const before = await Article.findById(a._id).lean();
    await assigner().tick();
    const after = await Article.findById(a._id).lean();
    assert.ok(after.storyId);
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
    assert.deepEqual(after.embedding.vector, before.embedding.vector);
  });

  test('skips articles with no vector, another model\'s vector, a story already, or older than the look-back', async () => {
    const noVector = await article(0, { vector: null });
    const otherModel = await article(0, { model: 'other' });
    const taken = new mongoose.Types.ObjectId();
    const has = await article(0, { storyId: taken });
    const old = await article(0, { hoursAgo: (ASSIGN_DAYS + 1) * 24 });
    const out = await assigner().tick();
    assert.equal(out.assigned, 0);
    assert.equal(await storyOf(noVector), null);
    assert.equal(await storyOf(otherModel), null);
    assert.equal(String(await storyOf(has)), String(taken));
    assert.equal(await storyOf(old), null);
    assert.equal(await Story.countDocuments({}), 0);
  });

  test('a later pass joins the story an earlier pass made (stories are loaded from the database)', async () => {
    const a = await article(0, { hoursAgo: 30, publisher: 'KATV' });
    await assigner().tick();
    // A story of one article stores no seed: it is its sum.
    const alone = await Story.findById(await storyOf(a)).lean();
    assert.equal(alone.seed, undefined);
    assert.deepEqual(alone.sum, at(0));
    const b = await article(5, { hoursAgo: 1, publisher: 'KARK' });
    const out = await assigner().tick();
    assert.equal(out.joined, 1);
    assert.equal(String(await storyOf(b)), String(await storyOf(a)));
    const story = await Story.findById(await storyOf(a)).lean();
    assert.equal(story.articleCount, 2);
    assert.deepEqual(story.seed, at(0)); // the seed is the first article's, kept
    // ...and a third article, in a third pass, is still tested against that first one.
    const c = await article(50, { hoursAgo: 0.5, publisher: 'THV11' });
    await assigner().tick();
    assert.notEqual(String(await storyOf(c)), String(await storyOf(a)));
    assert.deepEqual((await Story.findById(await storyOf(a)).lean()).seed, at(0));
  });

  test('the seed survives a restart: a story loaded from the database is still tested against its first article', async () => {
    // 0°, 30°, 30°, 30°: the centroid sits near 22°. 50° is close to it (0.88) and far from the seed (0.64).
    await article(0, { hoursAgo: 10 });
    for (const h of [9, 8, 7]) await article(30, { hoursAgo: h });
    await assigner().tick();
    assert.equal(await Story.countDocuments({}), 1);
    const late = await article(50, { hoursAgo: 1 });
    const out = await assigner().tick();
    assert.equal(out.joined, 0);
    assert.equal(await Story.countDocuments({}), 2);
    assert.ok(await storyOf(late));
  });

  test('a story closed for more than 72 h is not joined', async () => {
    const a = await article(0, { hoursAgo: 100 });
    await assigner().tick();
    const b = await article(0, { hoursAgo: 1 });
    await assigner().tick();
    assert.notEqual(String(await storyOf(b)), String(await storyOf(a)));
  });

  test('works through a queue larger than one batch, oldest first, in one pass', async () => {
    for (let i = 0; i < 7; i += 1) await article(0, { hoursAgo: 10 - i, publisher: `Outlet ${i}` });
    const out = await assigner({ batchSize: 3 }).tick();
    assert.equal(out.assigned, 7);
    assert.equal(out.batches, 3);
    assert.equal(await Story.countDocuments({}), 1);
    assert.equal((await Story.findOne({}).lean()).outlets.length, 7);
  });

  test('stops starting batches once the tick budget is spent; the rest wait', async () => {
    for (let i = 0; i < 6; i += 1) await article(i * 60, { hoursAgo: 10 - i });
    let t = 0;
    const out = await assigner({ batchSize: 2, tickBudgetMs: 10, clock: () => { t += 20; return t; } }).tick();
    assert.equal(out.assigned, 2);
    assert.equal(out.pending, 4);
  });

  test('an official source\'s article is a story of one and keeps no vectors', async () => {
    const gov = await Source.create({ slug: 'city', name: 'City', kind: 'official', status: 'active' });
    const notice = await article(0, { hoursAgo: 3, sourceId: gov._id });
    const news = await article(0, { hoursAgo: 2 });
    await assigner().tick();
    assert.notEqual(String(await storyOf(notice)), String(await storyOf(news)));
    const story = await Story.findById(await storyOf(notice)).lean();
    assert.equal(story.solo, true);
    assert.equal(story.sum, undefined);
  });

  test('a text too short to compare is a story of one', async () => {
    const a = await article(0, { hoursAgo: 3, title: 'Happy Thanksgiving' });
    const b = await article(0, { hoursAgo: 2, title: 'Tell HN: Happy Thanksgiving' });
    await assigner().tick();
    assert.notEqual(String(await storyOf(a)), String(await storyOf(b)));
    assert.equal((await Story.findById(await storyOf(a)).lean()).solo, true);
  });

  test('a database error is reported, not thrown', async () => {
    await article(0);
    const broken = { ...Story, find: () => { throw Object.assign(new Error('boom'), { name: 'MongoNetworkError' }); } };
    const ix = createStoryAssigner({ models: { Article, Story: broken, Source }, currentModel: () => MODEL, now: () => NOW });
    const out = await ix.tick();
    assert.equal(out.error, true);
    assert.equal(ix.status().lastError, 'MongoNetworkError');
  });
});

describe('schedule switches', () => {
  const quiet = { bootDelayMs: 10 ** 9, intervalMs: 10 ** 9 };
  test('off outside production; on in production or with STORIES_AUTORUN; STORIES_DISABLED wins', async () => {
    for (const [env, enabled] of [
      [{}, false],
      [{ NODE_ENV: 'production' }, true],
      [{ STORIES_AUTORUN: '1' }, true],
      [{ NODE_ENV: 'production', STORIES_DISABLED: '1' }, false],
    ]) {
      const ix = assigner();
      assert.equal(ix.start({ env, ...quiet }).enabled, enabled);
      await ix.stop();
    }
  });
});

describe('story purge', () => {
  test('a closed story loses its vectors; one past retention is deleted', async () => {
    const mk = (daysAgo) => Story.create({
      title: `s${daysAgo}`, model: MODEL, sum: at(0), seed: at(0),
      firstArticleAt: new Date(NOW.getTime() - daysAgo * DAY), lastArticleAt: new Date(NOW.getTime() - daysAgo * DAY),
    });
    const fresh = await mk(2);
    const closed = await mk(STORY_CLOSED_DAYS + 1);
    const ancient = await mk(91);
    const out = await runStoryPurge({ Story, now: () => NOW });
    assert.deepEqual(out, { stripped: 1, deleted: 1 });
    assert.equal((await Story.findById(fresh._id).lean()).sum.length, 3);
    const c = await Story.findById(closed._id).lean();
    assert.equal(c.sum, undefined);
    assert.equal(c.seed, undefined);
    assert.equal(await Story.findById(ancient._id), null);
    // Safe to run twice.
    assert.deepEqual(await runStoryPurge({ Story, now: () => NOW }), { stripped: 0, deleted: 0 });
  });
});

describe('/api/health', () => {
  test('reports the story queue', async () => {
    await article(0);
    const ix = assigner();
    await ix.tick();
    const res = await request(createApp({ storyStatus: ix.status })).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.stories.pending, 0);
    assert.equal(res.body.stories.lastRunAssigned, 1);
    assert.equal(res.body.stories.lastError, null);
  });

  test('null when the app has no assigner', async () => {
    const res = await request(createApp({})).get('/api/health');
    assert.equal(res.body.stories, null);
  });
});
