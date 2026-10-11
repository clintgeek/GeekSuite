/**
 * newsgeekHygiene.test.js — feed hygiene through the real gateway
 * (DOCS/NEWSGEEK_PLAN.md "Ingest hygiene", Chef 2026-10-11): duplicate
 * collapse in Today and newsArticles (alsoIn, the wire rule, caps, paging,
 * per-reader representatives) and per-source path rules (pathExclude:
 * admin-only, validated). The pure rules are pinned in newsgeekDedupe.test.js.
 */
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';

const { typeDefs, resolvers } = await import('../graphql/index.js');
const { NewsSource } = await import('../graphql/newsgeek/models/source.js');
const { NewsPlace } = await import('../graphql/newsgeek/models/place.js');
const { NewsArticle } = await import('../graphql/newsgeek/models/article.js');
const { NewsPrefs } = await import('../graphql/newsgeek/models/prefs.js');
const { User } = await import('../models/user.js');

const ADMIN = new mongoose.Types.ObjectId();
const READER_A = new mongoose.Types.ObjectId();
const READER_B = new mongoose.Types.ObjectId();
const H = 3600 * 1000;
const ago = (ms) => new Date(Date.now() - ms);

let server;
const run = async (query, variables = {}, userId = READER_A) => {
  const res = await server.executeOperation({ query, variables }, { contextValue: { user: userId ? { id: String(userId) } : null } });
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
  await Promise.all([NewsSource.deleteMany({}), NewsPlace.deleteMany({}), NewsArticle.deleteMany({}), NewsPrefs.deleteMany({})]);
}
beforeAll(async () => {
  await NewsSource.db.asPromise();
  await Promise.all([NewsSource.init(), NewsPlace.init(), NewsArticle.init(), NewsPrefs.init()]);
  await User.collection.deleteMany({ _id: { $in: [ADMIN, READER_A, READER_B] } });
  await User.collection.insertMany([
    { _id: ADMIN, role: 'admin', username: 'chef' },
    { _id: READER_A, role: 'user', username: 'a' },
    { _id: READER_B, role: 'user', username: 'b' },
  ]);
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 60000);
afterAll(async () => {
  await clean();
  await User.collection.deleteMany({ _id: { $in: [ADMIN, READER_A, READER_B] } });
  await server.stop();
  await NewsSource.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const P = {};
async function seedPlaces() {
  const mk = async (slug, name, kind, parent) => { P[slug] = await NewsPlace.create({ slug, name, kind, parentId: parent ? P[parent]._id : null }); };
  await mk('us', 'United States', 'country');
  await mk('arkansas', 'Arkansas', 'state', 'us');
  await mk('clark', 'Clark County', 'county', 'arkansas');
  await mk('arkadelphia', 'Arkadelphia', 'town', 'clark');
}
beforeEach(async () => { await clean(); await seedPlaces(); });

const mkSource = (over = {}) => NewsSource.create({
  slug: `s-${new mongoose.Types.ObjectId()}`, name: 'Src', kind: 'journalism', sections: ['state'], status: 'active', feeds: [], places: [P.arkansas._id], ...over,
});
let n = 0;
const titleKeyOf = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
async function mkArticle(source, title, over = {}) {
  n += 1;
  const { own = [], age = H, ...rest } = over;
  return NewsArticle.create({
    sourceId: source._id, feedUrl: 'https://x.test/feed', guid: `g${n}-${Math.random()}`, url: `https://x.test/${n}`, canonicalUrl: `https://x.test/${n}`,
    title, titleKey: titleKeyOf(title), publisher: source.name, publishedAt: ago(age), fetchedAt: new Date(),
    places: [...(source.places || []), ...own.map((s) => P[s]._id)], ...rest,
  });
}

const ITEM = 'id title section sourceName alsoIn { publisher url sourceId }';
const FRONT = `{ newsFrontPage { sections { key moreCount items { ${ITEM} } } } }`;
const ARTICLES = `query($section: String, $before: Date, $limit: Int) { newsArticles(section: $section, before: $before, limit: $limit) { nextBefore items { ${ITEM} } } }`;
const SET_PRIO = `mutation($id: ID!, $p: String!) { newsSetSourcePriority(id: $id, priority: $p) { id } }`;
const SET_PREFS = `mutation($input: NewsPrefsInput!) { newsSetPrefs(input: $input) { freeToReadOnly } }`;
const front = async (user = READER_A) => (await ok(FRONT, {}, user)).newsFrontPage.sections;
const sectionOfFront = (sections, key) => sections.find((s) => s.key === key);

const AP = 'Governor signs prison funding bill into law';

describe('alsoIn: the contract', () => {
  it('is [] for a story with no copies, in Today and newsArticles', async () => {
    const s = await mkSource({ name: 'KATV' });
    await mkArticle(s, 'A story told only once today in Arkansas');
    expect((await front())[0].items[0].alsoIn).toEqual([]);
    expect((await ok(ARTICLES)).newsArticles.items[0].alsoIn).toEqual([]);
  });
});

describe('Today', () => {
  it('AP copy across three sources is ONE story with alsoIn 2', async () => {
    const katv = await mkSource({ name: 'KATV' });
    const kark = await mkSource({ name: 'KARK' });
    const thv = await mkSource({ name: 'THV11' });
    await mkArticle(katv, AP, { age: 3 * H });
    const b = await mkArticle(kark, AP, { age: 2 * H });
    const c = await mkArticle(thv, AP, { age: H });
    const state = sectionOfFront(await front(), 'state');
    expect(state.items.map((i) => i.title)).toEqual([AP]);
    expect(state.items[0].sourceName).toBe('KATV');
    expect(state.items[0].alsoIn).toEqual([
      { publisher: 'KARK', url: b.url, sourceId: String(kark._id) },
      { publisher: 'THV11', url: c.url, sourceId: String(thv._id) },
    ]);
  });

  it('a group counts ONCE against the quota (and moreCount counts stories, not copies)', async () => {
    await ok(SET_PREFS, { input: { sectionQuotas: { state: 3 } } });
    const s = await Promise.all(['KATV', 'KARK', 'THV11'].map((name) => mkSource({ name })));
    for (const src of s) await mkArticle(src, AP, { age: H });
    await mkArticle(s[0], 'Legislature returns for a fiscal session in April', { age: 4 * H });
    await mkArticle(s[1], 'State parks report record attendance this summer', { age: 5 * H });
    await mkArticle(s[2], 'Highway department closes bridge for repairs', { age: 6 * H });
    const state = sectionOfFront(await front(), 'state');
    expect(state.items).toHaveLength(3);
    expect(state.items.filter((i) => i.title === AP)).toHaveLength(1);
    expect(state.moreCount).toBe(1); // 4 stories, 3 shown
  });

  it('the wire rule: a state paper\'s AP copy + the AP national copy → National, not State', async () => {
    const katv = await mkSource({ name: 'KATV' });
    const gnAp = await mkSource({ name: 'Google News: AP', kind: 'aggregator', sections: ['national', 'world'], places: [P.us._id] });
    await mkArticle(katv, AP, { age: 2 * H });
    await mkArticle(gnAp, AP, { age: H, publisher: 'AP News', publisherDomain: 'apnews.com' });
    const sections = await front();
    expect(sectionOfFront(sections, 'state')).toBeUndefined();
    const nat = sectionOfFront(sections, 'national');
    expect(nat.items.map((i) => [i.title, i.sourceName, i.section])).toEqual([[AP, 'KATV', 'national']]);
    expect(nat.items[0].alsoIn.map((a) => a.publisher)).toEqual(['AP News']);
  });

  it('a group with its own Arkansas place stays local', async () => {
    await ok(`mutation($ids: [ID!]!) { newsSetHomePlaces(placeIds: $ids) { homePlaces { id } } }`, { ids: [String(P.arkadelphia._id)] });
    const katv = await mkSource({ name: 'KATV' });
    const gnAp = await mkSource({ name: 'Google News: AP', kind: 'aggregator', sections: ['national'], places: [P.us._id] });
    const t = 'Arkadelphia council approves new water treatment plant';
    await mkArticle(katv, t, { own: ['arkadelphia'], age: 2 * H });
    await mkArticle(gnAp, t, { age: H, publisher: 'AP News', publisherDomain: 'apnews.com' });
    const sections = await front();
    expect(sections.map((s) => s.key)).toEqual(['local']);
    expect(sections[0].items[0].alsoIn).toHaveLength(1);
  });

  it('readers are independent: each one\'s ★ Favorite represents the group for them', async () => {
    const katv = await mkSource({ name: 'KATV' });
    const kark = await mkSource({ name: 'KARK' });
    await mkArticle(katv, AP, { age: 3 * H });
    await mkArticle(kark, AP, { age: H });
    await ok(SET_PRIO, { id: String(kark._id), p: 'favorite' }, READER_A);
    const forA = sectionOfFront(await front(READER_A), 'state').items;
    const forB = sectionOfFront(await front(READER_B), 'state').items;
    expect(forA.map((i) => [i.sourceName, i.alsoIn.map((a) => a.publisher)])).toEqual([['KARK', ['KATV']]]);
    expect(forB.map((i) => [i.sourceName, i.alsoIn.map((a) => a.publisher)])).toEqual([['KATV', ['KARK']]]);
  });
});

describe('newsArticles (Everything and section pages)', () => {
  it('collapses within the page and still fills it up to limit', async () => {
    const s = await Promise.all(['KATV', 'KARK', 'THV11'].map((name) => mkSource({ name })));
    for (const src of s) await mkArticle(src, AP, { age: H });
    await mkArticle(s[0], 'Legislature returns for a fiscal session in April', { age: 2 * H });
    const page = (await ok(ARTICLES, { limit: 2 })).newsArticles;
    expect(page.items.map((i) => i.title)).toEqual([AP, 'Legislature returns for a fiscal session in April']);
    expect(page.items[0].alsoIn).toHaveLength(2);
  });

  it('paging: a copy collapsed into a story on page 1 never reappears on page 2; nothing is skipped', async () => {
    const katv = await mkSource({ name: 'KATV' });
    const kark = await mkSource({ name: 'KARK' });
    const T = (k) => `Unique state story number ${k} for paging`;
    await mkArticle(katv, AP, { age: 1 * H });          // newest copy: page 1
    await mkArticle(katv, T(1), { age: 2 * H });
    await mkArticle(katv, T(2), { age: 3 * H });
    await mkArticle(kark, AP, { age: 4 * H });          // older copy: would be page 2
    await mkArticle(kark, T(3), { age: 5 * H });
    await mkArticle(kark, T(4), { age: 6 * H });

    const p1 = (await ok(ARTICLES, { limit: 2 })).newsArticles;
    expect(p1.items.map((i) => i.title)).toEqual([AP, T(1)]);
    // It sits where its newest copy sits; the earliest copy (KARK's) represents it.
    expect([p1.items[0].sourceName, p1.items[0].alsoIn.map((a) => a.publisher)]).toEqual(['KARK', ['KATV']]);
    expect(p1.nextBefore).not.toBeNull();
    const p2 = (await ok(ARTICLES, { limit: 2, before: p1.nextBefore })).newsArticles;
    expect(p2.items.map((i) => i.title)).toEqual([T(2), T(3)]);
    const p3 = (await ok(ARTICLES, { limit: 2, before: p2.nextBefore })).newsArticles;
    expect(p3.items.map((i) => i.title)).toEqual([T(4)]);
    expect(p3.nextBefore).toBeNull();
  });

  it('paging: when a group ends a page, the cursor is its newest copy, so a story between the copies is not skipped', async () => {
    const katv = await mkSource({ name: 'KATV' });
    const kark = await mkSource({ name: 'KARK' });
    const T = (k) => `Unique state story number ${k} for the cursor`;
    await mkArticle(katv, T(1), { age: 1 * H });
    await mkArticle(katv, AP, { age: 2 * H });          // the group's newest copy
    await mkArticle(katv, T(2), { age: 3 * H });        // between the copies
    await mkArticle(kark, AP, { age: 4 * H });          // the representative (earliest)
    await mkArticle(kark, T(3), { age: 5 * H });
    const p1 = (await ok(ARTICLES, { limit: 2 })).newsArticles;
    expect(p1.items.map((i) => [i.title, i.sourceName])).toEqual([[T(1), 'KATV'], [AP, 'KARK']]);
    const p2 = (await ok(ARTICLES, { limit: 2, before: p1.nextBefore })).newsArticles;
    expect(p2.items.map((i) => i.title)).toEqual([T(2), T(3)]);
  });

  it('section pages follow the group\'s section: the wire copy leaves State for National', async () => {
    const katv = await mkSource({ name: 'KATV' });
    const gnAp = await mkSource({ name: 'Google News: AP', kind: 'aggregator', sections: ['national', 'world'], places: [P.us._id] });
    await mkArticle(katv, AP, { age: 2 * H });
    await mkArticle(katv, 'Legislature returns for a fiscal session in April', { age: 3 * H });
    await mkArticle(gnAp, AP, { age: H, publisher: 'AP News', publisherDomain: 'apnews.com' });
    const state = (await ok(ARTICLES, { section: 'state' })).newsArticles.items;
    expect(state.map((i) => i.title)).toEqual(['Legislature returns for a fiscal session in April']);
    const national = (await ok(ARTICLES, { section: 'national' })).newsArticles.items;
    expect(national.map((i) => [i.title, i.sourceName, i.section, i.alsoIn.length])).toEqual([[AP, 'KATV', 'national', 1]]);
    const everything = (await ok(ARTICLES)).newsArticles.items;
    expect(everything.map((i) => i.title)).toEqual([AP, 'Legislature returns for a fiscal session in April']);
  });
});

describe('pathExclude (per-source URL path rules)', () => {
  const SRC = 'id pathExclude';
  const CREATE = `mutation($input: NewsSourceInput!) { newsCreateSource(input: $input) { ${SRC} } }`;
  const UPDATE = `mutation($id: ID!, $input: NewsSourceInput!) { newsUpdateSource(id: $id, input: $input) { ${SRC} } }`;
  const input = (over = {}) => ({ name: 'Malvern Daily Record', kind: 'journalism', feeds: [{ url: `https://m${n += 1}.test/search/?f=rss` }], ...over });

  it('every source reports it ([] when none)', async () => {
    const s = await mkSource({ name: 'Plain' });
    expect((await ok(`query($id: ID!) { newsSource(id: $id) { pathExclude } }`, { id: String(s._id) })).newsSource.pathExclude).toEqual([]);
  });

  it('an admin sets it (trimmed, de-duplicated) and replaces it', async () => {
    const created = (await ok(CREATE, { input: input({ pathExclude: [' ^/online_features/ ', '^/online_features/', '/press_releases/', ''] }) }, ADMIN)).newsCreateSource;
    expect(created.pathExclude).toEqual(['^/online_features/', '/press_releases/']);
    const updated = (await ok(UPDATE, { id: created.id, input: { pathExclude: ['^/sport/'] } }, ADMIN)).newsUpdateSource;
    expect(updated.pathExclude).toEqual(['^/sport/']);
    expect((await NewsSource.findById(created.id).lean()).pathExclude).toEqual(['^/sport/']);
    const cleared = (await ok(UPDATE, { id: created.id, input: { pathExclude: [] } }, ADMIN)).newsUpdateSource;
    expect(cleared.pathExclude).toEqual([]);
  });

  it('validation: must compile, ≤200 characters, ≤20 patterns → BAD_USER_INPUT, nothing written', async () => {
    const created = (await ok(CREATE, { input: input({ pathExclude: ['^/ap/'] }) }, ADMIN)).newsCreateSource;
    expect(await code(UPDATE, { id: created.id, input: { pathExclude: ['(unclosed'] } }, ADMIN)).toBe('BAD_USER_INPUT');
    expect(await code(UPDATE, { id: created.id, input: { pathExclude: ['/'.repeat(201)] } }, ADMIN)).toBe('BAD_USER_INPUT');
    expect(await code(UPDATE, { id: created.id, input: { pathExclude: Array.from({ length: 21 }, (_, i) => `^/p${i}/`) } }, ADMIN)).toBe('BAD_USER_INPUT');
    expect(await code(CREATE, { input: input({ pathExclude: ['[bad'] }) }, ADMIN)).toBe('BAD_USER_INPUT');
    expect((await NewsSource.findById(created.id).lean()).pathExclude).toEqual(['^/ap/']);
    expect((await ok(UPDATE, { id: created.id, input: { pathExclude: ['/'.repeat(200)] } }, ADMIN)).newsUpdateSource.pathExclude).toHaveLength(1);
  });

  it('admin-only: a reader can\'t set it, not even on their own source (ADMIN_REQUIRED)', async () => {
    expect(await code(CREATE, { input: input({ pathExclude: ['^/x/'] }) }, READER_A)).toBe('ADMIN_REQUIRED');
    const mine = (await ok(CREATE, { input: input() }, READER_A)).newsCreateSource;
    expect(mine.pathExclude).toEqual([]);
    expect(await code(UPDATE, { id: mine.id, input: { pathExclude: ['^/x/'] } }, READER_A)).toBe('ADMIN_REQUIRED');
    expect((await NewsSource.findById(mine.id).lean()).pathExclude).toEqual([]);
  });
});
