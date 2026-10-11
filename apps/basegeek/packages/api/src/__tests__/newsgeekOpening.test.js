/**
 * newsgeekOpening.test.js — Opening (DOCS/NEWSGEEK_PLAN.md "Opening", Chef
 * 2026-10-11): NewsPrefs.openInNewTab, NewsReaderLink.id, NewsPrefs.openers
 * and newsSetPublisherOpener. Per reader, the caller's own row only. Real
 * operations against the real schema.
 */
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';
import prefsModule from '@geeksuite/schemas/newsgeek/prefs';

const { typeDefs, resolvers } = await import('../graphql/index.js');
const { NewsPrefs } = await import('../graphql/newsgeek/models/prefs.js');
const { NewsSource } = await import('../graphql/newsgeek/models/source.js');
const { readerLinkId, OPENERS_MAX } = prefsModule;

const READER_A = String(new mongoose.Types.ObjectId());
const READER_B = String(new mongoose.Types.ObjectId());

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

beforeAll(async () => {
  await NewsPrefs.db.asPromise();
  await Promise.all([NewsPrefs.init(), NewsSource.init()]);
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 60000);
beforeEach(() => Promise.all([NewsPrefs.deleteMany({}), NewsSource.deleteMany({})]));
afterAll(async () => {
  await Promise.all([NewsPrefs.deleteMany({}), NewsSource.deleteMany({})]);
  await server.stop();
  await NewsPrefs.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const PREFS_FIELDS = 'openInNewTab readerLinks { id label template } openers { sourceId domain linkId }';
const PREFS = `{ newsPrefs { ${PREFS_FIELDS} } }`;
const SET = `mutation($input: NewsPrefsInput!) { newsSetPrefs(input: $input) { ${PREFS_FIELDS} } }`;
const OPENER = `mutation($sourceId: ID, $domain: String, $linkId: ID) {
  newsSetPublisherOpener(sourceId: $sourceId, domain: $domain, linkId: $linkId) { ${PREFS_FIELDS} }
}`;
const L1 = { label: 'Reader one', template: 'https://example.com/read?u={url}' };
const L2 = { label: 'Reader two', template: 'https://example.org/go?to={url}&t={title}' };
const prefs = async (user = READER_A) => (await ok(PREFS, {}, user)).newsPrefs;
const setLinks = (readerLinks, user = READER_A) => ok(SET, { input: { readerLinks } }, user);
const opener = (vars, user = READER_A) => ok(OPENER, vars, user);
const mkSource = (over = {}) => NewsSource.create({
  slug: `s-${new mongoose.Types.ObjectId()}`, name: 'The Arkadelphian', kind: 'journalism', sections: ['local'], status: 'active', feeds: [], ...over,
});

describe('openInNewTab', () => {
  it('defaults to true (the old behaviour), with no row created on read', async () => {
    expect(await prefs()).toEqual({ openInNewTab: true, readerLinks: [], openers: [] });
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });

  it('round-trips, and leaving it out leaves it unchanged', async () => {
    expect((await ok(SET, { input: { openInNewTab: false } })).newsSetPrefs.openInNewTab).toBe(false);
    expect((await prefs()).openInNewTab).toBe(false);
    await ok(SET, { input: { freeToReadOnly: true } });
    expect((await prefs()).openInNewTab).toBe(false);
    await ok(SET, { input: { openInNewTab: true } });
    expect((await prefs()).openInNewTab).toBe(true);
  });

  it('is per reader', async () => {
    await ok(SET, { input: { openInNewTab: false } });
    expect((await prefs(READER_B)).openInNewTab).toBe(true);
  });
});

describe('NewsReaderLink.id', () => {
  it('is a short hash of the template, stable across reads and label renames', async () => {
    await setLinks([L1, L2]);
    const [a, b] = (await prefs()).readerLinks;
    expect(a.id).toBe(readerLinkId(L1.template));
    expect(a.id).toMatch(/^[0-9a-f]{12}$/);
    expect(a.id).not.toBe(b.id);
    expect((await prefs()).readerLinks[0].id).toBe(a.id);
    await setLinks([{ ...L1, label: 'Renamed' }, L2]);
    expect((await prefs()).readerLinks[0].id).toBe(a.id);
  });

  it('changes when the template is edited', async () => {
    await setLinks([L1]);
    const before = (await prefs()).readerLinks[0].id;
    await setLinks([{ ...L1, template: 'https://example.com/read?url={url}' }]);
    expect((await prefs()).readerLinks[0].id).not.toBe(before);
  });
});

describe('newsSetPublisherOpener', () => {
  it('sets an opener for a direct source and for a publisher domain (normalised), and clears each', async () => {
    await setLinks([L1, L2]);
    const src = await mkSource();
    const id1 = readerLinkId(L1.template);
    const id2 = readerLinkId(L2.template);
    await opener({ sourceId: String(src._id), linkId: id1 });
    const out = (await opener({ domain: 'WWW.Reuters.com', linkId: id2 })).newsSetPublisherOpener;
    expect(out.openers).toEqual([
      { sourceId: String(src._id), domain: null, linkId: id1 },
      { sourceId: null, domain: 'reuters.com', linkId: id2 },
    ]);
    expect((await prefs()).openers).toEqual(out.openers);

    // Setting again replaces (one entry per publisher).
    await opener({ sourceId: String(src._id), linkId: id2 });
    expect((await prefs()).openers).toEqual([
      { sourceId: null, domain: 'reuters.com', linkId: id2 },
      { sourceId: String(src._id), domain: null, linkId: id2 },
    ]);

    // null / omitted linkId = back to Original: the entry goes.
    await opener({ domain: 'reuters.com', linkId: null });
    await opener({ sourceId: String(src._id) });
    expect((await prefs()).openers).toEqual([]);
    expect((await NewsPrefs.findOne({ userId: READER_A }).lean()).openers).toEqual([]);
  });

  it('clearing when nothing is set is a no-op that creates no row', async () => {
    expect((await opener({ domain: 'reuters.com' })).newsSetPublisherOpener.openers).toEqual([]);
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });

  it('needs exactly one of sourceId and domain', async () => {
    await setLinks([L1]);
    const src = await mkSource();
    const linkId = readerLinkId(L1.template);
    expect(await code(OPENER, { linkId })).toBe('BAD_USER_INPUT');
    expect(await code(OPENER, { sourceId: String(src._id), domain: 'reuters.com', linkId })).toBe('BAD_USER_INPUT');
    expect((await prefs()).openers).toEqual([]);
  });

  it('refuses a bad domain, a malformed id, an unknown source and a link that isn’t the reader’s', async () => {
    await setLinks([L1]);
    const linkId = readerLinkId(L1.template);
    expect(await code(OPENER, { domain: 'https://reuters.com/x', linkId })).toBe('BAD_USER_INPUT');
    expect(await code(OPENER, { sourceId: 'nope', linkId })).toBe('BAD_USER_INPUT');
    expect(await code(OPENER, { sourceId: String(new mongoose.Types.ObjectId()), linkId })).toBe('NOT_FOUND');
    expect(await code(OPENER, { domain: 'reuters.com', linkId: 'deadbeef0000' })).toBe('BAD_USER_INPUT');
    // Reader B's link isn't reader A's.
    await setLinks([L2], READER_B);
    expect(await code(OPENER, { domain: 'reuters.com', linkId: readerLinkId(L2.template) })).toBe('BAD_USER_INPUT');
    expect((await prefs()).openers).toEqual([]);
  });

  it('refuses an anonymous caller', async () => {
    expect(await code(OPENER, { domain: 'reuters.com' }, null)).toBe('UNAUTHENTICATED');
  });

  it(`holds at most ${OPENERS_MAX} publishers; replacing one at the limit still works`, async () => {
    await setLinks([L1, L2]);
    const id1 = readerLinkId(L1.template);
    const full = Array.from({ length: OPENERS_MAX }, (_, i) => ({ domain: `pub${i}.example.com`, linkId: id1 }));
    await NewsPrefs.updateOne({ userId: READER_A }, { $set: { openers: full } });
    const over = await run(OPENER, { domain: 'one-more.example.com', linkId: id1 });
    expect(over.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    expect(over.errors[0].message).toMatch(/at most 200/);
    await opener({ domain: 'pub0.example.com', linkId: readerLinkId(L2.template) });
    expect((await prefs()).openers).toHaveLength(OPENERS_MAX);
  });

  it('writes only the caller’s own row', async () => {
    await setLinks([L1]);
    await setLinks([L1], READER_B);
    await opener({ domain: 'reuters.com', linkId: readerLinkId(L1.template) });
    expect((await prefs(READER_B)).openers).toEqual([]);
    expect((await prefs()).openers).toHaveLength(1);
  });

  it('editing a template retires the openers on it (back to Original); renaming keeps them', async () => {
    await setLinks([L1, L2]);
    const id1 = readerLinkId(L1.template);
    const id2 = readerLinkId(L2.template);
    await opener({ domain: 'reuters.com', linkId: id1 });
    await opener({ domain: 'apnews.com', linkId: id2 });

    await setLinks([{ ...L1, label: 'Renamed' }, L2]);
    expect((await prefs()).openers.map((o) => o.domain)).toEqual(['reuters.com', 'apnews.com']);

    const edited = { ...L1, template: 'https://example.com/v2?u={url}' };
    const out = (await setLinks([edited, L2])).newsSetPrefs;
    expect(out.openers).toEqual([{ sourceId: null, domain: 'apnews.com', linkId: id2 }]);
    // Removed from the row, not just hidden: restoring the old template doesn't revive it.
    await setLinks([L1, L2]);
    expect((await prefs()).openers).toEqual([{ sourceId: null, domain: 'apnews.com', linkId: id2 }]);
  });

  it('newsPrefs never returns an opener whose link is gone (a row written before the prune)', async () => {
    await setLinks([L1]);
    await NewsPrefs.updateOne({ userId: READER_A }, { $set: { openers: [{ domain: 'reuters.com', linkId: 'aaaaaaaaaaaa' }, { domain: 'apnews.com', linkId: readerLinkId(L1.template) }] } });
    expect((await prefs()).openers).toEqual([{ sourceId: null, domain: 'apnews.com', linkId: readerLinkId(L1.template) }]);
  });
});
