/**
 * newsgeekSourceSheet.test.js — the per-source reader sheet (DOCS/NEWSGEEK_PLAN.md,
 * "Source sheet", Chef 2026-10-10): "I subscribe" for sources and publisher
 * domains (kept through "Free to read"), "Hide this publisher" for aggregator
 * items, and the article fields the sheet needs (publisherDomain, viaAggregator).
 * Real operations against the real merged schema.
 */
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';

const { typeDefs, resolvers } = await import('../graphql/index.js');
const { NewsSource } = await import('../graphql/newsgeek/models/source.js');
const { NewsPlace } = await import('../graphql/newsgeek/models/place.js');
const { NewsArticle } = await import('../graphql/newsgeek/models/article.js');
const { NewsPrefs } = await import('../graphql/newsgeek/models/prefs.js');

const READER_A = String(new mongoose.Types.ObjectId());
const READER_B = String(new mongoose.Types.ObjectId());
const H = 3600 * 1000;
const ago = (ms) => new Date(Date.now() - ms);

let server;
const run = async (query, variables = {}, userId = READER_A) => {
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
  await Promise.all([
    NewsSource.deleteMany({}), NewsPlace.deleteMany({}), NewsArticle.deleteMany({}), NewsPrefs.deleteMany({}),
  ]);
}

beforeAll(async () => {
  await NewsSource.db.asPromise();
  await Promise.all([NewsSource.init(), NewsPlace.init(), NewsArticle.init(), NewsPrefs.init()]);
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 60000);
beforeEach(clean);
afterAll(async () => {
  await clean();
  await server.stop();
  await NewsSource.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const PREFS_FIELDS = 'freeToReadOnly subscribedSourceIds subscribedDomains mutedDomains';
const PREFS = `{ newsPrefs { ${PREFS_FIELDS} } }`;
const SET = `mutation($input: NewsPrefsInput!) { newsSetPrefs(input: $input) { freeToReadOnly } }`;
const SUB_SOURCE = `mutation($id: ID!, $on: Boolean!) { newsSetSourceSubscribed(id: $id, on: $on) { id subscribedByMe paywalled } }`;
const PUB = `mutation($domain: String!, $subscribed: Boolean, $muted: Boolean) {
  newsSetPublisherPref(domain: $domain, subscribed: $subscribed, muted: $muted) { ${PREFS_FIELDS} }
}`;
const ARTICLES = `query($sourceId: ID) {
  newsArticles(sourceId: $sourceId) {
    hiddenPaywalled items { title publisherDomain viaAggregator sourceKind }
  }
}`;
const setFree = (on, user = READER_A) => ok(SET, { input: { freeToReadOnly: on } }, user);
const subSource = (id, on, user = READER_A) => ok(SUB_SOURCE, { id: String(id), on }, user);
const pub = (vars, user = READER_A) => ok(PUB, vars, user);
const titles = async (vars = {}, user = READER_A) => {
  const page = (await ok(ARTICLES, vars, user)).newsArticles;
  return { titles: page.items.map((a) => a.title).sort(), hidden: page.hiddenPaywalled, items: page.items };
};

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
const walledSource = (paywall, over = {}) => mkSource({ name: paywall, access: { paywall, content: 'excerpt' }, ...over });
const gnewsSource = (over = {}) => mkSource({ name: 'GNews', kind: 'aggregator', access: { paywall: 'none', content: 'title' }, ...over });

describe('NewsArticle.publisherDomain / viaAggregator', () => {
  it('carries the stored domain and says whether the source is an aggregator', async () => {
    const direct = await mkSource({ name: 'Direct' });
    const gnews = await gnewsSource();
    await mkArticle(direct, { title: 'd', publisherDomain: 'arkadelphian.com' });
    await mkArticle(gnews, { title: 'g', publisherDomain: 'magnoliareporter.com' });
    await mkArticle(gnews, { title: 'g-none', publisherDomain: null });
    const { items } = await titles();
    const by = Object.fromEntries(items.map((a) => [a.title, [a.publisherDomain, a.viaAggregator]]));
    expect(by).toEqual({
      d: ['arkadelphian.com', false],
      g: ['magnoliareporter.com', true],
      'g-none': [null, true],
    });
  });
});

describe('newsPrefs defaults', () => {
  it('a reader with no row gets empty lists, and reading creates no row', async () => {
    expect((await ok(PREFS)).newsPrefs).toEqual({
      freeToReadOnly: false, subscribedSourceIds: [], subscribedDomains: [], mutedDomains: [],
    });
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });
});

describe('newsSetSourceSubscribed', () => {
  it('refuses an anonymous caller and writes nothing', async () => {
    const s = await walledSource('hard');
    expect(await code(SUB_SOURCE, { id: String(s._id), on: true }, null)).toBe('UNAUTHENTICATED');
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });

  it('sets subscribedByMe and the prefs list; toggles are idempotent', async () => {
    const s = await walledSource('hard');
    expect((await subSource(s._id, true)).newsSetSourceSubscribed.subscribedByMe).toBe(true);
    expect((await subSource(s._id, true)).newsSetSourceSubscribed.subscribedByMe).toBe(true);
    expect((await ok(PREFS)).newsPrefs.subscribedSourceIds).toEqual([String(s._id)]);
    const { newsSources } = await ok(`{ newsSources { id subscribedByMe } }`);
    expect(newsSources).toEqual([{ id: String(s._id), subscribedByMe: true }]);
    expect((await subSource(s._id, false)).newsSetSourceSubscribed.subscribedByMe).toBe(false);
    expect((await subSource(s._id, false)).newsSetSourceSubscribed.subscribedByMe).toBe(false);
    expect((await ok(PREFS)).newsPrefs.subscribedSourceIds).toEqual([]);
    expect(await NewsPrefs.countDocuments({ userId: READER_A })).toBe(1);
  });

  it('an unknown id is NOT_FOUND, a malformed one BAD_USER_INPUT, subscribing to a retired one BAD_USER_INPUT', async () => {
    expect(await code(SUB_SOURCE, { id: String(new mongoose.Types.ObjectId()), on: true })).toBe('NOT_FOUND');
    expect(await code(SUB_SOURCE, { id: 'nope', on: true })).toBe('BAD_USER_INPUT');
    const retired = await walledSource('hard', { status: 'retired' });
    expect(await code(SUB_SOURCE, { id: String(retired._id), on: true })).toBe('BAD_USER_INPUT');
    // Unsubscribing from a retired source is allowed (cleanup).
    expect((await subSource(retired._id, false)).newsSetSourceSubscribed.subscribedByMe).toBe(false);
    expect((await ok(PREFS)).newsPrefs.subscribedSourceIds).toEqual([]);
  });
});

describe('Free to read with subscriptions', () => {
  it('a subscribed metered or hard source survives the switch, and is not counted as hidden', async () => {
    const metered = await walledSource('metered');
    const hard = await walledSource('hard');
    const other = await walledSource('hard', { name: 'other' });
    await mkArticle(metered, { title: 'metered-1' });
    await mkArticle(hard, { title: 'hard-1' });
    await mkArticle(other, { title: 'other-1' });
    await setFree(true);
    expect(await titles()).toMatchObject({ titles: [], hidden: 3 });
    await subSource(metered._id, true);
    await subSource(hard._id, true);
    expect(await titles()).toMatchObject({ titles: ['hard-1', 'metered-1'], hidden: 1 });
    await subSource(hard._id, false);
    expect(await titles()).toMatchObject({ titles: ['metered-1'], hidden: 2 });
  });

  it('a subscribed domain (and its subdomains) survives for aggregator items, on a label boundary', async () => {
    const gnews = await gnewsSource();
    await mkArticle(gnews, { title: 'nwa', publisherDomain: 'nwaonline.com' });
    await mkArticle(gnews, { title: 'nwa-obits', publisherDomain: 'obits.nwaonline.com' });
    await mkArticle(gnews, { title: 'reuters', publisherDomain: 'reuters.com' });
    await setFree(true);
    expect(await titles()).toMatchObject({ titles: [], hidden: 3 });
    await pub({ domain: 'NWAOnline.com', subscribed: true });
    expect(await titles()).toMatchObject({ titles: ['nwa', 'nwa-obits'], hidden: 1 });
    // A subscription to a subdomain covers only that subdomain.
    await pub({ domain: 'nwaonline.com', subscribed: false });
    await pub({ domain: 'obits.nwaonline.com', subscribed: true });
    expect(await titles()).toMatchObject({ titles: ['nwa-obits'], hidden: 2 });
  });

  it('a subscribed domain does not rescue a direct paywalled source (that is the per-source switch)', async () => {
    const hard = await walledSource('hard', { homepage: 'https://www.hotsr.com/' });
    await mkArticle(hard, { title: 'hotsr-direct', publisherDomain: 'hotsr.com' });
    await setFree(true);
    await pub({ domain: 'hotsr.com', subscribed: true });
    expect(await titles()).toMatchObject({ titles: [], hidden: 1 });
  });

  it("A's subscriptions never affect B", async () => {
    const hard = await walledSource('hard');
    const gnews = await gnewsSource();
    await mkArticle(hard, { title: 'hard-1' });
    await mkArticle(gnews, { title: 'reuters', publisherDomain: 'reuters.com' });
    await setFree(true, READER_A);
    await setFree(true, READER_B);
    await subSource(hard._id, true, READER_A);
    await pub({ domain: 'reuters.com', subscribed: true }, READER_A);
    expect(await titles({}, READER_A)).toMatchObject({ titles: ['hard-1', 'reuters'], hidden: 0 });
    expect(await titles({}, READER_B)).toMatchObject({ titles: [], hidden: 2 });
    expect((await ok(PREFS, {}, READER_B)).newsPrefs).toMatchObject({ subscribedSourceIds: [], subscribedDomains: [] });
  });
});

describe('Hide this publisher (mutedDomains)', () => {
  async function world() {
    const gnews = await gnewsSource();
    const direct = await mkSource({ name: 'Magnolia Reporter', homepage: 'https://magnoliareporter.com/' });
    await mkArticle(gnews, { title: 'agg-magnolia', publisherDomain: 'magnoliareporter.com' });
    await mkArticle(gnews, { title: 'agg-magnolia-sub', publisherDomain: 'news.magnoliareporter.com' });
    await mkArticle(gnews, { title: 'agg-not-magnolia', publisherDomain: 'notmagnoliareporter.com' });
    await mkArticle(gnews, { title: 'agg-reuters', publisherDomain: 'reuters.com' });
    await mkArticle(direct, { title: 'direct-magnolia', publisherDomain: 'magnoliareporter.com' });
    return { gnews, direct };
  }

  it('hides aggregator items from the domain and its subdomains with the switch off', async () => {
    await world();
    await pub({ domain: 'magnoliareporter.com', muted: true });
    expect(await titles()).toMatchObject({
      titles: ['agg-not-magnolia', 'agg-reuters', 'direct-magnolia'], hidden: 0,
    });
  });

  it('hides them with the switch on too, and hiddenPaywalled counts only paywalled items', async () => {
    await world();
    await pub({ domain: 'reuters.com', muted: true });
    await setFree(true);
    // reuters is paywalled AND muted: muted wins, and it is not counted as paywall-hidden.
    expect(await titles()).toMatchObject({
      titles: ['agg-magnolia', 'agg-magnolia-sub', 'agg-not-magnolia', 'direct-magnolia'], hidden: 0,
    });
    await pub({ domain: 'reuters.com', muted: false });
    expect(await titles()).toMatchObject({ hidden: 1 });
  });

  it('never hides a direct source, even one whose own domain is muted', async () => {
    const { direct } = await world();
    await pub({ domain: 'magnoliareporter.com', muted: true });
    expect(await titles({ sourceId: String(direct._id) })).toMatchObject({ titles: ['direct-magnolia'] });
  });

  it('applies within a sourceId filter on the aggregator', async () => {
    const { gnews } = await world();
    await pub({ domain: 'magnoliareporter.com', muted: true });
    expect(await titles({ sourceId: String(gnews._id) })).toMatchObject({
      titles: ['agg-not-magnolia', 'agg-reuters'],
    });
  });

  it("A's hidden publishers never affect B", async () => {
    await world();
    await pub({ domain: 'magnoliareporter.com', muted: true }, READER_A);
    expect((await titles({}, READER_B)).titles).toHaveLength(5);
    expect((await titles({}, READER_A)).titles).toHaveLength(3);
  });
});

describe('newsSetPublisherPref', () => {
  it('refuses an anonymous caller', async () => {
    expect(await code(PUB, { domain: 'example.com', muted: true }, null)).toBe('UNAUTHENTICATED');
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });

  it('normalizes: lower-case, trims, drops www. and a trailing dot', async () => {
    const r = (await pub({ domain: '  WWW.Example.COM. ', subscribed: true, muted: true })).newsSetPublisherPref;
    expect(r.subscribedDomains).toEqual(['example.com']);
    expect(r.mutedDomains).toEqual(['example.com']);
  });

  it.each([
    'https://example.com', 'example.com/path', 'example.com:8080', '192.168.1.10', '10.0.0.1',
    '[::1]', 'localhost', 'example', '', '   ', 'exa mple.com', '-bad.com', 'bad-.com', 'a..com',
    'user@example.com', 'example.123', `${'a'.repeat(64)}.com`,
  ])('rejects %p with BAD_USER_INPUT and writes nothing', async (domain) => {
    expect(await code(PUB, { domain, muted: true })).toBe('BAD_USER_INPUT');
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });

  it('accepts subdomains, hyphens, multi-label TLDs and punycode', async () => {
    for (const d of ['obits.nwaonline.com', 'my-paper.co.uk', 'xn--bcher-kva.example', 'news.xn--p1ai']) {
      await pub({ domain: d, muted: true });
    }
    expect((await ok(PREFS)).newsPrefs.mutedDomains)
      .toEqual(['obits.nwaonline.com', 'my-paper.co.uk', 'xn--bcher-kva.example', 'news.xn--p1ai']);
  });

  it('an omitted flag is unchanged; toggles are idempotent', async () => {
    await pub({ domain: 'example.com', subscribed: true });
    await pub({ domain: 'example.com', subscribed: true });
    await pub({ domain: 'example.com', muted: true });
    let p = (await ok(PREFS)).newsPrefs;
    expect(p).toMatchObject({ subscribedDomains: ['example.com'], mutedDomains: ['example.com'] });
    await pub({ domain: 'example.com', muted: false });
    await pub({ domain: 'example.com', muted: false });
    p = (await ok(PREFS)).newsPrefs;
    expect(p).toMatchObject({ subscribedDomains: ['example.com'], mutedDomains: [] });
    // Neither flag: nothing changes, nothing is created for a new reader.
    expect((await pub({ domain: 'example.com' }, READER_B)).newsSetPublisherPref.subscribedDomains).toEqual([]);
    expect(await NewsPrefs.countDocuments({ userId: READER_B })).toBe(0);
  });

  it('caps subscribed domains at 100 and hidden at 200 (re-adding one already there is fine)', async () => {
    await NewsPrefs.create({
      userId: READER_A,
      subscribedDomains: Array.from({ length: 100 }, (_, i) => `s${i}.example`),
      mutedDomains: Array.from({ length: 200 }, (_, i) => `m${i}.example`),
    });
    expect(await code(PUB, { domain: 'one-more.example', subscribed: true })).toBe('BAD_USER_INPUT');
    expect(await code(PUB, { domain: 'one-more.example', muted: true })).toBe('BAD_USER_INPUT');
    await pub({ domain: 's0.example', subscribed: true });
    await pub({ domain: 'm0.example', muted: true });
    const p = (await ok(PREFS)).newsPrefs;
    expect(p.subscribedDomains).toHaveLength(100);
    expect(p.mutedDomains).toHaveLength(200);
    // Removing always works.
    await pub({ domain: 's0.example', subscribed: false });
    await pub({ domain: 'one-more.example', subscribed: true });
    expect((await ok(PREFS)).newsPrefs.subscribedDomains).toContain('one-more.example');
  });

  it('writes only the caller row; the args cannot name a user', async () => {
    await pub({ domain: 'example.com', muted: true }, READER_A);
    expect((await ok(PREFS, {}, READER_B)).newsPrefs.mutedDomains).toEqual([]);
    const { errors } = await run(`mutation { newsSetPublisherPref(domain: "x.com", muted: true, userId: "${READER_B}") { mutedDomains } }`);
    expect(errors).not.toBeNull();
    expect(await NewsPrefs.countDocuments({ userId: READER_B })).toBe(0);
  });
});
