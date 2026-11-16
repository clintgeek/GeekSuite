/**
 * newsgeekCursor.test.js — newsArticles' compound paging cursor
 * (SUITE_REVIEW_2026-11 NewsGeek finding 3; graphql/newsgeek/pageCursor.js).
 *
 * Stories that share a publishedAt second at a page boundary must all be
 * reached by paging; the old date-only `before` keeps working for old clients.
 */
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';

const { typeDefs, resolvers } = await import('../graphql/index.js');
const { NewsSource } = await import('../graphql/newsgeek/models/source.js');
const { NewsPlace } = await import('../graphql/newsgeek/models/place.js');
const { NewsArticle } = await import('../graphql/newsgeek/models/article.js');
const { User } = await import('../models/user.js');
const { decodeCursor, encodeCursor, isAtOrBeforeCursor } = await import('../graphql/newsgeek/pageCursor.js');

const READER = new mongoose.Types.ObjectId();
const H = 3600 * 1000;

let server;
const run = async (query, variables = {}) => {
  const res = await server.executeOperation({ query, variables }, { contextValue: { user: { id: String(READER) } } });
  const r = res.body.singleResult;
  return { data: r.data ?? null, errors: r.errors ?? null };
};
const ok = async (...a) => {
  const { data, errors } = await run(...a);
  if (errors) throw new Error(JSON.stringify(errors));
  return data;
};

async function clean() {
  await Promise.all([NewsSource.deleteMany({}), NewsPlace.deleteMany({}), NewsArticle.deleteMany({})]);
}

beforeAll(async () => {
  await NewsSource.db.asPromise();
  await Promise.all([NewsSource.init(), NewsPlace.init(), NewsArticle.init()]);
  await User.collection.deleteMany({ _id: READER });
  await User.collection.insertOne({ _id: READER, role: 'user' });
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 60000);
beforeEach(clean);
afterAll(async () => {
  await clean();
  await User.collection.deleteMany({ _id: READER });
  await server.stop();
  await NewsSource.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const PAGE = `query($before: Date, $cursor: String, $limit: Int) {
  newsArticles(before: $before, cursor: $cursor, limit: $limit) { nextBefore nextCursor items { id title } }
}`;

let n = 0;
async function seed() {
  const src = await NewsSource.create({ slug: `s-${new mongoose.Types.ObjectId()}`, name: 'Src', kind: 'official', sections: ['local'], status: 'active', feeds: [] });
  // One batch publisher: five stories in the same second, then two older ones.
  const t = new Date(Math.floor((Date.now() - H) / 1000) * 1000);
  const mk = (title, publishedAt) => {
    n += 1;
    return NewsArticle.create({
      sourceId: src._id, feedUrl: 'https://x.test/feed', guid: `g${n}-${Math.random()}`,
      url: `https://x.test/${n}`, canonicalUrl: `https://x.test/${n}`, title, titleKey: `distinct ${n} ${title}`,
      publisher: 'Pub', publishedAt, fetchedAt: new Date(),
    });
  };
  for (const title of ['B1', 'B2', 'B3', 'B4', 'B5']) await mk(title, t);
  await mk('Old1', new Date(t.getTime() - H));
  await mk('Old2', new Date(t.getTime() - 2 * H));
}

async function walk(vars, next) {
  const seen = [];
  let v = { limit: 2 };
  for (let guard = 0; guard < 10; guard += 1) {
    const page = (await ok(PAGE, { ...v, ...vars })).newsArticles;
    seen.push(...page.items.map((a) => a.title));
    const k = next(page);
    if (!k) break;
    v = { limit: 2, ...k };
  }
  return seen;
}

describe('newsArticles compound cursor', () => {
  it('reaches every story that shares the boundary second, each once', async () => {
    await seed();
    const titles = await walk({}, (p) => (p.nextCursor ? { cursor: p.nextCursor } : null));
    expect(titles).toHaveLength(7);
    expect(new Set(titles).size).toBe(7);
    expect(titles.slice(5)).toEqual(['Old1', 'Old2']);
  });

  it('old clients: before/nextBefore still page (date-only, so a shared second is skipped, as before)', async () => {
    await seed();
    const titles = await walk({}, (p) => (p.nextBefore ? { before: p.nextBefore } : null));
    expect(titles.slice(0, 2)).toHaveLength(2);
    expect(titles).toContain('Old1');
    expect(titles).toContain('Old2');
  });

  it('cursor wins over before', async () => {
    await seed();
    const p1 = (await ok(PAGE, { limit: 2 })).newsArticles;
    const p2 = (await ok(PAGE, { limit: 2, cursor: p1.nextCursor, before: new Date(0).toISOString() })).newsArticles;
    expect(p2.items).toHaveLength(2);
  });

  it('a last page has no nextCursor; a forged cursor is BAD_USER_INPUT', async () => {
    await seed();
    expect((await ok(PAGE, { limit: 50 })).newsArticles.nextCursor).toBeNull();
    for (const cursor of ['', 'nope', '123', '1.zzzzzzzzzzzzzzzzzzzzzzzz', '1.abc']) {
      const { errors } = await run(PAGE, { cursor });
      expect(errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    }
  });
});

describe('pageCursor', () => {
  it('round-trips and orders like the { publishedAt: -1, _id: -1 } sort', () => {
    const id = new mongoose.Types.ObjectId();
    const row = { publishedAt: new Date(1700000000000), _id: id };
    const c = decodeCursor(encodeCursor(row));
    expect(c.t.getTime()).toBe(1700000000000);
    expect(String(c.id)).toBe(String(id));
    expect(isAtOrBeforeCursor(row, c)).toBe(true);
    expect(isAtOrBeforeCursor({ publishedAt: new Date(1700000000001), _id: id }, c)).toBe(true);
    expect(isAtOrBeforeCursor({ publishedAt: new Date(1699999999999), _id: id }, c)).toBe(false);
    const lower = new mongoose.Types.ObjectId('000000000000000000000001');
    expect(isAtOrBeforeCursor({ publishedAt: row.publishedAt, _id: lower }, c)).toBe(false);
    expect(encodeCursor({})).toBeNull();
  });
});
