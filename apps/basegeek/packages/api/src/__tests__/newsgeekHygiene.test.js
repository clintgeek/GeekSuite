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

  // The compound cursor (pageCursor.js, 2026-11-16) keeps the same rule.
  it('paging by cursor: a copy collapsed into a story on page 1 never reappears on page 2; nothing is skipped', async () => {
    const BY_CURSOR = `query($cursor: String, $limit: Int) { newsArticles(cursor: $cursor, limit: $limit) { nextCursor items { ${ITEM} } } }`;
    const katv = await mkSource({ name: 'KATV' });
    const kark = await mkSource({ name: 'KARK' });
    const T = (k) => `Unique state story number ${k} for cursor paging`;
    await mkArticle(katv, AP, { age: 1 * H });
    await mkArticle(katv, T(1), { age: 2 * H });
    await mkArticle(katv, T(2), { age: 3 * H });
    await mkArticle(kark, AP, { age: 4 * H });
    await mkArticle(kark, T(3), { age: 5 * H });
    await mkArticle(kark, T(4), { age: 6 * H });
    const p1 = (await ok(BY_CURSOR, { limit: 2 })).newsArticles;
    expect(p1.items.map((i) => i.title)).toEqual([AP, T(1)]);
    const p2 = (await ok(BY_CURSOR, { limit: 2, cursor: p1.nextCursor })).newsArticles;
    expect(p2.items.map((i) => i.title)).toEqual([T(2), T(3)]);
    const p3 = (await ok(BY_CURSOR, { limit: 2, cursor: p2.nextCursor })).newsArticles;
    expect(p3.items.map((i) => i.title)).toEqual([T(4)]);
    expect(p3.nextCursor).toBeNull();
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

describe('newsArticles groups by story (2026-11-27)', () => {
  const BY_CURSOR = `query($cursor: String, $limit: Int, $sourceId: ID, $section: String) { newsArticles(cursor: $cursor, limit: $limit, sourceId: $sourceId, section: $section) { nextCursor items { ${ITEM} } } }`;
  const titles = (page) => page.items.map((i) => i.title);

  it('four outlets on one event are ONE row on Everything, with the others under alsoIn', async () => {
    const story = new mongoose.Types.ObjectId();
    const srcs = await Promise.all(['KATV', 'KARK', 'THV11', 'FOX16'].map((name) => mkSource({ name })));
    const heads = ['Man arrested on arson charges in Neely Road fire', 'Arson arrest made in Neely Road house fire', 'Police arrest man in Neely Road arson', 'Neely Road fire: man faces arson charges'];
    for (let i = 0; i < 4; i += 1) await mkArticle(srcs[i], heads[i], { age: (i + 1) * H, storyId: story });
    await mkArticle(srcs[0], 'Legislature returns for a fiscal session in April', { age: 6 * H });
    const page = (await ok(BY_CURSOR, {})).newsArticles;
    expect(page.items).toHaveLength(2);
    expect(heads).toContain(page.items[0].title);
    expect(page.items[0].alsoIn).toHaveLength(3);
    expect(titles(page)[1]).toBe('Legislature returns for a fiscal session in April');
  });

  it('paging: a story shown on page 1 never comes back on a later page as its older tellings, and nothing is skipped', async () => {
    const story = new mongoose.Types.ObjectId();
    const katv = await mkSource({ name: 'KATV' });
    const kark = await mkSource({ name: 'KARK' });
    const T = (k) => `Unique state story number ${k} for story paging`;
    await mkArticle(katv, 'Army detonates the stockpile in Iowa', { age: 1 * H, storyId: story });
    await mkArticle(katv, T(1), { age: 2 * H });
    await mkArticle(katv, T(2), { age: 3 * H });
    await mkArticle(kark, 'Army plans to detonate stockpile in Iowa', { age: 100 * H, storyId: story }); // days earlier
    await mkArticle(kark, T(3), { age: 101 * H });
    const p1 = (await ok(BY_CURSOR, { limit: 2 })).newsArticles;
    expect(p1.items).toHaveLength(2);
    expect(p1.items[0].alsoIn.map((a) => a.publisher)).toEqual(['KARK']);
    expect(titles(p1)[1]).toBe(T(1));
    const p2 = (await ok(BY_CURSOR, { limit: 2, cursor: p1.nextCursor })).newsArticles;
    expect(titles(p2)).toEqual([T(2), T(3)]);
    // A full page always offers a next one; it is empty, and the story's old telling is not on it.
    const p3 = (await ok(BY_CURSOR, { limit: 2, cursor: p2.nextCursor })).newsArticles;
    expect(p3.items).toEqual([]);
    expect(p3.nextCursor).toBeNull();
  });

  it('one source’s own page lists every article it published: a story’s tellings stay separate there', async () => {
    const story = new mongoose.Types.ObjectId();
    const hill = await mkSource({ name: 'The Hill', sections: ['national'], places: [P.us._id] });
    const pbs = await mkSource({ name: 'PBS NewsHour', sections: ['national'], places: [P.us._id] });
    await mkArticle(hill, 'Nvidia reinstates its chief executive', { age: 3 * H, storyId: story });
    await mkArticle(hill, 'Five takeaways from the Nvidia reversal', { age: 2 * H, storyId: story });
    await mkArticle(pbs, 'Nvidia board brings back its CEO', { age: H, storyId: story });
    expect((await ok(BY_CURSOR, {})).newsArticles.items).toHaveLength(1);
    const own = (await ok(BY_CURSOR, { sourceId: String(hill._id) })).newsArticles;
    expect(titles(own)).toEqual(['Five takeaways from the Nvidia reversal', 'Nvidia reinstates its chief executive']);
  });

  it('section pages: the story is on its own section’s page once, and on no other', async () => {
    const story = new mongoose.Types.ObjectId();
    const katv = await mkSource({ name: 'KATV' });
    const hill = await mkSource({ name: 'The Hill', sections: ['national'], places: [P.us._id] });
    const pbs = await mkSource({ name: 'PBS NewsHour', sections: ['national'], places: [P.us._id] });
    await mkArticle(katv, 'What the tariff ruling means for shoppers', { age: 3 * H, storyId: story });
    await mkArticle(hill, 'Court strikes down the tariff order', { age: 2 * H, storyId: story });
    await mkArticle(pbs, 'Justices void the tariff order', { age: H, storyId: story });
    const national = (await ok(BY_CURSOR, { section: 'national' })).newsArticles;
    expect(national.items).toHaveLength(1);
    expect(national.items[0].section).toBe('national');
    expect(national.items[0].alsoIn).toHaveLength(2);
    expect((await ok(BY_CURSOR, { section: 'state' })).newsArticles.items).toEqual([]);
  });

  it('section pages: two out-of-town papers on one story are one row on Around', async () => {
    await ok(`mutation($ids: [ID!]!) { newsSetHomePlaces(placeIds: $ids) { freeToReadOnly } }`, { ids: [String(P.arkadelphia._id), String(P.clark._id)] });
    const story = new mongoose.Types.ObjectId();
    const a = await mkSource({ name: 'Pine Bluff Commercial', sections: ['local'], places: [] });
    const b = await mkSource({ name: 'Stuttgart Daily Leader', sections: ['local'], places: [] });
    await mkArticle(a, 'Youth deer harvest shows a steady foundation', { age: 2 * H, storyId: story });
    await mkArticle(b, 'AGFC reports on the youth deer harvest', { age: H, storyId: story });
    const around = (await ok(BY_CURSOR, { section: 'around' })).newsArticles;
    expect(around.items).toHaveLength(1);
    expect(around.items[0].alsoIn).toHaveLength(1);
  });
});

describe('newsStory: one story, every telling the caller can see (2026-11-27)', () => {
  const STORY = `query($id: ID!) { newsStory(id: $id) { id title section sourceCount firstAt lastAt articles { ${ITEM} storyId } } }`;
  const T = 'Court strikes down the tariff order in a 6-3 ruling';

  async function seedStory() {
    const story = new mongoose.Types.ObjectId();
    const s = {
      hill: await mkSource({ name: 'The Hill', sections: ['national'], places: [P.us._id] }),
      pbs: await mkSource({ name: 'PBS NewsHour', sections: ['national'], places: [P.us._id] }),
      katv: await mkSource({ name: 'KATV' }),
      gnAp: await mkSource({ name: 'Google News: AP', kind: 'aggregator', sections: ['national', 'world'], places: [P.us._id] }),
    };
    await mkArticle(s.gnAp, T, { age: 6 * H, storyId: story, publisher: 'AP News', publisherDomain: 'apnews.com' });
    await mkArticle(s.katv, T, { age: 5 * H, storyId: story });                       // a copy of AP's
    await mkArticle(s.hill, 'Tariff order falls at the Supreme Court', { age: 4 * H, storyId: story });
    await mkArticle(s.hill, 'Five takeaways from the tariff ruling', { age: 2 * H, storyId: story });
    await mkArticle(s.pbs, 'Justices void the tariff order', { age: H, storyId: story });
    await mkArticle(s.pbs, 'Something else entirely happened today', { age: H });
    return { story, s };
  }

  it('returns the story’s headline, section and outlets, and one item per telling, newest first', async () => {
    const { story } = await seedStory();
    const st = (await ok(STORY, { id: String(story) })).newsStory;
    expect(st.id).toBe(String(story));
    expect(st.section).toBe('national');
    expect(st.sourceCount).toBe(3);                    // AP (KATV's copy adds none), The Hill, PBS
    expect(st.articles.map((a) => a.title)).toEqual([
      'Justices void the tariff order', 'Five takeaways from the tariff ruling', 'Tariff order falls at the Supreme Court', T,
    ]);
    expect(st.articles[3].alsoIn).toHaveLength(1);     // the copy, folded
    expect(st.articles.every((a) => a.storyId === String(story))).toBe(true);
    expect(st.articles.map((a) => a.title)).toContain(st.title);
    // Seeded 6 h and 1 h ago, a few milliseconds apart.
    expect(Math.abs(new Date(st.lastAt).getTime() - new Date(st.firstAt).getTime() - 5 * H)).toBeLessThan(1000);
  });

  it('articles carry their storyId on Today and the lists (null with no story)', async () => {
    const { story } = await seedStory();
    const LIST = `{ newsArticles { items { title storyId } } }`;
    const items = (await ok(LIST)).newsArticles.items;
    expect(items.find((i) => i.title === 'Something else entirely happened today').storyId).toBeNull();
    expect(items.filter((i) => i.storyId === String(story))).toHaveLength(1);
  });

  it('keeps the reader’s rules: a source switched off is not in it; nothing visible is null; so is an unknown or malformed id', async () => {
    const { story, s } = await seedStory();
    await ok(`mutation($id: ID!) { newsSetSourceOn(id: $id, on: false) { id } }`, { id: String(s.hill._id) });
    const st = (await ok(STORY, { id: String(story) })).newsStory;
    expect(st.sourceCount).toBe(2);
    expect(st.articles.map((a) => a.sourceName)).not.toContain('The Hill');
    for (const src of [s.pbs, s.katv, s.gnAp]) await ok(`mutation($id: ID!) { newsSetSourceOn(id: $id, on: false) { id } }`, { id: String(src._id) });
    expect((await ok(STORY, { id: String(story) })).newsStory).toBeNull();
    expect((await ok(STORY, { id: String(new mongoose.Types.ObjectId()) })).newsStory).toBeNull();
    expect((await run(STORY, { id: 'nope' })).errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    expect((await run(STORY, { id: String(story) }, null)).errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
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
