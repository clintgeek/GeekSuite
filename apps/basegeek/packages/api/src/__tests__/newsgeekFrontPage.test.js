/**
 * newsgeekFrontPage.test.js — Today through the real gateway (DOCS/NEWSGEEK_PLAN.md
 * "Ranking: the front page", Chef 2026-10-11): newsFrontPage, the per-reader
 * prefs it reads (homePlaces, source priority, section quotas), and
 * newsArticles(section) filtering by the same per-story section. The scoring
 * itself is pinned in newsgeekRanking.test.js; this proves the wiring.
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
const D = 24 * H;
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
afterAll(async () => {
  await clean();
  await server.stop();
  await NewsSource.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

// --- Fixtures --------------------------------------------------------------
const P = {};
async function seedPlaces() {
  const mk = async (slug, name, kind, parent) => {
    P[slug] = await NewsPlace.create({ slug, name, kind, parentId: parent ? P[parent]._id : null });
  };
  await mk('us', 'United States', 'country');
  await mk('arkansas', 'Arkansas', 'state', 'us');
  await mk('clark', 'Clark County', 'county', 'arkansas');
  await mk('arkadelphia', 'Arkadelphia', 'town', 'clark');
  await mk('gurdon', 'Gurdon', 'town', 'clark');
  await mk('garland', 'Garland County', 'county', 'arkansas');
  await mk('hot-springs', 'Hot Springs', 'town', 'garland');
  await mk('hsv', 'Hot Springs Village', 'town', 'garland');
  await mk('pulaski', 'Pulaski County', 'county', 'arkansas');
  await mk('little-rock', 'Little Rock', 'town', 'pulaski');
  await mk('miller', 'Miller County', 'county', 'arkansas');
  await mk('texarkana', 'Texarkana', 'town', 'miller');
}
const pid = (slug) => String(P[slug]._id);

async function mkSource(over = {}) {
  return NewsSource.create({
    slug: `s-${new mongoose.Types.ObjectId()}`, name: 'Src', kind: 'journalism',
    sections: ['local'], status: 'active', feeds: [], ...over,
  });
}
let n = 0;
async function mkArticle(source, over = {}) {
  n += 1;
  const { own = [], age = H, ...rest } = over;
  return NewsArticle.create({
    sourceId: source._id, feedUrl: 'https://x.test/feed', guid: `g${n}-${Math.random()}`,
    url: `https://x.test/${n}`, canonicalUrl: `https://x.test/${n}`, title: `Title ${n}`,
    titleKey: `title ${n}`, publisher: source.name, publishedAt: ago(age), fetchedAt: new Date(),
    // Ingest: the source's places plus what the text names.
    places: [...(source.places || []), ...own.map((s) => P[s]._id)],
    ...rest,
  });
}

const FRONT = `{ newsFrontPage { generatedAt sections { key title moreCount items { id title section why sourceName } } } }`;
const front = async (user = READER_A) => (await ok(FRONT, {}, user)).newsFrontPage;
const shape = (fp) => Object.fromEntries(fp.sections.map((s) => [s.key, s.items.map((i) => i.title)]));
const PREFS = `{ newsPrefs { homePlaces { id name } favoriteSourceIds lessSourceIds sectionQuotas { local state national world tech } } }`;
const SET_HOME = `mutation($ids: [ID!]!) { newsSetHomePlaces(placeIds: $ids) { homePlaces { id name } } }`;
const SET_PRIO = `mutation($id: ID!, $p: String!) { newsSetSourcePriority(id: $id, priority: $p) { id priorityForMe } }`;
const SET_PREFS = `mutation($input: NewsPrefsInput!) { newsSetPrefs(input: $input) { freeToReadOnly sectionQuotas { local state national world tech } } }`;
const ARTICLES = `query($section: String, $before: Date, $limit: Int) {
  newsArticles(section: $section, before: $before, limit: $limit) { nextBefore hiddenPaywalled items { id title section why } }
}`;
const setHome = (slugs, user = READER_A) => ok(SET_HOME, { ids: slugs.map(pid) }, user);
const setPrio = (src, p, user = READER_A) => ok(SET_PRIO, { id: String(src._id), p }, user);

/** A small paper: the cases the task names, one row each. */
async function seedPaper() {
  const s = {
    arkadelphian: await mkSource({ name: 'The Arkadelphian', places: [P.clark._id, P.arkadelphia._id] }),
    dg: await mkSource({ name: 'Democrat-Gazette', sections: ['state'], places: [P.arkansas._id] }),
    gnews: await mkSource({ name: 'Google News US', kind: 'aggregator', sections: ['national', 'world'], places: [P.us._id] }),
    hill: await mkSource({ name: 'The Hill', sections: ['national'], places: [P.us._id] }),
    verge: await mkSource({ name: 'The Verge', sections: ['tech'] }),
    texarkana: await mkSource({ name: 'Texarkana Gazette', places: [P.texarkana._id, P.miller._id] }),
  };
  await mkArticle(s.arkadelphian, { title: 'Arkadelphian weekly', age: 2 * D });
  await mkArticle(s.dg, { title: 'D-G about Arkadelphia', own: ['arkadelphia'] });
  await mkArticle(s.dg, { title: 'D-G statehouse' });
  await mkArticle(s.gnews, { title: 'AP Little Rock', own: ['little-rock'], publisherDomain: 'apnews.com' });
  await mkArticle(s.hill, { title: 'Hill on Arkansas', own: ['arkansas'] });
  await mkArticle(s.hill, { title: 'Hill untagged' });
  await mkArticle(s.verge, { title: 'Verge gadget' });
  await mkArticle(s.texarkana, { title: 'Texarkana council' });
  return s;
}

beforeEach(async () => {
  await clean();
  await seedPlaces();
});

describe('gate', () => {
  it('refuses an anonymous caller everywhere new', async () => {
    expect(await code(FRONT, {}, null)).toBe('UNAUTHENTICATED');
    expect(await code(SET_HOME, { ids: [] }, null)).toBe('UNAUTHENTICATED');
    expect(await code(SET_PRIO, { id: String(new mongoose.Types.ObjectId()), p: 'favorite' }, null)).toBe('UNAUTHENTICATED');
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });
});

describe('newsSetHomePlaces', () => {
  it('stores the ring in the reader’s order and newsPrefs returns it shaped', async () => {
    await setHome(['arkadelphia', 'clark', 'hot-springs']);
    const { newsPrefs } = await ok(PREFS);
    expect(newsPrefs.homePlaces.map((p) => p.name)).toEqual(['Arkadelphia', 'Clark County', 'Hot Springs']);
    await setHome(['hot-springs', 'arkadelphia']);
    expect((await ok(PREFS)).newsPrefs.homePlaces.map((p) => p.name)).toEqual(['Hot Springs', 'Arkadelphia']);
    await setHome([]);
    expect((await ok(PREFS)).newsPrefs.homePlaces).toEqual([]);
  });

  it('refuses more than 12, duplicates, unknown and malformed ids', async () => {
    const extra = await Promise.all(Array.from({ length: 13 }, (_, i) => NewsPlace.create({ slug: `x${i}`, name: `X${i}`, kind: 'town' })));
    expect(await code(SET_HOME, { ids: extra.map((p) => String(p._id)) })).toBe('BAD_USER_INPUT');
    const dup = (await run(SET_HOME, { ids: [pid('clark'), pid('clark')] })).errors?.[0];
    expect([dup?.extensions?.code, dup?.message]).toEqual(['BAD_USER_INPUT', 'A place is in the list twice']);
    expect(await code(SET_HOME, { ids: [String(new mongoose.Types.ObjectId())] })).toBe('BAD_USER_INPUT');
    expect(await code(SET_HOME, { ids: ['nope'] })).toBe('BAD_USER_INPUT');
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });
});

describe('newsSetSourcePriority / priorityForMe', () => {
  it('moves a source between favorite, less and normal; a source is in at most one list', async () => {
    const src = await mkSource();
    expect((await setPrio(src, 'favorite')).newsSetSourcePriority.priorityForMe).toBe('favorite');
    expect((await ok(PREFS)).newsPrefs).toMatchObject({ favoriteSourceIds: [String(src._id)], lessSourceIds: [] });
    expect((await setPrio(src, 'less')).newsSetSourcePriority.priorityForMe).toBe('less');
    expect((await ok(PREFS)).newsPrefs).toMatchObject({ favoriteSourceIds: [], lessSourceIds: [String(src._id)] });
    expect((await setPrio(src, 'favorite')).newsSetSourcePriority.priorityForMe).toBe('favorite');
    expect((await ok(PREFS)).newsPrefs).toMatchObject({ favoriteSourceIds: [String(src._id)], lessSourceIds: [] });
    await setPrio(src, 'less');
    expect((await setPrio(src, 'normal')).newsSetSourcePriority.priorityForMe).toBe('normal');
    expect((await ok(PREFS)).newsPrefs).toMatchObject({ favoriteSourceIds: [], lessSourceIds: [] });
    const { newsSources } = await ok(`{ newsSources { priorityForMe } }`);
    expect(newsSources).toEqual([{ priorityForMe: 'normal' }]);
  });

  it('refuses an unknown priority, a missing source, and favouring a retired one', async () => {
    const src = await mkSource();
    const gone = await mkSource({ status: 'retired' });
    expect(await code(SET_PRIO, { id: String(src._id), p: 'pinned' })).toBe('BAD_USER_INPUT');
    expect(await code(SET_PRIO, { id: String(new mongoose.Types.ObjectId()), p: 'favorite' })).toBe('NOT_FOUND');
    expect(await code(SET_PRIO, { id: String(gone._id), p: 'favorite' })).toBe('BAD_USER_INPUT');
    expect((await setPrio(gone, 'normal')).newsSetSourcePriority.priorityForMe).toBe('normal');
  });
});

describe('sectionQuotas', () => {
  const DEFAULTS = { local: 8, state: 5, national: 5, world: 3, tech: 4 };

  it('defaults, overrides per section, null resets one, out of range is refused', async () => {
    expect((await ok(PREFS)).newsPrefs.sectionQuotas).toEqual(DEFAULTS);
    await ok(SET_PREFS, { input: { sectionQuotas: { local: 12, tech: 0 } } });
    expect((await ok(PREFS)).newsPrefs.sectionQuotas).toEqual({ ...DEFAULTS, local: 12, tech: 0 });
    await ok(SET_PREFS, { input: { sectionQuotas: { local: null } } });
    expect((await ok(PREFS)).newsPrefs.sectionQuotas).toEqual({ ...DEFAULTS, tech: 0 });
    expect(await code(SET_PREFS, { input: { sectionQuotas: { state: 21 } } })).toBe('BAD_USER_INPUT');
    expect(await code(SET_PREFS, { input: { sectionQuotas: { state: -1 } } })).toBe('BAD_USER_INPUT');
  });

  it('caps Today', async () => {
    const hill = await mkSource({ name: 'The Hill', sections: ['national'] });
    for (let i = 0; i < 4; i += 1) await mkArticle(hill, { title: `h${i}`, age: (i + 1) * H });
    await ok(SET_PREFS, { input: { sectionQuotas: { national: 2 } } });
    const fp = await front();
    expect(fp.sections).toEqual([expect.objectContaining({ key: 'national', moreCount: 2 })]);
    expect(fp.sections[0].items).toHaveLength(2);
  });
});

describe('newsFrontPage', () => {
  it('files each story under the reader’s section, in briefing order, with why chips', async () => {
    await seedPaper();
    await setHome(['arkadelphia', 'clark', 'hot-springs', 'little-rock', 'garland']);
    const fp = await front();
    expect(fp.sections.map((s) => [s.key, s.title])).toEqual([
      ['local', 'Local'], ['state', 'State'], ['national', 'National'], ['tech', 'Tech'],
    ]);
    const by = shape(fp);
    expect(by.local.sort()).toEqual(['AP Little Rock', 'Arkadelphian weekly', 'D-G about Arkadelphia']);
    expect(by.state.sort()).toEqual(['D-G statehouse', 'Hill on Arkansas', 'Texarkana council']);
    expect(by.national).toEqual(['Hill untagged']);
    expect(by.tech).toEqual(['Verge gadget']);
    const items = fp.sections.flatMap((s) => s.items.map((i) => ({ ...i, key: s.key })));
    for (const i of items) expect(i.section).toBe(i.key);
    const why = Object.fromEntries(items.map((i) => [i.title, i.why]));
    expect(why['D-G about Arkadelphia']).toEqual(['Arkadelphia']);
    expect(why['AP Little Rock']).toEqual(['Little Rock']);
    expect(why['Hill on Arkansas']).toEqual(['Arkansas']);
    expect(why['Verge gadget']).toEqual([]);
  });

  it('a reader with no ring gets the source labels for Local (and an empty paper is just empty)', async () => {
    expect((await front()).sections).toEqual([]);
    await seedPaper();
    const by = shape(await front());
    expect(by.local.sort()).toEqual(['Arkadelphian weekly', 'Texarkana council']);
  });

  it('a favourite leads its section, with the chip', async () => {
    const s = await seedPaper();
    await setHome(['arkadelphia']);
    await mkArticle(s.texarkana, { title: 'Texarkana old', age: 6 * D });
    await setPrio(s.texarkana, 'favorite');
    const state = (await front()).sections.find((x) => x.key === 'state');
    expect(state.items.slice(0, 2).map((i) => i.title).sort()).toEqual(['Texarkana council', 'Texarkana old']);
    expect(state.items[0].why).toEqual(['Arkansas', '★ Favorite']);
  });

  it('reader A’s prefs never change reader B’s paper', async () => {
    const s = await seedPaper();
    const before = shape(await front(READER_B));
    await setHome(['arkadelphia', 'little-rock']);
    await setPrio(s.hill, 'less');
    await ok(SET_PREFS, { input: { freeToReadOnly: true, sectionQuotas: { tech: 0 } } });
    expect(shape(await front(READER_A))).not.toEqual(before);
    expect(shape(await front(READER_B))).toEqual(before);
  });

  it('keeps the visibility rules: retired, switched off, Free to read, hidden publishers', async () => {
    const s = await seedPaper();
    const walled = await mkSource({ name: 'Walled', sections: ['national'], access: { paywall: 'hard', content: 'excerpt' } });
    const gone = await mkSource({ name: 'Gone', sections: ['national'], status: 'retired' });
    await mkArticle(walled, { title: 'Walled story' });
    await mkArticle(gone, { title: 'Gone story' });
    await mkArticle(s.gnews, { title: 'Hidden pub', publisherDomain: 'spam.example.com' });
    const titles = async () => Object.values(shape(await front())).flat();

    expect(await titles()).toEqual(expect.arrayContaining(['Walled story', 'Hidden pub']));
    expect(await titles()).not.toContain('Gone story');

    await ok(SET_PREFS, { input: { freeToReadOnly: true } });
    expect(await titles()).not.toContain('Walled story');
    await ok(`mutation($id: ID!) { newsSetSourceSubscribed(id: $id, on: true) { id } }`, { id: String(walled._id) });
    expect(await titles()).toContain('Walled story');

    await ok(`mutation { newsSetPublisherPref(domain: "example.com", muted: true) { mutedDomains } }`);
    expect(await titles()).not.toContain('Hidden pub');

    await ok(`mutation($id: ID!) { newsSetSourceOn(id: $id, on: false) { id } }`, { id: String(s.verge._id) });
    expect(await titles()).not.toContain('Verge gadget');
  });

  it('drops expired alerts and anything past the window', async () => {
    const s = await seedPaper();
    const nws = await mkSource({ name: 'NWS', kind: 'official', places: [P.clark._id] });
    await mkArticle(nws, { title: 'Expired alert', expiresAt: ago(H) });
    await mkArticle(nws, { title: 'Live alert', expiresAt: new Date(Date.now() + H), age: 20 * H });
    await mkArticle(s.hill, { title: 'Hill old', age: 8 * D });
    await setHome(['arkadelphia', 'clark']);
    const fp = await front();
    const all = Object.values(shape(fp)).flat();
    expect(all).not.toContain('Expired alert');
    expect(all).not.toContain('Hill old');
    const local = fp.sections.find((x) => x.key === 'local');
    expect(local.items[0]).toMatchObject({ title: 'Live alert', why: ['Clark County', 'Official'] });
  });

  it('costs a handful of reads, however many stories there are', async () => {
    const s = await seedPaper();
    for (let i = 0; i < 30; i += 1) await mkArticle(s.dg, { title: `bulk ${i}`, own: i % 2 ? ['gurdon'] : [], age: i * H });
    await setHome(['arkadelphia', 'clark']);
    const ops = [];
    mongoose.set('debug', (coll, method) => ops.push(`${coll}.${method}`));
    try {
      await front();
    } finally {
      mongoose.set('debug', false);
    }
    // prefs, sources, places, the 7-day counts, the candidates, the chosen stories.
    expect(ops.filter((o) => o.startsWith('articles.'))).toHaveLength(3);
    expect(ops.length).toBeGreaterThanOrEqual(5); // the hook is live (not a vacuous pass)
    expect(ops.length).toBeLessThanOrEqual(6);
  });
});

describe('newsArticles(section) uses the same per-story section', () => {
  it('the five section pages partition Everything, and agree with Today', async () => {
    await seedPaper();
    await setHome(['arkadelphia', 'clark', 'little-rock']);
    const page = async (section) => (await ok(ARTICLES, { section })).newsArticles.items;
    const all = await page(undefined);
    const pages = {};
    for (const key of ['local', 'state', 'national', 'world', 'tech']) pages[key] = await page(key);
    const ids = Object.values(pages).flat().map((i) => i.id).sort();
    expect(ids).toEqual(all.map((i) => i.id).sort()); // every story, exactly once
    for (const [key, items] of Object.entries(pages)) for (const i of items) expect(i.section).toBe(key);
    for (const s of (await front()).sections) {
      const onPage = new Set(pages[s.key].map((i) => i.id));
      for (const i of s.items) expect(onPage.has(i.id)).toBe(true);
    }
    expect(pages.local.map((i) => i.title).sort()).toEqual(['AP Little Rock', 'Arkadelphian weekly', 'D-G about Arkadelphia']);
    expect(pages.national.map((i) => i.title)).toEqual(['Hill untagged']);
  });

  it('keeps paging and Free to read inside a section', async () => {
    const dg = await mkSource({ name: 'D-G', sections: ['state'], places: [P.arkansas._id], access: { paywall: 'hard', content: 'excerpt' } });
    const free = await mkSource({ name: 'Free', sections: ['state'], places: [P.arkansas._id] });
    for (let i = 0; i < 3; i += 1) await mkArticle(free, { title: `free${i}`, own: ['arkadelphia'], age: (i + 1) * H });
    await mkArticle(dg, { title: 'walled local', own: ['gurdon'], age: H / 2 });
    await mkArticle(dg, { title: 'walled state' });
    await setHome(['arkadelphia', 'clark']);
    const first = (await ok(ARTICLES, { section: 'local', limit: 2 })).newsArticles;
    expect(first.items.map((i) => i.title)).toEqual(['walled local', 'free0']);
    const next = (await ok(ARTICLES, { section: 'local', limit: 2, before: first.nextBefore })).newsArticles;
    expect(next.items.map((i) => i.title)).toEqual(['free1', 'free2']);
    await ok(SET_PREFS, { input: { freeToReadOnly: true } });
    const walled = (await ok(ARTICLES, { section: 'local' })).newsArticles;
    expect(walled.items.map((i) => i.title)).toEqual(['free0', 'free1', 'free2']);
    expect(walled.hiddenPaywalled).toBe(1); // the state one is not on this page
  });
});
