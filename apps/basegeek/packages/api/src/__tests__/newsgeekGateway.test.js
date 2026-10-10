/**
 * newsgeekGateway.test.js — the NewsGeek N0 gateway contract
 * (DOCS/NEWSGEEK_PLAN.md "Gateway API, N0"), run as real operations against
 * the real merged schema.
 */
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';

const { typeDefs, resolvers } = await import('../graphql/index.js');
const { NewsSource } = await import('../graphql/newsgeek/models/source.js');
const { NewsPlace } = await import('../graphql/newsgeek/models/place.js');
const { NewsArticle } = await import('../graphql/newsgeek/models/article.js');
const { User } = await import('../models/user.js');

const ADMIN = new mongoose.Types.ObjectId();
const MEMBER = new mongoose.Types.ObjectId();
const ago = (ms) => new Date(Date.now() - ms);
const H = 3600 * 1000;

let server;
const run = async (query, variables = {}, userId = String(ADMIN)) => {
  const res = await server.executeOperation(
    { query, variables },
    { contextValue: { user: userId ? { id: userId } : null } },
  );
  const r = res.body.singleResult;
  return { data: r.data ?? null, errors: r.errors ?? null };
};
const ok = async (...a) => {
  const { data, errors } = await run(...a);
  if (errors) throw new Error(JSON.stringify(errors));
  return data;
};
const code = async (...a) => (await run(...a)).errors?.[0]?.extensions?.code ?? null;

async function clean() {
  await Promise.all([NewsSource.deleteMany({}), NewsPlace.deleteMany({}), NewsArticle.deleteMany({})]);
}

beforeAll(async () => {
  await NewsSource.db.asPromise();
  await Promise.all([NewsSource.init(), NewsPlace.init(), NewsArticle.init()]);
  await User.collection.deleteMany({ _id: { $in: [ADMIN, MEMBER] } });
  await User.collection.insertMany([
    { _id: ADMIN, role: 'admin' },
    { _id: MEMBER, role: 'user' },
  ]);
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 60000);
beforeEach(clean);
afterAll(async () => {
  await clean();
  await User.collection.deleteMany({ _id: { $in: [ADMIN, MEMBER] } });
  await server.stop();
  await NewsSource.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const SRC_FIELDS = `id slug name kind sections status articlesLast7d places { id name }
  access { paywall content } blockedDomains notes
  feeds { id url format pollEveryMin consecutiveFailures stale health lastFetchAt }`;
const CREATE = `mutation($input: NewsSourceInput!) { newsCreateSource(input: $input) { ${SRC_FIELDS} } }`;
const UPDATE = `mutation($id: ID!, $input: NewsSourceInput!) { newsUpdateSource(id: $id, input: $input) { ${SRC_FIELDS} } }`;
const SOURCE = `query($id: ID!) { newsSource(id: $id) { ${SRC_FIELDS} } }`;
const ARTICLES = `query($section: String, $placeId: ID, $sourceId: ID, $before: Date, $limit: Int) {
  newsArticles(section: $section, placeId: $placeId, sourceId: $sourceId, before: $before, limit: $limit) {
    nextBefore items { id title sourceName sourceKind sections publishedAt places { name } }
  }
}`;

async function mkSource(over = {}) {
  return NewsSource.create({
    slug: `s-${new mongoose.Types.ObjectId()}`, name: 'Src', kind: 'journalism',
    sections: ['local'], status: 'active', feeds: [], ...over,
  });
}
let n = 0;
async function mkArticle(source, over = {}) {
  n += 1;
  return NewsArticle.create({
    sourceId: source._id, feedUrl: 'https://x.test/feed', guid: `g${n}-${Math.random()}`,
    url: `https://x.test/${n}`, canonicalUrl: `https://x.test/${n}`, title: `Title ${n}`,
    titleKey: `title ${n}`, publisher: 'Pub', publishedAt: ago(H), fetchedAt: new Date(), ...over,
  });
}

describe('gate', () => {
  it('refuses every query to an anonymous caller', async () => {
    const id = String(new mongoose.Types.ObjectId());
    for (const q of [
      `{ newsViewer { isAdmin } }`, `{ newsPlaces { id } }`, `{ newsSources { id } }`,
      `{ newsSource(id: "${id}") { id } }`, `{ newsArticles { items { id } } }`,
    ]) {
      expect(await code(q, {}, null)).toBe('UNAUTHENTICATED');
    }
  });

  it('refuses every mutation to a non-admin with ADMIN_REQUIRED, and changes nothing', async () => {
    const src = await mkSource({ status: 'discovered', feeds: [{ url: 'https://a.test/rss' }] });
    const id = String(src._id);
    const calls = [
      [CREATE, { input: { name: 'N', kind: 'journalism' } }],
      [UPDATE, { id, input: { name: 'Changed' } }],
      [`mutation($id: ID!) { newsSetSourceStatus(id: $id, status: "active") { id } }`, { id }],
      [`mutation($id: ID!) { newsCheckSourceNow(id: $id) { id } }`, { id }],
    ];
    for (const [q, v] of calls) expect(await code(q, v, String(MEMBER))).toBe('ADMIN_REQUIRED');
    for (const [q, v] of calls) expect(await code(q, v, null)).toBe('UNAUTHENTICATED');
    const after = await NewsSource.findById(id).lean();
    expect(after.name).toBe('Src');
    expect(after.status).toBe('discovered');
    expect(after.feeds[0].nextPollAt).toBeNull();
    expect(await NewsSource.countDocuments({})).toBe(1);
  });

  it('newsViewer reports isAdmin truthfully', async () => {
    expect((await ok(`{ newsViewer { isAdmin } }`, {}, String(ADMIN))).newsViewer.isAdmin).toBe(true);
    expect((await ok(`{ newsViewer { isAdmin } }`, {}, String(MEMBER))).newsViewer.isAdmin).toBe(false);
  });
});

describe('feed health surfaces through NewsSource.feeds', () => {
  it('derives never / ok / stale / failing / broken per feed', async () => {
    const now = new Date();
    const src = await mkSource({
      feeds: [
        { url: 'https://a.test/never' },
        { url: 'https://a.test/ok', lastFetchAt: now },
        { url: 'https://a.test/stale', lastFetchAt: now, stale: true },
        { url: 'https://a.test/failing', lastFetchAt: now, consecutiveFailures: 3 },
        { url: 'https://a.test/broken', lastFetchAt: now, consecutiveFailures: 12 },
      ],
    });
    const { newsSource } = await ok(SOURCE, { id: String(src._id) });
    const health = Object.fromEntries(newsSource.feeds.map((f) => [f.url.split('/').pop(), f.health]));
    expect(health).toEqual({ never: 'never', ok: 'ok', stale: 'stale', failing: 'failing', broken: 'broken' });
  });

  it('a broken source status makes a fetched feed broken', async () => {
    const src = await mkSource({ status: 'broken', feeds: [{ url: 'https://a.test/x', lastFetchAt: new Date() }] });
    const { newsSource } = await ok(SOURCE, { id: String(src._id) });
    expect(newsSource.feeds[0].health).toBe('broken');
  });
});

describe('newsSources', () => {
  it('batches articlesLast7d: counts only the last 7 days, per source', async () => {
    const a = await mkSource({ name: 'A' });
    const b = await mkSource({ name: 'B' });
    await mkArticle(a, { publishedAt: ago(H) });
    await mkArticle(a, { publishedAt: ago(2 * 24 * H) });
    await mkArticle(a, { publishedAt: ago(10 * 24 * H) });
    await mkArticle(b, { publishedAt: ago(H) });
    const { newsSources } = await ok(`{ newsSources { name articlesLast7d } }`);
    expect(Object.fromEntries(newsSources.map((s) => [s.name, s.articlesLast7d]))).toEqual({ A: 2, B: 1 });
  });

  it('filters by status and rejects an unknown one', async () => {
    await mkSource({ name: 'On', status: 'active' });
    await mkSource({ name: 'Off', status: 'retired' });
    const { newsSources } = await ok(`{ newsSources(status: "retired") { name } }`);
    expect(newsSources.map((s) => s.name)).toEqual(['Off']);
    expect(await code(`{ newsSources(status: "nope") { name } }`)).toBe('BAD_USER_INPUT');
  });
});

describe('mutations', () => {
  it('creates a source: slug derived and made unique, defaults applied, places resolved', async () => {
    const place = await NewsPlace.create({ slug: 'malvern', name: 'Malvern', kind: 'town' });
    const input = {
      name: 'The Daily Leader!', kind: 'journalism', sections: ['local', 'state'],
      placeIds: [String(place._id)], feeds: [{ url: 'https://leader.test/rss' }],
      paywall: 'metered', blockedDomains: ['Legacy.com'],
    };
    const one = (await ok(CREATE, { input })).newsCreateSource;
    expect(one.slug).toBe('the-daily-leader');
    expect(one.status).toBe('discovered');
    expect(one.places.map((p) => p.name)).toEqual(['Malvern']);
    expect(one.access).toEqual({ paywall: 'metered', content: 'excerpt' });
    expect(one.blockedDomains).toEqual(['legacy.com']);
    expect(one.feeds[0]).toMatchObject({ format: 'rss', pollEveryMin: 15, health: 'never' });
    const two = (await ok(CREATE, { input })).newsCreateSource;
    expect(two.slug).toBe('the-daily-leader-2');
    expect(await code(CREATE, { input: { ...input, slug: 'the-daily-leader' } })).toBe('BAD_USER_INPUT');
  });

  it('validates enums, urls and ids', async () => {
    const base = { name: 'X', kind: 'journalism' };
    const bad = [
      { ...base, kind: 'blog' },
      { ...base, sections: ['sports'] },
      { ...base, paywall: 'free' },
      { ...base, content: 'everything' },
      { ...base, homepage: 'javascript:alert(1)' },
      { ...base, feeds: [{ url: 'ftp://x.test/rss' }] },
      { ...base, feeds: [{ url: 'https://x.test/rss', format: 'json' }] },
      { ...base, feeds: [{ url: 'https://x.test/rss', pollEveryMin: 1 }] },
      { ...base, feeds: [{ url: 'https://x.test/rss' }, { url: 'https://x.test/rss' }] },
      { ...base, placeIds: [String(new mongoose.Types.ObjectId())] },
      { ...base, placeIds: ['nope'] },
      { kind: 'journalism' },
      { name: 'X' },
    ];
    for (const input of bad) expect(await code(CREATE, { input })).toBe('BAD_USER_INPUT');
    expect(await NewsSource.countDocuments({})).toBe(0);
  });

  it('newsUpdateSource keeps poll state for a retained feed url, drops removed, starts new ones fresh', async () => {
    const fetched = new Date('2026-10-01T00:00:00Z');
    const src = await mkSource({
      feeds: [
        { url: 'https://a.test/keep', lastFetchAt: fetched, consecutiveFailures: 4, etag: 'abc', stale: true },
        { url: 'https://a.test/drop' },
      ],
    });
    const keptId = String(src.feeds[0]._id);
    const out = (await ok(UPDATE, {
      id: String(src._id),
      input: { feeds: [{ url: 'https://a.test/keep', pollEveryMin: 30 }, { url: 'https://a.test/new' }] },
    })).newsUpdateSource;
    expect(out.feeds.map((f) => f.url)).toEqual(['https://a.test/keep', 'https://a.test/new']);
    const [keep, fresh] = out.feeds;
    expect(keep).toMatchObject({ id: keptId, pollEveryMin: 30, consecutiveFailures: 4, stale: true });
    expect(keep.lastFetchAt).toBe(fetched.toISOString());
    expect(fresh).toMatchObject({ consecutiveFailures: 0, health: 'never' });
    const stored = await NewsSource.findById(src._id).lean();
    expect(stored.feeds[0].etag).toBe('abc');
    expect(stored.feeds[1].nextPollAt).toBeInstanceOf(Date);
  });

  it('newsUpdateSource only touches the fields provided', async () => {
    const src = await mkSource({ name: 'Keep', notes: 'n', sections: ['local'], feeds: [{ url: 'https://a.test/x' }] });
    const out = (await ok(UPDATE, { id: String(src._id), input: { notes: 'new' } })).newsUpdateSource;
    expect(out).toMatchObject({ name: 'Keep', notes: 'new', sections: ['local'] });
    expect(out.feeds).toHaveLength(1);
  });

  it('newsSetSourceStatus sets status and leaves poll state alone', async () => {
    const src = await mkSource({ status: 'broken', feeds: [{ url: 'https://a.test/x', consecutiveFailures: 12, lastFetchAt: new Date() }] });
    const out = (await ok(
      `mutation($id: ID!) { newsSetSourceStatus(id: $id, status: "active") { status feeds { consecutiveFailures } } }`,
      { id: String(src._id) },
    )).newsSetSourceStatus;
    expect(out.status).toBe('active');
    expect(out.feeds[0].consecutiveFailures).toBe(12);
    expect(await code(`mutation($id: ID!) { newsSetSourceStatus(id: $id, status: "zzz") { id } }`, { id: String(src._id) })).toBe('BAD_USER_INPUT');
  });

  it('newsCheckSourceNow sets nextPollAt = now on every feed', async () => {
    const future = new Date(Date.now() + 24 * H);
    const src = await mkSource({ feeds: [{ url: 'https://a.test/1', nextPollAt: future }, { url: 'https://a.test/2', nextPollAt: future }] });
    const before = Date.now();
    await ok(`mutation($id: ID!) { newsCheckSourceNow(id: $id) { id } }`, { id: String(src._id) });
    const stored = await NewsSource.findById(src._id).lean();
    for (const f of stored.feeds) {
      expect(f.nextPollAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(f.nextPollAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });

  it('unknown source ids are NOT_FOUND', async () => {
    const id = String(new mongoose.Types.ObjectId());
    expect(await code(`mutation($id: ID!) { newsCheckSourceNow(id: $id) { id } }`, { id })).toBe('NOT_FOUND');
    expect((await ok(SOURCE, { id })).newsSource).toBeNull();
  });
});

describe('newsArticles', () => {
  it('pages newest first: default/cap limits, before cursor, nextBefore only on a full page', async () => {
    const src = await mkSource();
    for (let i = 0; i < 5; i += 1) await mkArticle(src, { title: `T${i}`, publishedAt: ago((i + 1) * H) });
    const p1 = (await ok(ARTICLES, { limit: 2 })).newsArticles;
    expect(p1.items.map((a) => a.title)).toEqual(['T0', 'T1']);
    expect(p1.nextBefore).toBe(p1.items[1].publishedAt);
    const p2 = (await ok(ARTICLES, { limit: 2, before: p1.nextBefore })).newsArticles;
    expect(p2.items.map((a) => a.title)).toEqual(['T2', 'T3']);
    const p3 = (await ok(ARTICLES, { limit: 2, before: p2.nextBefore })).newsArticles;
    expect(p3.items.map((a) => a.title)).toEqual(['T4']);
    expect(p3.nextBefore).toBeNull();
    expect((await ok(ARTICLES, {})).newsArticles.nextBefore).toBeNull();
    expect(await code(ARTICLES, { limit: 0 })).toBe('BAD_USER_INPUT');
  });

  it('defaults to 50 and caps at 100', async () => {
    const src = await mkSource();
    await NewsArticle.insertMany(Array.from({ length: 120 }, (_, i) => ({
      sourceId: src._id, feedUrl: 'f', guid: `bulk${i}`, url: `https://x.test/b${i}`, canonicalUrl: `https://x.test/b${i}`,
      title: `B${i}`, titleKey: `b${i}`, publisher: 'P', publishedAt: ago(i * 1000 + 1000), fetchedAt: new Date(),
    })));
    expect((await ok(ARTICLES, {})).newsArticles.items).toHaveLength(50);
    expect((await ok(ARTICLES, { limit: 500 })).newsArticles.items).toHaveLength(100);
  });

  it('placeId matches the place and its descendants, not siblings or ancestors', async () => {
    const state = await NewsPlace.create({ slug: 'ar', name: 'Arkansas', kind: 'state' });
    const county = await NewsPlace.create({ slug: 'clark', name: 'Clark County', kind: 'county', parentId: state._id });
    const town = await NewsPlace.create({ slug: 'arkadelphia', name: 'Arkadelphia', kind: 'town', parentId: county._id });
    const other = await NewsPlace.create({ slug: 'hot-spring', name: 'Hot Spring County', kind: 'county', parentId: state._id });
    const src = await mkSource();
    await mkArticle(src, { title: 'in-town', places: [town._id] });
    await mkArticle(src, { title: 'in-county', places: [county._id] });
    await mkArticle(src, { title: 'in-other', places: [other._id] });
    await mkArticle(src, { title: 'in-state', places: [state._id] });
    await mkArticle(src, { title: 'nowhere' });
    const titles = async (placeId) => (await ok(ARTICLES, { placeId: String(placeId) })).newsArticles.items.map((a) => a.title).sort();
    expect(await titles(county._id)).toEqual(['in-county', 'in-town']);
    expect(await titles(state._id)).toEqual(['in-county', 'in-other', 'in-state', 'in-town']);
    expect(await titles(town._id)).toEqual(['in-town']);
    const a = (await ok(ARTICLES, { placeId: String(town._id) })).newsArticles.items[0];
    expect(a.places.map((p) => p.name)).toEqual(['Arkadelphia']);
  });

  it('excludes expired alerts but keeps live and non-expiring ones', async () => {
    const src = await mkSource({ kind: 'official' });
    await mkArticle(src, { title: 'expired', expiresAt: ago(H) });
    await mkArticle(src, { title: 'live', expiresAt: new Date(Date.now() + H) });
    await mkArticle(src, { title: 'plain' });
    const titles = (await ok(ARTICLES, {})).newsArticles.items.map((a) => a.title).sort();
    expect(titles).toEqual(['live', 'plain']);
  });

  it('excludes retired sources, and filters by section and sourceId', async () => {
    const local = await mkSource({ name: 'Local', sections: ['local'] });
    const tech = await mkSource({ name: 'Tech', sections: ['tech', 'national'], kind: 'aggregator' });
    const gone = await mkSource({ name: 'Gone', status: 'retired' });
    await mkArticle(local, { title: 'L' });
    await mkArticle(tech, { title: 'T' });
    await mkArticle(gone, { title: 'G' });
    const titles = async (v) => (await ok(ARTICLES, v)).newsArticles.items.map((a) => a.title).sort();
    expect(await titles({})).toEqual(['L', 'T']);
    expect(await titles({ section: 'tech' })).toEqual(['T']);
    expect(await titles({ section: 'national' })).toEqual(['T']);
    expect(await titles({ sourceId: String(local._id) })).toEqual(['L']);
    expect(await titles({ sourceId: String(gone._id) })).toEqual([]);
    expect(await code(ARTICLES, { section: 'sports' })).toBe('BAD_USER_INPUT');
    const item = (await ok(ARTICLES, { section: 'tech' })).newsArticles.items[0];
    expect(item).toMatchObject({ sourceName: 'Tech', sourceKind: 'aggregator', sections: ['tech', 'national'] });
  });
});

describe('newsPlaces', () => {
  it('lists the gazetteer by name with parentId', async () => {
    const p = await NewsPlace.create({ slug: 'ar', name: 'Arkansas', kind: 'state' });
    await NewsPlace.create({ slug: 'clark', name: 'Clark County', kind: 'county', parentId: p._id });
    const { newsPlaces } = await ok(`{ newsPlaces { id slug name kind parentId } }`);
    expect(newsPlaces.map((x) => x.name)).toEqual(['Arkansas', 'Clark County']);
    expect(newsPlaces[1].parentId).toBe(String(p._id));
    expect(newsPlaces[0].parentId).toBeNull();
  });
});
