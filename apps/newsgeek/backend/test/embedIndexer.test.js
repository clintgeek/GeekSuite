/**
 * src/jobs/embedIndexer.js — the embedding queue: what it picks (missing for
 * the current model, newest first, batches of 32), what it writes (only
 * `embedding`), how it backs off when the service is down, the schedule
 * switches, and the /api/health fields. An injected fake embed; never the
 * network.
 */
import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createEmbedIndexer, backoffMs, splitByChars } from '../src/jobs/embedIndexer.js';
import { EmbeddingsUnavailableError } from '../src/cluster/embeddings.js';
import createApp from '../src/app.js';
import { startMongo, stopMongo, clearAll } from './helpers/mongo.js';

const MODEL = 'mxbai-embed-large';
const T0 = new Date('2026-10-11T12:00:00Z');
const MIN = 60_000;
const sourceId = new mongoose.Types.ObjectId();

let Article;
before(async () => { ({ Article } = await startMongo()); });
after(stopMongo);
beforeEach(clearAll);

/** n articles, article i published i minutes before T0 (so a0 is the newest). */
async function seedArticles(n, extra = () => ({})) {
  const docs = Array.from({ length: n }, (_, i) => ({
    sourceId,
    feedUrl: 'https://example.com/feed',
    guid: `g${i}`,
    url: `https://example.com/a${i}`,
    canonicalUrl: `https://example.com/a${i}`,
    title: `a${i}`,
    titleKey: `a${i}`,
    excerpt: `excerpt ${i}`,
    publisher: 'Example',
    publishedAt: new Date(T0.getTime() - i * MIN),
    fetchedAt: T0,
    ...extra(i),
  }));
  await Article.insertMany(docs);
}

/** A fake embed: records each request's texts; answers `model` with [len, 1] vectors. */
function fakeEmbed({ model = MODEL, fail = null } = {}) {
  const calls = [];
  const fn = async (texts) => {
    calls.push(texts);
    if (fail) { const e = fail(texts, calls.length); if (e) throw e; }
    return { model, vectors: texts.map((t) => [t.length, 1]) };
  };
  fn.calls = calls;
  return fn;
}

const titlesOf = (texts) => texts.map((t) => t.split('\n')[0]);

describe('picking and writing', () => {
  test('indexes every article missing a vector, newest first, in batches of 32; writes only `embedding`', async () => {
    await seedArticles(40);
    const before40 = await Article.findOne({ guid: 'g5' }).lean();
    const embed = fakeEmbed();
    const ix = createEmbedIndexer({ Article, embed, currentModel: () => MODEL, now: () => T0 });
    const out = await ix.tick();
    assert.equal(out.embedded, 40);
    assert.equal(out.batches, 2);
    assert.equal(out.pending, 0);
    // Two requests: the 32 newest (a0..a31, newest first), then the last 8.
    assert.deepEqual(embed.calls.map((c) => c.length), [32, 8]);
    assert.deepEqual(titlesOf(embed.calls[0]).slice(0, 3), ['a0', 'a1', 'a2']);
    assert.deepEqual(titlesOf(embed.calls[1]), ['a32', 'a33', 'a34', 'a35', 'a36', 'a37', 'a38', 'a39']);
    assert.equal(embed.calls[0][0], 'a0\nexcerpt 0');

    const after5 = await Article.findOne({ guid: 'g5' }).lean();
    assert.equal(after5.embedding.model, MODEL);
    assert.deepEqual(after5.embedding.vector, ['a5\nexcerpt 5'.length, 1]);
    // Targeted: nothing else changed, updatedAt included.
    const strip = ({ embedding, __v, ...rest }) => rest; // eslint-disable-line no-unused-vars
    assert.deepEqual(strip(after5), strip(before40));
  });

  test('one tick of a small budget embeds one batch; the rest is pending for the next', async () => {
    await seedArticles(40);
    let t = 0;
    const embed = fakeEmbed();
    const ix = createEmbedIndexer({ Article, embed, currentModel: () => MODEL, now: () => T0, tickBudgetMs: 10, clock: () => { t += 20; return t; } });
    const out = await ix.tick();
    assert.equal(out.embedded, 32);
    assert.equal(out.pending, 8);
    assert.equal(ix.status().pending, 8);
  });

  test('a batch is split into requests under the per-request character guard', async () => {
    await seedArticles(10);
    const embed = fakeEmbed();
    const ix = createEmbedIndexer({ Article, embed, currentModel: () => MODEL, now: () => T0, maxCharsPerRequest: 30 });
    await ix.tick();
    assert.ok(embed.calls.length > 1);
    for (const c of embed.calls) assert.ok(c.join('').length <= 30, `request of ${c.join('').length} chars`);
    assert.equal(embed.calls.flat().length, 10);
  });

  test('skips articles already indexed with the current model', async () => {
    await seedArticles(6, (i) => (i % 2 === 0 ? { embedding: { model: MODEL, vector: [9, 9] } } : {}));
    const embed = fakeEmbed();
    const ix = createEmbedIndexer({ Article, embed, currentModel: () => MODEL, now: () => T0 });
    const out = await ix.tick();
    assert.equal(out.embedded, 3);
    assert.deepEqual(titlesOf(embed.calls.flat()), ['a1', 'a3', 'a5']);
    assert.deepEqual((await Article.findOne({ guid: 'g0' }).lean()).embedding.vector, [9, 9]);
  });

  test('re-indexes articles whose vector is from another model', async () => {
    await seedArticles(3, () => ({ embedding: { model: 'old-model', vector: [9, 9] } }));
    const embed = fakeEmbed();
    const ix = createEmbedIndexer({ Article, embed, currentModel: () => MODEL, now: () => T0 });
    assert.equal((await ix.tick()).embedded, 3);
    const rows = await Article.find({}).lean();
    assert.ok(rows.every((r) => r.embedding.model === MODEL && r.embedding.vector[1] === 1));
  });

  test('an empty queue makes no call', async () => {
    const embed = fakeEmbed();
    const ix = createEmbedIndexer({ Article, embed, currentModel: () => MODEL, now: () => T0 });
    const out = await ix.tick();
    assert.equal(out.embedded, 0);
    assert.equal(embed.calls.length, 0);
    assert.equal(ix.status().pending, 0);
  });

  test('a 400 is retried one article at a time; the refused one is set aside, the rest are written', async () => {
    await seedArticles(4);
    const embed = fakeEmbed({ fail: (texts) => (texts.some((t) => t.startsWith('a2\n')) ? new EmbeddingsUnavailableError('bad input', { status: 400 }) : null) });
    const ix = createEmbedIndexer({ Article, embed, currentModel: () => MODEL, now: () => T0 });
    const out = await ix.tick();
    assert.equal(out.embedded, 3);
    assert.equal(out.backoff, false);
    assert.equal(ix.setAside().length, 1);
    assert.equal((await Article.findOne({ guid: 'g2' }).lean()).embedding?.vector, undefined);
    // Next tick: the set-aside article is not sent again.
    const before = embed.calls.length;
    await ix.tick();
    assert.equal(embed.calls.length, before);
  });
});

describe('when the service is down', () => {
  test('backs off with a doubling pause (capped), warns once per outage, never throws, resumes', async () => {
    await seedArticles(3);
    let now = T0;
    let down = true;
    const warns = [];
    const infos = [];
    const log = { warn: (o) => warns.push(o), info: (o) => infos.push(o), debug() {}, error() {} };
    const embed = fakeEmbed({ fail: () => (down ? new EmbeddingsUnavailableError('embeddings unreachable') : null) });
    const ix = createEmbedIndexer({ Article, embed, currentModel: () => MODEL, now: () => now, log, backoff: { base: 30_000, max: 120_000 } });

    const first = await ix.tick();
    assert.equal(first.backoff, true);
    assert.equal(first.embedded, 0);
    assert.equal(ix.status().pending, 3);
    assert.equal(ix.status().lastError, 'embeddings unreachable');
    assert.equal(ix.status().backoffUntil.getTime(), T0.getTime() + 30_000);

    // Inside the pause: no call at all.
    now = new Date(T0.getTime() + 10_000);
    assert.equal((await ix.tick()).reason, 'backoff');
    assert.equal(embed.calls.length, 1);

    // Past it: tries again, fails, pause doubles; then caps.
    now = new Date(T0.getTime() + 31_000);
    await ix.tick();
    assert.equal(ix.status().backoffUntil.getTime(), now.getTime() + 60_000);
    now = new Date(now.getTime() + 61_000);
    await ix.tick();
    assert.equal(ix.status().backoffUntil.getTime(), now.getTime() + 120_000);
    now = new Date(now.getTime() + 121_000);
    await ix.tick();
    assert.equal(ix.status().backoffUntil.getTime(), now.getTime() + 120_000);
    assert.equal(warns.filter((w) => w.event === 'embed_unavailable').length, 1, 'one warning per outage');

    // Back up: indexes, clears the error and the pause, logs the recovery once.
    down = false;
    now = new Date(now.getTime() + 121_000);
    const ok = await ix.tick();
    assert.equal(ok.embedded, 3);
    assert.equal(ix.status().lastError, null);
    assert.equal(ix.status().backoffUntil, null);
    assert.equal(infos.filter((i) => i.event === 'embed_recovered').length, 1);
  });

  test('a database error is reported in status, not thrown', async () => {
    const Broken = { find() { throw Object.assign(new Error('boom'), { name: 'MongoServerError' }); }, countDocuments: async () => 0 };
    const ix = createEmbedIndexer({ Article: Broken, embed: fakeEmbed(), currentModel: () => MODEL, now: () => T0 });
    const out = await ix.tick();
    assert.equal(out.error, true);
    assert.equal(ix.status().lastError, 'MongoServerError');
  });

  test('backoffMs doubles from the base and caps at 10 minutes by default', () => {
    assert.equal(backoffMs(1), 30_000);
    assert.equal(backoffMs(2), 60_000);
    assert.equal(backoffMs(5), 480_000);
    assert.equal(backoffMs(6), 600_000);
    assert.equal(backoffMs(20), 600_000);
  });

  test('splitByChars keeps order and never exceeds the limit (a single long item rides alone)', () => {
    const items = ['aaaa', 'bb', 'cccccc', 'd'].map((text) => ({ text }));
    assert.deepEqual(splitByChars(items, 6).map((g) => g.map((x) => x.text)), [['aaaa', 'bb'], ['cccccc'], ['d']]);
  });
});

describe('schedule switches', () => {
  test('off outside production; EMBED_AUTORUN=1 turns it on; EMBED_DISABLED=1 wins', async () => {
    const mk = () => createEmbedIndexer({ Article, embed: fakeEmbed(), currentModel: () => MODEL });
    const cases = [
      [{ NODE_ENV: 'development' }, false],
      [{ NODE_ENV: 'production' }, true],
      [{ NODE_ENV: 'development', EMBED_AUTORUN: '1' }, true],
      [{ NODE_ENV: 'production', EMBED_DISABLED: '1' }, false],
    ];
    for (const [env, expected] of cases) {
      const ix = mk();
      assert.equal(ix.start({ env, bootDelayMs: 60_000, intervalMs: 60_000 }).enabled, expected, JSON.stringify(env));
      assert.equal(ix.status().enabled, expected);
      await ix.stop();
    }
  });
});

describe('/api/health embed', () => {
  test('reports enabled, model, lastRunAt, pending, lastError, backoffUntil', async () => {
    await seedArticles(5);
    const ix = createEmbedIndexer({ Article, embed: fakeEmbed({ fail: () => new EmbeddingsUnavailableError('embeddings HTTP 503', { status: 503 }) }), currentModel: () => MODEL, now: () => T0 });
    ix.start({ env: { NODE_ENV: 'production' }, bootDelayMs: 600_000, intervalMs: 600_000 });
    await ix.tick();
    await ix.stop();
    const app = createApp({ dbState: () => 1, embedStatus: ix.status });
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.embed, {
      enabled: true,
      model: MODEL,
      lastRunAt: T0.toISOString(),
      pending: 5,
      lastError: 'embeddings HTTP 503',
      backoffUntil: new Date(T0.getTime() + 30_000).toISOString(),
    });
  });

  test('null when no indexer is wired', async () => {
    const res = await request(createApp({ dbState: () => 1 })).get('/api/health');
    assert.equal(res.body.embed, null);
  });
});
