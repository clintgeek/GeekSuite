/**
 * newsgeekReaderSources.test.js — "Reader-added sources" (DOCS/NEWSGEEK_PLAN.md,
 * Chef 2026-10-10): who sees which source, per-reader switches, who may add
 * and change sources, one poll per feed, add limits, and suggestions.
 * Real operations against the real merged schema.
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
const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const H = 3600 * 1000;
const DAY = 24 * H;
const ago = (ms) => new Date(Date.now() - ms);

let server;
const run = async (query, variables = {}, userId = ALICE) => {
  const res = await server.executeOperation(
    { query, variables },
    { contextValue: { user: userId ? { id: String(userId) } : null } },
  );
  const r = res.body.singleResult;
  return { data: r.data ?? null, errors: r.errors ?? null };
};
const ok = async (...a) => {
  const { data, errors } = await run(...a);
  if (errors) throw new Error(JSON.stringify(errors));
  return data;
};
const err = async (...a) => (await run(...a)).errors?.[0] ?? null;
const code = async (...a) => (await err(...a))?.extensions?.code ?? null;

async function clean() {
  await Promise.all([
    NewsSource.deleteMany({}), NewsPlace.deleteMany({}), NewsArticle.deleteMany({}), NewsPrefs.deleteMany({}),
  ]);
}

beforeAll(async () => {
  await NewsSource.db.asPromise();
  await Promise.all([NewsSource.init(), NewsPlace.init(), NewsArticle.init(), NewsPrefs.init()]);
  await User.collection.deleteMany({ _id: { $in: [ADMIN, ALICE, BOB] } });
  await User.collection.insertMany([
    { _id: ADMIN, role: 'admin', username: 'chef' },
    { _id: ALICE, role: 'user', username: 'alice', displayName: 'Alice A', email: 'alice@example.test' },
    { _id: BOB, role: 'user', username: 'bob', email: 'bob@example.test' },
  ]);
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 60000);
beforeEach(clean);
afterAll(async () => {
  await clean();
  await User.collection.deleteMany({ _id: { $in: [ADMIN, ALICE, BOB] } });
  await server.stop();
  await NewsSource.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const SRC = `id slug name kind status defaultOn onForMe addedByMe canEdit addedByName feeds { url }`;
const CREATE = `mutation($input: NewsSourceInput!) { newsCreateSource(input: $input) { ${SRC} } }`;
const UPDATE = `mutation($id: ID!, $input: NewsSourceInput!) { newsUpdateSource(id: $id, input: $input) { ${SRC} } }`;
const STATUS = `mutation($id: ID!, $status: String!) { newsSetSourceStatus(id: $id, status: $status) { ${SRC} } }`;
const CHECK = `mutation($id: ID!) { newsCheckSourceNow(id: $id) { id } }`;
const SET_ON = `mutation($id: ID!, $on: Boolean!) { newsSetSourceOn(id: $id, on: $on) { ${SRC} } }`;
const SET_DEFAULT = `mutation($id: ID!, $on: Boolean!) { newsSetSourceDefaultOn(id: $id, on: $on) { ${SRC} } }`;
const SOURCES = `{ newsSources { ${SRC} } }`;
const ARTICLES = `query($sourceId: ID) { newsArticles(sourceId: $sourceId) { hiddenPaywalled items { title } } }`;
const SUGGEST = `{ newsSuggestedSources { domain count lastSeenAt sampleTitles paywalled places { name } } }`;

let n = 0;
async function mkSource(over = {}) {
  n += 1;
  return NewsSource.create({
    slug: `s-${n}-${new mongoose.Types.ObjectId()}`, name: `Src ${n}`, kind: 'journalism',
    sections: ['local'], status: 'active', feeds: [], ...over,
  });
}
async function mkArticle(source, over = {}) {
  n += 1;
  return NewsArticle.create({
    sourceId: source._id, feedUrl: 'https://x.test/feed', guid: `g${n}-${Math.random()}`,
    url: `https://x.test/${n}`, canonicalUrl: `https://x.test/${n}`, title: `Title ${n}`,
    titleKey: `title ${n}`, publisher: 'Pub', publishedAt: ago(H), fetchedAt: new Date(), ...over,
  });
}
const titles = async (user, vars = {}) => (await ok(ARTICLES, vars, user)).newsArticles.items.map((a) => a.title).sort();
const onForMe = async (user) => Object.fromEntries((await ok(SOURCES, {}, user)).newsSources.map((s) => [s.name, s.onForMe]));

/** default-on, legacy (no defaultOn field at all), Bob's (off by default), Alice's, retired ones. */
async function world() {
  const dflt = await mkSource({ name: 'Default' });
  const legacyId = new mongoose.Types.ObjectId();
  await NewsSource.collection.insertOne({
    _id: legacyId, slug: 'legacy', name: 'Legacy', kind: 'journalism', sections: ['local'], status: 'active',
    feeds: [], places: [], access: { paywall: 'none', content: 'excerpt' }, blockedDomains: [], notes: '',
  });
  const legacy = await NewsSource.findById(legacyId);
  const bobs = await mkSource({ name: 'Bobs', defaultOn: false, addedBy: String(BOB) });
  const alices = await mkSource({ name: 'Alices', defaultOn: false, addedBy: String(ALICE) });
  const retired = await mkSource({ name: 'Retired', status: 'retired' });
  const retiredMine = await mkSource({ name: 'RetiredMine', status: 'retired', defaultOn: false, addedBy: String(ALICE) });
  for (const s of [dflt, legacy, bobs, alices, retired, retiredMine]) await mkArticle(s, { title: s.name });
  return { dflt, legacy, bobs, alices, retired, retiredMine };
}

describe('visibility: newsArticles and onForMe agree', () => {
  it('no prefs: default-on (and a row with no defaultOn field) + the ones I added; never retired', async () => {
    await world();
    expect(await titles(ALICE)).toEqual(['Alices', 'Default', 'Legacy']);
    expect(await titles(BOB)).toEqual(['Bobs', 'Default', 'Legacy']);
    expect(await titles(ADMIN)).toEqual(['Default', 'Legacy']);
    expect(await onForMe(ALICE)).toEqual({ Default: true, Legacy: true, Bobs: false, Alices: true, Retired: false, RetiredMine: false });
    expect(await onForMe(BOB)).toEqual({ Default: true, Legacy: true, Bobs: true, Alices: false, Retired: false, RetiredMine: false });
  });

  it('sourcesOn turns on what is off by default; sourcesOff turns off a default or my own', async () => {
    const w = await world();
    await ok(SET_ON, { id: String(w.bobs._id), on: true });
    await ok(SET_ON, { id: String(w.dflt._id), on: false });
    await ok(SET_ON, { id: String(w.alices._id), on: false });
    expect(await titles(ALICE)).toEqual(['Bobs', 'Legacy']);
    expect(await onForMe(ALICE)).toMatchObject({ Default: false, Legacy: true, Bobs: true, Alices: false });
    // Only Alice's view changed.
    expect(await titles(BOB)).toEqual(['Bobs', 'Default', 'Legacy']);
    // And back.
    await ok(SET_ON, { id: String(w.dflt._id), on: true });
    await ok(SET_ON, { id: String(w.alices._id), on: true });
    await ok(SET_ON, { id: String(w.bobs._id), on: false });
    expect(await titles(ALICE)).toEqual(['Alices', 'Default', 'Legacy']);
  });

  it('newsSetSourceOn keeps the prefs row minimal and returns onForMe', async () => {
    const w = await world();
    const on = (await ok(SET_ON, { id: String(w.bobs._id), on: true })).newsSetSourceOn;
    expect(on).toMatchObject({ name: 'Bobs', onForMe: true, addedByMe: false, canEdit: false });
    const off = (await ok(SET_ON, { id: String(w.dflt._id), on: false })).newsSetSourceOn;
    expect(off.onForMe).toBe(false);
    const row = await NewsPrefs.findOne({ userId: String(ALICE) }).lean();
    expect(row.sourcesOn).toEqual([String(w.bobs._id)]);
    expect(row.sourcesOff).toEqual([String(w.dflt._id)]);
    expect(row.freeToReadOnly).toBe(false);
  });

  it('a hidden source is hidden even when asked for by sourceId', async () => {
    const w = await world();
    expect(await titles(ALICE, { sourceId: String(w.bobs._id) })).toEqual([]);
    expect(await titles(BOB, { sourceId: String(w.bobs._id) })).toEqual(['Bobs']);
  });

  it('hiddenPaywalled counts only sources the reader sees', async () => {
    const walledOff = await mkSource({ name: 'WalledOff', defaultOn: false, addedBy: String(BOB), access: { paywall: 'hard', content: 'excerpt' } });
    const walledOn = await mkSource({ name: 'WalledOn', access: { paywall: 'hard', content: 'excerpt' } });
    await mkArticle(walledOff);
    await mkArticle(walledOn);
    await ok(`mutation { newsSetPrefs(input: { freeToReadOnly: true }) { freeToReadOnly } }`, {}, ALICE);
    expect((await ok(ARTICLES, {}, ALICE)).newsArticles.hiddenPaywalled).toBe(1);
  });

  it('newsSetSourceOn: retired → BAD_USER_INPUT, unknown → NOT_FOUND, anonymous → UNAUTHENTICATED', async () => {
    const w = await world();
    expect(await code(SET_ON, { id: String(w.retired._id), on: true })).toBe('BAD_USER_INPUT');
    expect(await code(SET_ON, { id: String(new mongoose.Types.ObjectId()), on: true })).toBe('NOT_FOUND');
    expect(await code(SET_ON, { id: String(w.bobs._id), on: true }, null)).toBe('UNAUTHENTICATED');
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });
});

describe('newsCreateSource for any reader', () => {
  const input = (over = {}) => ({ name: 'Gurdon Times', kind: 'journalism', feeds: [{ url: 'https://gurdon.test/feed' }], ...over });

  it('takes exactly what the Add-a-source sheet sends (discovery "unknown" paywall sent as none, suggested places)', async () => {
    const place = await NewsPlace.create({ slug: 'gurdon-ar', name: 'Gurdon', kind: 'town' });
    const s = (await ok(CREATE, { input: input({ homepage: 'https://gurdon.test/', sections: ['local'], placeIds: [String(place._id)], paywall: 'none', feeds: [{ url: 'https://gurdon.test/feed', format: 'rss' }] }) }, ALICE)).newsCreateSource;
    expect(s).toMatchObject({ status: 'active', defaultOn: false });
    expect(await code(CREATE, { input: input({ paywall: 'unknown', feeds: [{ url: 'https://other.test/f' }] }) }, ALICE)).toBe('BAD_USER_INPUT');
  });

  it('reader feeds poll no faster than every 30 min (default 30, faster raised); an admin may go to 5', async () => {
    const r = (await ok(CREATE, { input: input({ feeds: [{ url: 'https://poll-a.test/f' }, { url: 'https://poll-b.test/f', pollEveryMin: 5 }, { url: 'https://poll-c.test/f', pollEveryMin: 120 }] }) }, ALICE)).newsCreateSource;
    const rows = (await NewsSource.findById(r.id).lean()).feeds.map((f) => f.pollEveryMin);
    expect(rows).toEqual([30, 30, 120]);
    const a = (await ok(CREATE, { input: input({ name: 'Admin fast', feeds: [{ url: 'https://poll-d.test/f', pollEveryMin: 5 }] }) }, ADMIN)).newsCreateSource;
    expect((await NewsSource.findById(a.id).lean()).feeds[0].pollEveryMin).toBe(5);
    const UPDATE = `mutation($id: ID!, $input: NewsSourceInput!) { newsUpdateSource(id: $id, input: $input) { id } }`;
    await ok(UPDATE, { id: r.id, input: { feeds: [{ url: 'https://poll-a.test/f', pollEveryMin: 5 }] } }, ALICE);
    expect((await NewsSource.findById(r.id).lean()).feeds[0].pollEveryMin).toBe(30);
  });

  it('the frontend selections on newsSetSourceOn / newsSetSourceDefaultOn / newsSuggestedSources resolve', async () => {
    const src = await mkSource({ name: 'Sel', defaultOn: false, addedBy: String(BOB) });
    const FIELDS = `id slug name homepage kind sections status paywalled articlesLast7d onForMe defaultOn addedByMe canEdit addedByName
      access { paywall content } places { id name } feeds { id url health }`;
    const a = (await ok(`mutation($id: ID!) { newsSetSourceOn(id: $id, on: true) { ${FIELDS} } }`, { id: String(src._id) }, ALICE)).newsSetSourceOn;
    expect(a).toMatchObject({ id: String(src._id), onForMe: true, defaultOn: false });
    const b = (await ok(`mutation($id: ID!) { newsSetSourceDefaultOn(id: $id, on: true) { ${FIELDS} } }`, { id: String(src._id) }, ADMIN)).newsSetSourceDefaultOn;
    expect(b).toMatchObject({ onForMe: true, defaultOn: true });
    await ok(`{ newsSuggestedSources { domain count lastSeenAt places { id name } sampleTitles paywalled } newsPlaces { id slug } }`);
  });

  it('a non-admin source: defaultOn false, addedBy the caller, active, due now — only its adder sees its articles', async () => {
    const before = Date.now();
    const s = (await ok(CREATE, { input: input() }, ALICE)).newsCreateSource;
    expect(s).toMatchObject({ defaultOn: false, status: 'active', addedByMe: true, canEdit: true, onForMe: true, addedByName: null });
    const stored = await NewsSource.findById(s.id).lean();
    expect(stored.addedBy).toBe(String(ALICE));
    expect(stored.defaultOn).toBe(false);
    expect(stored.feeds[0].nextPollAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    await mkArticle(stored, { title: 'from alice source' });
    expect(await titles(ALICE)).toEqual(['from alice source']);
    expect(await titles(BOB)).toEqual([]);
    expect(await titles(ADMIN)).toEqual([]);
  });

  it('a non-admin can never make an aggregator or set defaultOn (ADMIN_REQUIRED, nothing created)', async () => {
    expect(await code(CREATE, { input: input({ kind: 'aggregator' }) }, ALICE)).toBe('ADMIN_REQUIRED');
    expect(await code(CREATE, { input: input({ defaultOn: true }) }, ALICE)).toBe('ADMIN_REQUIRED');
    expect(await code(CREATE, { input: input({ defaultOn: false }) }, ALICE)).toBe('ADMIN_REQUIRED');
    expect(await NewsSource.countDocuments({})).toBe(0);
  });

  it('an admin source is on for everyone unless the admin says otherwise; admins may add aggregators', async () => {
    const a = (await ok(CREATE, { input: input() }, ADMIN)).newsCreateSource;
    expect(a).toMatchObject({ defaultOn: true, status: 'active', addedByMe: true, canEdit: true });
    expect((await NewsSource.findById(a.id).lean()).feeds[0].nextPollAt).toBeInstanceOf(Date);
    const b = (await ok(CREATE, { input: input({ name: 'Quiet', defaultOn: false, feeds: [{ url: 'https://quiet.test/rss' }] }) }, ADMIN)).newsCreateSource;
    expect(b.defaultOn).toBe(false);
    const g = (await ok(CREATE, { input: input({ name: 'GN', kind: 'aggregator', feeds: [] }) }, ADMIN)).newsCreateSource;
    expect(g.kind).toBe('aggregator');
  });
});

describe('one poll per feed: DUPLICATE_FEED', () => {
  it('host case, trailing slash, fragment and http/https variants are the same feed; extensions.sourceId points at the owner', async () => {
    const owner = await mkSource({ name: 'Owner', feeds: [{ url: 'https://dup.test/news/feed' }] });
    for (const url of ['https://dup.test/news/feed', 'HTTPS://DUP.TEST/news/feed/', 'https://Dup.Test/news/feed#top', 'http://dup.test/news/feed', 'https://dup.test:443/news/feed//']) {
      for (const who of [ALICE, ADMIN]) {
        const e = await err(CREATE, { input: { name: `X ${url}`, kind: 'journalism', feeds: [{ url }] } }, who);
        expect(e?.extensions).toMatchObject({ code: 'DUPLICATE_FEED', sourceId: String(owner._id) });
      }
    }
    expect(await NewsSource.countDocuments({})).toBe(1);
    // A different path (case counts in a path) is a different feed.
    await ok(CREATE, { input: { name: 'Other', kind: 'journalism', feeds: [{ url: 'https://dup.test/news/FEED' }] } });
  });

  it('newsUpdateSource refuses another source\'s feed but keeps its own', async () => {
    await mkSource({ name: 'Owner', feeds: [{ url: 'https://dup.test/feed' }] });
    const mine = (await ok(CREATE, { input: { name: 'Mine', kind: 'journalism', feeds: [{ url: 'https://mine.test/feed' }] } }, ALICE)).newsCreateSource;
    expect(await code(UPDATE, { id: mine.id, input: { feeds: [{ url: 'https://mine.test/feed' }, { url: 'https://dup.test/feed/' }] } }, ALICE)).toBe('DUPLICATE_FEED');
    const out = (await ok(UPDATE, { id: mine.id, input: { feeds: [{ url: 'https://mine.test/feed' }, { url: 'https://mine.test/other' }] } }, ALICE)).newsUpdateSource;
    expect(out.feeds.map((f) => f.url)).toEqual(['https://mine.test/feed', 'https://mine.test/other']);
  });

  it('two spellings of one feed in the same input are refused', async () => {
    expect(await code(CREATE, { input: { name: 'Twice', kind: 'journalism', feeds: [{ url: 'https://t.test/feed' }, { url: 'https://T.test/feed/' }] } })).toBe('BAD_USER_INPUT');
  });
});

describe('add limits: 20 per rolling 24h, 200 in total (RATE_LIMITED)', () => {
  const bulk = (userId, count, createdAt) => NewsSource.collection.insertMany(Array.from({ length: count }, (_, i) => ({
    slug: `bulk-${String(userId)}-${createdAt.getTime()}-${i}`, name: 'B', kind: 'journalism', status: 'active',
    feeds: [], addedBy: String(userId), defaultOn: false, createdAt, updatedAt: createdAt,
  })));
  const add = (who, i = 0) => run(CREATE, { input: { name: `New ${i}`, kind: 'journalism' } }, who);

  it('the 21st in 24 hours is refused; older ones do not count toward the day; other readers are unaffected', async () => {
    await bulk(ALICE, 19, ago(H));
    await bulk(ALICE, 5, ago(25 * H));
    expect((await add(ALICE, 1)).errors).toBeNull();
    const e = (await add(ALICE, 2)).errors?.[0];
    expect(e?.extensions).toMatchObject({ code: 'RATE_LIMITED', limit: 20 });
    expect((await add(BOB, 3)).errors).toBeNull();
  });

  it('200 in total is the most one reader can add', async () => {
    await bulk(ALICE, 199, ago(10 * DAY));
    expect((await add(ALICE, 1)).errors).toBeNull();
    expect((await add(ALICE, 2)).errors?.[0]?.extensions).toMatchObject({ code: 'RATE_LIMITED', limit: 200 });
  });

  it('admins are not limited', async () => {
    await bulk(ADMIN, 25, ago(H));
    expect((await add(ADMIN, 1)).errors).toBeNull();
  });
});

describe('edit rights', () => {
  async function two() {
    const mine = (await ok(CREATE, { input: { name: 'Mine', kind: 'journalism', feeds: [{ url: 'https://mine.test/f' }] } }, ALICE)).newsCreateSource;
    const bobs = (await ok(CREATE, { input: { name: 'Bobs', kind: 'journalism', feeds: [{ url: 'https://bob.test/f' }] } }, BOB)).newsCreateSource;
    return { mine, bobs };
  }

  it('the adder may edit, check now, and set active/retired on their own source', async () => {
    const { mine } = await two();
    expect((await ok(UPDATE, { id: mine.id, input: { name: 'Mine, renamed', paywall: 'metered' } }, ALICE)).newsUpdateSource.name).toBe('Mine, renamed');
    expect((await ok(STATUS, { id: mine.id, status: 'retired' }, ALICE)).newsSetSourceStatus.status).toBe('retired');
    expect((await ok(STATUS, { id: mine.id, status: 'active' }, ALICE)).newsSetSourceStatus.status).toBe('active');
    await NewsSource.updateOne({ _id: mine.id }, { $set: { 'feeds.$[].nextPollAt': new Date(Date.now() + DAY) } });
    await ok(CHECK, { id: mine.id }, ALICE);
    expect((await NewsSource.findById(mine.id).lean()).feeds[0].nextPollAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("the adder can't set other statuses, defaultOn or aggregator — and can't touch someone else's source", async () => {
    const { mine, bobs } = await two();
    for (const status of ['broken', 'discovered', 'verified']) {
      expect(await code(STATUS, { id: mine.id, status }, ALICE)).toBe('ADMIN_REQUIRED');
    }
    expect(await code(UPDATE, { id: mine.id, input: { defaultOn: true } }, ALICE)).toBe('ADMIN_REQUIRED');
    expect(await code(UPDATE, { id: mine.id, input: { kind: 'aggregator' } }, ALICE)).toBe('ADMIN_REQUIRED');
    expect(await code(UPDATE, { id: bobs.id, input: { name: 'Hijacked' } }, ALICE)).toBe('ADMIN_REQUIRED');
    expect(await code(STATUS, { id: bobs.id, status: 'retired' }, ALICE)).toBe('ADMIN_REQUIRED');
    expect(await code(CHECK, { id: bobs.id }, ALICE)).toBe('ADMIN_REQUIRED');
    const stored = await NewsSource.findById(bobs.id).lean();
    expect(stored).toMatchObject({ name: 'Bobs', status: 'active', defaultOn: false, kind: 'journalism' });
    expect((await NewsSource.findById(mine.id).lean())).toMatchObject({ status: 'active', defaultOn: false, kind: 'journalism' });
    const flags = Object.fromEntries((await ok(SOURCES, {}, ALICE)).newsSources.map((s) => [s.name, [s.addedByMe, s.canEdit]]));
    expect(flags).toEqual({ Mine: [true, true], Bobs: [false, false] });
  });

  it('an admin may do all of it on anyone\'s source', async () => {
    const { mine } = await two();
    expect((await ok(UPDATE, { id: mine.id, input: { name: 'Curated', defaultOn: true } }, ADMIN)).newsUpdateSource)
      .toMatchObject({ name: 'Curated', defaultOn: true, canEdit: true, addedByMe: false });
    expect((await ok(STATUS, { id: mine.id, status: 'broken' }, ADMIN)).newsSetSourceStatus.status).toBe('broken');
    await ok(CHECK, { id: mine.id }, ADMIN);
  });

  it('newsSetSourceDefaultOn is admin-only, and flips who sees it', async () => {
    const { mine } = await two();
    await mkArticle({ _id: new mongoose.Types.ObjectId(mine.id) }, { title: 'alice-source item' });
    expect(await code(SET_DEFAULT, { id: mine.id, on: true }, ALICE)).toBe('ADMIN_REQUIRED');
    expect(await code(SET_DEFAULT, { id: mine.id, on: true }, null)).toBe('UNAUTHENTICATED');
    expect(await titles(BOB)).toEqual([]);
    expect((await ok(SET_DEFAULT, { id: mine.id, on: true }, ADMIN)).newsSetSourceDefaultOn.defaultOn).toBe(true);
    expect(await titles(BOB)).toEqual(['alice-source item']);
    await ok(SET_DEFAULT, { id: mine.id, on: false }, ADMIN);
    expect(await titles(BOB)).toEqual([]);
    expect(await code(SET_DEFAULT, { id: String(new mongoose.Types.ObjectId()), on: true }, ADMIN)).toBe('NOT_FOUND');
  });

  it('addedByName: admins see the display name (never the email); everyone else gets null', async () => {
    await two();
    const byName = async (who) => Object.fromEntries((await ok(SOURCES, {}, who)).newsSources.map((s) => [s.name, s.addedByName]));
    expect(await byName(ADMIN)).toEqual({ Mine: 'Alice A', Bobs: 'bob' });
    expect(await byName(ALICE)).toEqual({ Mine: null, Bobs: null });
    expect(await byName(BOB)).toEqual({ Mine: null, Bobs: null });
  });
});

describe('newsSuggestedSources', () => {
  it('aggregator items of the last 30 days by publisher domain, minus domains we read directly, ranked by count', async () => {
    const ar = await NewsPlace.create({ slug: 'ar', name: 'Arkansas', kind: 'state' });
    const mag = await NewsPlace.create({ slug: 'magnolia-ar', name: 'Magnolia', kind: 'town', parentId: ar._id });
    const eld = await NewsPlace.create({ slug: 'el-dorado-ar', name: 'El Dorado', kind: 'town', parentId: ar._id });
    const gn = await mkSource({ name: 'GN', kind: 'aggregator' });
    await mkSource({ name: 'Direct', homepage: 'https://www.direct.test/' });
    await mkSource({ name: 'FeedHost', feeds: [{ url: 'https://feeds.other.test/rss' }], status: 'retired' });
    const journalismItems = await mkSource({ name: 'J' });
    const add = (domain, count, over = {}) => Promise.all(Array.from({ length: count }, (_, i) => mkArticle(gn, { publisherDomain: domain, title: `${domain} ${i}`, publishedAt: ago((i + 1) * H), ...over })));
    await add('magnoliareporter.test', 4, { places: [mag._id] });
    await mkArticle(gn, { publisherDomain: 'magnoliareporter.test', title: 'eldo', places: [eld._id], publishedAt: ago(10 * H) });
    await add('small.test', 2);
    await add('reuters.com', 3);
    await add('old.test', 9, { publishedAt: ago(31 * DAY) });
    await add('direct.test', 20);
    await add('news.direct.test', 20);
    await add('feeds.other.test', 20);
    await mkArticle(journalismItems, { publisherDomain: 'notagg.test' });
    const { newsSuggestedSources: s } = await ok(SUGGEST);
    expect(s.map((x) => [x.domain, x.count])).toEqual([['magnoliareporter.test', 5], ['reuters.com', 3], ['small.test', 2]]);
    expect(s[0].places.map((p) => p.name).sort()).toEqual(['El Dorado', 'Magnolia']);
    expect(s[0].sampleTitles).toEqual(['magnoliareporter.test 0', 'magnoliareporter.test 1', 'magnoliareporter.test 2']);
    expect(new Date(s[0].lastSeenAt).getTime()).toBeGreaterThan(Date.now() - 2 * H);
    expect(s.map((x) => x.paywalled)).toEqual([false, true, false]);
  });

  it('top 30, and signed-in only', async () => {
    const gn = await mkSource({ name: 'GN', kind: 'aggregator' });
    await NewsArticle.insertMany(Array.from({ length: 35 }, (_, i) => Array.from({ length: i + 1 }, (__, j) => ({
      sourceId: gn._id, feedUrl: 'f', guid: `t${i}-${j}`, url: `https://d${i}.test/${j}`, canonicalUrl: `https://d${i}.test/${j}`,
      title: `d${i} ${j}`, titleKey: `d${i} ${j}`, publisher: 'P', publisherDomain: `d${i}.test`, publishedAt: ago(H), fetchedAt: new Date(),
    }))).flat());
    const { newsSuggestedSources: s } = await ok(SUGGEST);
    expect(s).toHaveLength(30);
    expect(s[0]).toMatchObject({ domain: 'd34.test', count: 35 });
    expect(s[29]).toMatchObject({ domain: 'd5.test', count: 6 });
    expect(await code(SUGGEST, {}, null)).toBe('UNAUTHENTICATED');
  });
});
