/**
 * newsgeekReaderLinks.test.js — "Open with…" link templates on NewsPrefs
 * (DOCS/NEWSGEEK_PLAN.md "Open-with links", Chef 2026-10-10). Stored per
 * reader, validated, never fetched. Real operations against the real schema.
 */
import mongoose from 'mongoose';
import { ApolloServer } from '@apollo/server';

const { typeDefs, resolvers } = await import('../graphql/index.js');
const { NewsPrefs } = await import('../graphql/newsgeek/models/prefs.js');

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

beforeAll(async () => {
  await NewsPrefs.db.asPromise();
  await NewsPrefs.init();
  server = new ApolloServer({ typeDefs, resolvers });
  await server.start();
}, 60000);
beforeEach(() => NewsPrefs.deleteMany({}));
afterAll(async () => {
  await NewsPrefs.deleteMany({});
  await server.stop();
  await NewsPrefs.db.close();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

const PREFS = `{ newsPrefs { freeToReadOnly readerLinks { label template } } }`;
const SET = `mutation($input: NewsPrefsInput!) { newsSetPrefs(input: $input) { freeToReadOnly readerLinks { label template } } }`;
const L1 = { label: 'Reader one', template: 'https://example.com/read?u={url}' };
const L2 = { label: 'Reader two', template: 'http://example.org/{title}/go?to={url}' };
const setLinks = (readerLinks, user = READER_A) => run(SET, { input: { readerLinks } }, user);
const prefs = async (user = READER_A) => (await ok(PREFS, {}, user)).newsPrefs;
const badMessage = async (links) => {
  const { errors } = await setLinks(links);
  expect(errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
  return errors[0].message;
};

describe('round trip and semantics', () => {
  it('defaults to an empty list, with no row created on read', async () => {
    expect(await prefs()).toEqual({ freeToReadOnly: false, readerLinks: [] });
    expect(await NewsPrefs.countDocuments({})).toBe(0);
  });

  it('stores and reads back; labels and templates are trimmed', async () => {
    const out = (await ok(SET, { input: { readerLinks: [{ label: '  Reader one ', template: ` ${L1.template} ` }, L2] } })).newsSetPrefs;
    expect(out.readerLinks).toEqual([L1, L2]);
    expect((await prefs()).readerLinks).toEqual([L1, L2]);
  });

  it('a provided list replaces the whole list; [] clears it', async () => {
    await setLinks([L1, L2]);
    await setLinks([L2]);
    expect((await prefs()).readerLinks).toEqual([L2]);
    await setLinks([]);
    expect((await prefs()).readerLinks).toEqual([]);
  });

  it('a partial update keeps the other field, both ways', async () => {
    await setLinks([L1]);
    await ok(SET, { input: { freeToReadOnly: true } });
    expect(await prefs()).toEqual({ freeToReadOnly: true, readerLinks: [L1] });
    await setLinks([L2]);
    expect(await prefs()).toEqual({ freeToReadOnly: true, readerLinks: [L2] });
  });

  it('per reader', async () => {
    await setLinks([L1], READER_A);
    expect((await prefs(READER_B)).readerLinks).toEqual([]);
  });
});

describe('validation (BAD_USER_INPUT, nothing stored)', () => {
  afterEach(async () => expect(await NewsPrefs.countDocuments({})).toBe(0));

  it('at most 5 links', async () => {
    const five = Array.from({ length: 5 }, (_, i) => ({ label: `L${i}`, template: `https://example.com/${i}?u={url}` }));
    expect(await badMessage([...five, L1])).toMatch(/At most 5/);
    expect((await setLinks(five)).errors).toBeNull();
    await NewsPrefs.deleteMany({});
  });

  it('label: 1–40 characters after trimming', async () => {
    expect(await badMessage([{ label: '   ', template: L1.template }])).toMatch(/label is required/);
    expect(await badMessage([{ label: 'x'.repeat(41), template: L1.template }])).toMatch(/at most 40/);
    expect((await setLinks([{ label: ` ${'x'.repeat(40)} `, template: L1.template }])).errors).toBeNull();
    await NewsPrefs.deleteMany({});
  });

  it('template: at most 500 characters', async () => {
    const long = `https://example.com/read?u={url}&pad=${'a'.repeat(500)}`;
    expect(await badMessage([{ label: 'L', template: long }])).toMatch(/at most 500/);
  });

  it('template must contain {url}', async () => {
    expect(await badMessage([{ label: 'L', template: 'https://example.com/read?t={title}' }])).toMatch(/must contain \{url\}/);
  });

  it('only {url} and {title} placeholders', async () => {
    expect(await badMessage([{ label: 'L', template: 'https://example.com/?u={url}&k={key}' }])).toMatch(/only \{url\} and \{title\}.*\{key\}/);
    expect(await badMessage([{ label: 'L', template: 'https://example.com/?u={url}&x={}' }])).toMatch(/only \{url\} and \{title\}/);
    expect(await badMessage([{ label: 'L', template: 'https://example.com/?u={url}&x={url' }])).toMatch(/stray/);
  });

  it('must be an absolute http(s) URL once filled in: no javascript:, data:, relative or other schemes', async () => {
    for (const template of [
      'javascript:alert({url})', 'data:text/html,{url}', 'ftp://example.com/{url}', 'file:///{url}',
      '/read?u={url}', 'example.com/read?u={url}', '{url}', 'mailto:x@example.com?body={url}',
    ]) {
      const msg = await badMessage([{ label: 'L', template }]);
      expect(msg).toMatch(/http/);
    }
  });
});
