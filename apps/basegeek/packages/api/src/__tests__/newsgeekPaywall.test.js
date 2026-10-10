/**
 * newsgeekPaywall.test.js — the reader's "Free to read" switch
 * (DOCS/NEWSGEEK_PLAN.md, Decisions: "Paywalls"; Gateway API: newsPrefs,
 * newsSetPrefs, NewsArticlePage.hiddenPaywalled, NewsSource.paywalled).
 * Real operations against the real merged schema.
 */
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import paywallsModule from '@geeksuite/schemas/newsgeek/paywalls';

const { typeDefs, resolvers } = await import('../graphql/index.js');
const { NewsSource } = await import('../graphql/newsgeek/models/source.js');
const { NewsPlace } = await import('../graphql/newsgeek/models/place.js');
const { NewsArticle } = await import('../graphql/newsgeek/models/article.js');
const { NewsPrefs } = await import('../graphql/newsgeek/models/prefs.js');

const { isPaywalledDomain, PAYWALLED_DOMAINS } = paywallsModule;

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

const PREFS = `{ newsPrefs { freeToReadOnly } }`;
const SET = `mutation($input: NewsPrefsInput!) { newsSetPrefs(input: $input) { freeToReadOnly } }`;
const ARTICLES = `query($section: String, $before: Date, $limit: Int) {
  newsArticles(section: $section, before: $before, limit: $limit) {
    nextBefore hiddenPaywalled items { title publishedAt }
  }
}`;
const setFree = (on, user = READER_A) => ok(SET, { input: { freeToReadOnly: on } }, user);
const titles = async (vars = {}, user = READER_A) => {
  const page = (await ok(ARTICLES, vars, user)).newsArticles;
  return { titles: page.items.map((a) => a.title).sort(), hidden: page.hiddenPaywalled, page };
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

/** A free source, a metered one, a hard one, and a Google News aggregator with a mix of publishers. */
async function mixedWorld() {
  const free = await mkSource({ name: 'Free', access: { paywall: 'none', content: 'excerpt' } });
  const metered = await mkSource({ name: 'Metered', access: { paywall: 'metered', content: 'excerpt' } });
  const hard = await mkSource({ name: 'Hard', access: { paywall: 'hard', content: 'excerpt' } });
  const gnews = await mkSource({ name: 'GNews', kind: 'aggregator', access: { paywall: 'none', content: 'title' } });
  await mkArticle(free, { title: 'free-1', publisherDomain: 'arkadelphian.com' });
  await mkArticle(metered, { title: 'metered-1', publisherDomain: 'theverge.com' });
  await mkArticle(hard, { title: 'hard-1', publisherDomain: 'hotsr.com' });
  await mkArticle(gnews, { title: 'agg-reuters', publisherDomain: 'reuters.com' });
  await mkArticle(gnews, { title: 'agg-nwa-obits', publisherDomain: 'obits.nwaonline.com' });
  await mkArticle(gnews, { title: 'agg-not-reuters', publisherDomain: 'notreuters.com' });
  await mkArticle(gnews, { title: 'agg-legacy', publisherDomain: 'legacy.com' });
  await mkArticle(gnews, { title: 'agg-no-domain', publisherDomain: null });
  return { free, metered, hard, gnews };
}
const ALL = ['agg-legacy', 'agg-no-domain', 'agg-not-reuters', 'agg-nwa-obits', 'agg-reuters', 'free-1', 'hard-1', 'metered-1'];
const FREE_ONLY = ['agg-legacy', 'agg-no-domain', 'agg-not-reuters', 'free-1'];

describe('isPaywalledDomain (the shared list)', () => {
  it('suffix-matches on a label boundary only', () => {
    expect(isPaywalledDomain('reuters.com')).toBe(true);
    expect(isPaywalledDomain('obits.nwaonline.com')).toBe(true);
    expect(isPaywalledDomain('WWW.BBC.CO.UK')).toBe(true);
    expect(isPaywalledDomain('notreuters.com')).toBe(false);
    expect(isPaywalledDomain('soft.com')).toBe(false);          // ft.com
    expect(isPaywalledDomain('bbc.co.uk.evil.test')).toBe(false);
    expect(isPaywalledDomain('apnews.com')).toBe(false);
    expect(isPaywalledDomain('reuters-com')).toBe(false);  // a dot is a dot, not "any character"
    expect(isPaywalledDomain(null)).toBe(false);
    for (const d of PAYWALLED_DOMAINS) expect(isPaywalledDomain(d)).toBe(true);
  });
});

describe('newsPrefs / newsSetPrefs', () => {
  it('refuses an anonymous caller', async () => {
    expect(await code(PREFS, {}, null)).toBe('UNAUTHENTICATED');
    expect(await code(SET, { input: { freeToReadOnly: true } }, null)).toBe('UNAUTHENTICATED');
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });

  it('defaults to off with no stored row, and does not create one on read', async () => {
    expect((await ok(PREFS)).newsPrefs).toEqual({ freeToReadOnly: false });
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });

  it('sets and reads back, and an empty input changes nothing', async () => {
    expect((await setFree(true)).newsSetPrefs).toEqual({ freeToReadOnly: true });
    expect((await ok(PREFS)).newsPrefs).toEqual({ freeToReadOnly: true });
    expect((await ok(SET, { input: {} })).newsSetPrefs).toEqual({ freeToReadOnly: true });
    expect((await setFree(false)).newsSetPrefs).toEqual({ freeToReadOnly: false });
    expect((await ok(PREFS)).newsPrefs).toEqual({ freeToReadOnly: false });
    expect(await NewsPrefs.countDocuments({ userId: READER_A })).toBe(1);
  });

  it("one reader's switch never touches another's", async () => {
    await setFree(true, READER_A);
    expect((await ok(PREFS, {}, READER_B)).newsPrefs.freeToReadOnly).toBe(false);
    await setFree(false, READER_B);
    expect((await ok(PREFS, {}, READER_A)).newsPrefs.freeToReadOnly).toBe(true);
    const rows = await NewsPrefs.find({}).lean();
    expect(rows.map((r) => [r.userId, r.freeToReadOnly]).sort()).toEqual([[READER_A, true], [READER_B, false]].sort());
  });

  it('the input cannot name a user: userId is not a field', async () => {
    const { errors } = await run(SET, { input: { freeToReadOnly: true, userId: READER_B } });
    expect(errors).not.toBeNull();
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });
});

describe('newsArticles with the switch', () => {
  it('off (the default): everything shows and hiddenPaywalled is 0', async () => {
    await mixedWorld();
    expect(await titles()).toMatchObject({ titles: ALL, hidden: 0 });
    await setFree(false);
    expect(await titles()).toMatchObject({ titles: ALL, hidden: 0 });
  });

  it('on: hides metered + hard sources and paywalled-domain aggregator items, counts them', async () => {
    await mixedWorld();
    await setFree(true);
    expect(await titles()).toMatchObject({ titles: FREE_ONLY, hidden: 4 });
  });

  it("is per reader: A's switch hides nothing for B", async () => {
    await mixedWorld();
    await setFree(true, READER_A);
    expect(await titles({}, READER_B)).toMatchObject({ titles: ALL, hidden: 0 });
    expect(await titles({}, READER_A)).toMatchObject({ titles: FREE_ONLY, hidden: 4 });
  });

  it('a direct source is judged by its own access.paywall, not by the domain list', async () => {
    const direct = await mkSource({ name: 'Direct', access: { paywall: 'none', content: 'excerpt' } });
    const gnews = await mkSource({ name: 'GNews', kind: 'aggregator', access: { paywall: 'none', content: 'title' } });
    await mkArticle(direct, { title: 'direct-on-listed-domain', publisherDomain: 'hotsr.com' });
    await mkArticle(gnews, { title: 'agg-on-listed-domain', publisherDomain: 'hotsr.com' });
    await setFree(true);
    expect(await titles()).toMatchObject({ titles: ['direct-on-listed-domain'], hidden: 1 });
  });

  it('hiddenPaywalled follows the other filters (section) and ignores the cursor', async () => {
    const tech = await mkSource({ name: 'TechWall', sections: ['tech'], access: { paywall: 'metered', content: 'excerpt' } });
    const local = await mkSource({ name: 'LocalWall', sections: ['local'], access: { paywall: 'hard', content: 'excerpt' } });
    await mkArticle(tech, { title: 'tw1' });
    await mkArticle(tech, { title: 'tw2' });
    await mkArticle(local, { title: 'lw1' });
    const freeTech = await mkSource({ name: 'FreeTech', sections: ['tech'] });
    for (let i = 0; i < 3; i += 1) await mkArticle(freeTech, { title: `ft${i}`, publishedAt: ago((i + 1) * H) });
    await setFree(true);
    expect(await titles({ section: 'tech' })).toMatchObject({ titles: ['ft0', 'ft1', 'ft2'], hidden: 2 });
    expect(await titles({ section: 'local' })).toMatchObject({ titles: [], hidden: 1 });
    const p1 = (await titles({ section: 'tech', limit: 2 })).page;
    const p2 = (await titles({ section: 'tech', limit: 2, before: p1.nextBefore })).page;
    expect(p2.hiddenPaywalled).toBe(2);
  });

  it('paging still works with the switch on: full pages of free items, no gaps, no repeats', async () => {
    const free = await mkSource({ name: 'Free' });
    const wall = await mkSource({ name: 'Wall', access: { paywall: 'hard', content: 'excerpt' } });
    // Interleave: paywalled items sit between the free ones in time.
    for (let i = 0; i < 6; i += 1) {
      await mkArticle(free, { title: `F${i}`, publishedAt: ago((2 * i + 1) * H) });
      await mkArticle(wall, { title: `W${i}`, publishedAt: ago((2 * i + 2) * H) });
    }
    await setFree(true);
    const seen = [];
    let before = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = (await ok(ARTICLES, { limit: 4, before }, READER_A)).newsArticles;
      expect(page.hiddenPaywalled).toBe(6);
      seen.push(...page.items.map((a) => a.title));
      if (!page.nextBefore) break;
      expect(page.items).toHaveLength(4);
      before = page.nextBefore;
    }
    expect(seen).toEqual(['F0', 'F1', 'F2', 'F3', 'F4', 'F5']);
  });
});

describe('NewsSource.paywalled', () => {
  it('is true for metered and hard, false for none', async () => {
    await mkSource({ slug: 'a-none', access: { paywall: 'none', content: 'excerpt' } });
    await mkSource({ slug: 'b-metered', access: { paywall: 'metered', content: 'excerpt' } });
    await mkSource({ slug: 'c-hard', access: { paywall: 'hard', content: 'excerpt' } });
    const { newsSources } = await ok(`{ newsSources { slug paywalled access { paywall } } }`);
    const by = Object.fromEntries(newsSources.map((s) => [s.slug, s.paywalled]));
    expect(by).toEqual({ 'a-none': false, 'b-metered': true, 'c-hard': true });
  });
});
