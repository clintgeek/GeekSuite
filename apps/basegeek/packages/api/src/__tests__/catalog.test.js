/**
 * catalog.test.js — Stage 1b catalog vectors: meaning search and
 * recommendations over BookGeek books and GameGeek games (MCP_SPEC §6).
 *
 *   1. catalogText — field inclusion, personal data NEVER embedded, HTML
 *      stripped, the 2 000-char cap truncates the description last
 *   2. catalogIndexer — hash skip, re-embed on change, deleted/other-model
 *      vector cleanup, shared backoff, every fetch to EMBEDDINGS_URL
 *   3. tenancy — game vectors never cross a household; foreign likeIds are
 *      ignored; books stay the single shared library
 *   4. like — seeds/candidates, closestTo, no_seeds, seeds-only with the
 *      service down
 *   5. search — keyword-only when down; meaning-only hits survive fusion
 *
 * `fetch` is replaced by the same word→topic fake embedder as
 * notegeekSemantic.test.js; every call is recorded.
 */

import { jest, describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';

const { Book } = await import('../graphql/bookgeek/models/book.js');
const { Game } = await import('../graphql/gamegeek/models/game.js');
const { GamePlayer } = await import('../graphql/gamegeek/models/gamePlayer.js');
const { BookVector } = await import('../graphql/catalog/models/BookVector.js');
const { GameVector } = await import('../graphql/catalog/models/GameVector.js');
const catalogText = await import('../graphql/catalog/catalogText.js');
const catalogSemantic = await import('../graphql/catalog/catalogSemantic.js');
const catalogIndexer = await import('../graphql/catalog/catalogIndexer.js');
const gameLibrary = await import('../graphql/gamegeek/library.js');
const bookLibrary = await import('../graphql/bookgeek/library.js');
const semantic = await import('../graphql/notegeek/semantic.js');
const embeddings = await import('../graphql/notegeek/embeddings.js');
const { resolvers: bookResolvers } = await import('../graphql/bookgeek/resolvers.js');
const { resolvers: gameResolvers } = await import('../graphql/gamegeek/resolvers.js');

const { gameText, bookText, catalogHash, stripHtml, MAX_TEXT_CHARS } = catalogText;
const { searchCatalog, recommendCatalog, shortlistFromSeeds, moodQueryVector, _resetCatalogState } = catalogSemantic;
const { runCatalogScanOnce, nextScanDelay, SCAN_MS } = catalogIndexer;
const { TICK_MS } = await import('../graphql/notegeek/indexer.js');
const { _resetSemanticState, serviceIsDown, markServiceDown } = semantic;
const { embeddingsConfig } = embeddings;

const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => ({ user: { id: String(userId) } });
const TEST_URL = 'http://embeddings.test:11434';

// ── the fake embedder (same idea as notegeekSemantic.test.js) ──────────────
const TOPICS = {
  space: 0, galaxy: 0, starship: 0, alien: 0,
  farm: 1, cozy: 1, crops: 1, harvest: 1,
  sword: 2, dragon: 2, kingdom: 2, fantasy: 2,
  recipe: 3, soup: 3, kitchen: 3,
};
const MXBAI_QUERY = 'Represent this sentence for searching relevant passages: ';
function fakeVector(text, dims = 1024) {
  const v = new Array(dims).fill(0);
  v[dims - 1] = 0.25;
  for (const w of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (w in TOPICS) v[TOPICS[w]] += 1;
  }
  return v;
}
const unprefix = (s) => s.replace(/^search_(document|query): /, '').replace(MXBAI_QUERY, '');
let fetchCalls = [];
let fetchImpl = null;
function okFetch(url, init) {
  const { input, model } = JSON.parse(init.body);
  const dims = model === 'nomic-embed-text' ? 768 : 1024;
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ embeddings: input.map((s) => fakeVector(unprefix(s), dims)) }),
    text: async () => '',
  });
}
const realFetch = globalThis.fetch;

beforeAll(async () => {
  await Promise.all([Book.db.asPromise(), Game.db.asPromise(), BookVector.init(), GameVector.init()]);
}, 60000);

beforeEach(() => {
  process.env.EMBEDDINGS_URL = TEST_URL;
  delete process.env.EMBEDDINGS_MODEL;
  fetchCalls = [];
  fetchImpl = okFetch;
  globalThis.fetch = jest.fn((url, init) => {
    fetchCalls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    return fetchImpl(url, init);
  });
  _resetSemanticState();
  _resetCatalogState();
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  delete process.env.EMBEDDINGS_URL;
  await Promise.all([
    Book.deleteMany({}),
    Game.deleteMany({}),
    GamePlayer.deleteMany({}),
    BookVector.deleteMany({}),
    GameVector.deleteMany({}),
  ]);
});

afterAll(async () => {
  await Promise.all([Book.db.close(), Game.db.close()]);
});

const mkBook = (fields = {}) => Book.create({ title: 'Untitled', owned: true, ...fields });
const mkGame = (fields = {}) =>
  Game.create({
    householdId: 'default', title: 'Untitled', owned: true,
    copies: [{ platform: 'pc' }], ...fields,
  });
const mkPlayer = (fields = {}) =>
  GamePlayer.create({ householdId: 'default', userId: String(ALICE), ...fields });

// ── 1. catalogText ─────────────────────────────────────────────────────────
describe('catalogText', () => {
  test('gameText joins the catalog fields, tags ∪ autoTags, release year', () => {
    const text = gameText({
      title: 'Star Farm', series: { name: 'Star Series' },
      developers: ['Dev A'], publishers: ['Pub B'], releaseDate: new Date('2019-06-01T00:00:00Z'),
      genres: ['Sim'], tags: ['cozy'], autoTags: ['farming', 'cozy'], modes: ['singleplayer'],
      description: 'Grow crops in space.',
    });
    for (const part of ['Title: Star Farm', 'Series: Star Series', 'Developer(s): Dev A', 'Publisher(s): Pub B',
      'Released: 2019', 'Genres: Sim', 'Modes: singleplayer', 'Description: Grow crops in space.']) {
      expect(text).toContain(part);
    }
    expect(text).toContain('Tags: cozy, farming'); // deduped union
  });

  test('bookText joins the catalog fields, libraryTags ∪ myTags', () => {
    const text = bookText({
      title: 'Deep Space Soup', authors: ['Writer'], publisher: 'Pub',
      publishedDate: new Date('2001-01-01T00:00:00Z'), libraryTags: ['SciFi'], myTags: ['Favorites'],
      description: 'A tale.',
    });
    for (const part of ['Title: Deep Space Soup', 'Author(s): Writer', 'Publisher: Pub',
      'Published: 2001', 'Tags: SciFi, Favorites', 'Description: A tale.']) {
      expect(text).toContain(part);
    }
  });

  test('empty fields are omitted entirely, label and all', () => {
    const text = gameText({ title: 'Only Title' });
    expect(text).toBe('Title: Only Title');
  });

  test('personal state is NEVER embedded (D16)', () => {
    const text = gameText({
      title: 'Star Farm', review: 'SECRET REVIEW TEXT', notes: 'SECRET NOTE',
      rating: 5, hoursPlayed: 99, favorite: true,
    });
    expect(text).not.toContain('SECRET REVIEW TEXT');
    expect(text).not.toContain('SECRET NOTE');
    const btext = bookText({ title: 'Soup', review: 'SECRET REVIEW TEXT', notes: 'SECRET NOTE', rating: 5 });
    expect(btext).not.toContain('SECRET REVIEW TEXT');
    expect(btext).not.toContain('SECRET NOTE');
  });

  test('HTML is stripped from descriptions', () => {
    expect(stripHtml('<p>Hello <b>world</b>&amp; friends</p>')).toBe('Hello world & friends');
    const text = bookText({ title: 'T', description: '<p>A <i>space</i> tale.</p>' });
    expect(text).toContain('A space tale.');
    expect(text).not.toMatch(/<[a-z]/i);
  });

  test('the 2000-char cap truncates the description LAST (D17)', () => {
    const text = bookText({ title: 'T', authors: ['A'], description: `BEGIN ${'x'.repeat(5000)} END` });
    expect(text.length).toBeLessThanOrEqual(MAX_TEXT_CHARS);
    expect(text).toContain('T');
    expect(text).toContain('BEGIN');
    expect(text).not.toContain('END'); // the description's tail fell off
  });

  test('catalogHash keys on model + text', () => {
    const a = catalogHash('hello', 'mxbai-embed-large');
    expect(a).not.toBe(catalogHash('hello', 'other-model'));
    expect(a).not.toBe(catalogHash('bye', 'mxbai-embed-large'));
    expect(a).toBe(catalogHash('hello', 'mxbai-embed-large'));
  });
});

// ── 2. the indexer ─────────────────────────────────────────────────────────
describe('catalogIndexer', () => {
  test('a new item is embedded; every fetch targets embeddingsConfig().url', async () => {
    await mkBook({ title: 'space book', description: 'galaxy starship' });
    await mkGame({ title: 'space game', description: 'alien galaxy' });
    const res = await runCatalogScanOnce();
    expect(res.ran).toBe(true);
    expect(await BookVector.countDocuments()).toBe(1);
    expect(await GameVector.countDocuments()).toBe(1);
    expect(fetchCalls.length).toBeGreaterThan(0);
    for (const c of fetchCalls) expect(c.url).toBe(`${embeddingsConfig().url}/api/embed`);
    const stored = await BookVector.findOne().lean();
    expect(stored.model).toBe(embeddingsConfig().model);
    expect(stored.hash).toBe(catalogHash(bookText(await Book.findOne().lean()), stored.model));
    expect(stored.vector.length).toBe(1024);
  });

  test('unchanged content costs no fetch; a changed item is re-embedded', async () => {
    const book = await mkBook({ title: 'space book', description: 'galaxy' });
    await runCatalogScanOnce();
    const calls = fetchCalls.length;
    await runCatalogScanOnce();
    expect(fetchCalls.length).toBe(calls); // hash skip

    await Book.updateOne({ _id: book._id }, { $set: { description: 'sourdough bread kitchen' } });
    await runCatalogScanOnce();
    expect(fetchCalls.length).toBeGreaterThan(calls);
  });

  test('a deleted item and old-model vectors are removed', async () => {
    const book = await mkBook({ title: 'gone soon' });
    const game = await mkGame({ title: 'old model' });
    await runCatalogScanOnce();
    await BookVector.create({
      itemId: game._id, model: 'nomic-embed-text', hash: 'x', vector: [0.1], indexedAt: new Date(),
    });
    await Book.deleteOne({ _id: book._id });
    await runCatalogScanOnce();
    expect(await BookVector.countDocuments()).toBe(0);
    expect(await BookVector.countDocuments({ model: 'nomic-embed-text' })).toBe(0);
    expect(await GameVector.countDocuments()).toBe(1);
  });

  test('service down → shared backoff, no throw, vectors kept', async () => {
    await mkBook({ title: 'space book' });
    fetchImpl = () => Promise.reject(new Error('connection refused'));
    const res = await runCatalogScanOnce();
    expect(res.ran).toBe(true);
    expect(serviceIsDown()).toBe(true);
    expect(await BookVector.countDocuments()).toBe(0);
    // And the shared backoff means a follow-up scan doesn't even try.
    const calls = fetchCalls.length;
    const again = await runCatalogScanOnce();
    expect(again.reason).toBe('backoff');
    expect(fetchCalls.length).toBe(calls);
  });

  test('a cut-short scan reschedules at TICK_MS; a finished one at SCAN_MS', async () => {
    await mkBook({ title: 'space book' });
    const cut = await runCatalogScanOnce({ budgetMs: -1 }); // deadline already passed
    expect(cut.complete).toBe(false);
    expect(nextScanDelay(cut)).toBe(TICK_MS);
    expect(nextScanDelay({ ran: false, reason: 'backoff' })).toBe(TICK_MS);
    expect(nextScanDelay({ ran: false, reason: 'busy' })).toBe(TICK_MS);

    const done = await runCatalogScanOnce({ budgetMs: 60000 });
    expect(done.complete).toBe(true);
    expect(nextScanDelay(done)).toBe(SCAN_MS);
  });
});

// ── helpers for seeded-vector tests ────────────────────────────────────────
async function seedAndScan(books = [], games = []) {
  for (const b of books) await mkBook(b);
  for (const g of games) await mkGame(g);
  await runCatalogScanOnce();
}

// ── 3. tenancy ─────────────────────────────────────────────────────────────
describe('tenancy (R1b-6)', () => {
  test('gameSearch never returns another household\'s games', async () => {
    await seedAndScan([], [
      { title: 'space game mine' },
      { title: 'space game theirs', householdId: 'other-house' },
    ]);
    const res = await gameResolvers.Query.gameSearch(null, { q: 'space' }, ctx(ALICE));
    const titles = res.items.map((i) => i.game.title);
    expect(titles).toContain('space game mine');
    expect(titles).not.toContain('space game theirs');
  });

  test('gamesLike ignores likeIds from another household', async () => {
    const foreign = await mkGame({ title: 'foreign sword game', householdId: 'other-house', description: 'sword dragon' });
    await mkGame({ title: 'a same-house game' }); // so ALICE's scope IS indexed
    await runCatalogScanOnce();
    // The foreign game IS a valid candidate shape for its own household —
    // for ALICE it must be ignored as a seed.
    const res = await gameResolvers.Query.gamesLike(null, { likeIds: [String(foreign._id)] }, ctx(ALICE));
    expect(res.reason).toBe('no_seeds');
    expect(res.items).toEqual([]);
  });

  test('gameLibraryOverview: every owned household game, caller state or nulls', async () => {
    const mine = await mkGame({ title: 'mine' });
    const untouched = await mkGame({ title: 'untouched owned game' });
    await mkGame({ title: 'not owned', owned: false, copies: [] });
    await mkGame({ title: 'other house', householdId: 'other-house' });
    await mkPlayer({ gameId: mine._id, shelf: 'playing', rating: 5, hoursPlayed: 12 });
    const res = await gameResolvers.Query.gameLibraryOverview(null, {}, ctx(ALICE));
    const byTitle = Object.fromEntries(res.items.map((i) => [i.title, i]));
    expect(res.total).toBe(2);
    expect(byTitle.mine).toMatchObject({ shelf: 'playing', rating: 5, hoursPlayed: 12 });
    expect(byTitle['untouched owned game']).toMatchObject({ shelf: null, rating: null, hoursPlayed: 0, favorite: false });
    expect(byTitle['not owned']).toBeUndefined();
    expect(byTitle['other house']).toBeUndefined();
  });
});

// ── 4. like ────────────────────────────────────────────────────────────────
describe('like (D21/D22)', () => {
  test('seeds from taste rows; played games and seeds are excluded; closestTo names the seed', async () => {
    const loved = await mkGame({ title: 'loved space game', description: 'space galaxy starship' });
    const candidate = await mkGame({ title: 'unplayed space game', description: 'alien starship galaxy' });
    const soup = await mkGame({ title: 'soup game', description: 'recipe soup kitchen' });
    const played = await mkGame({ title: 'played space game', description: 'space galaxy' });
    await mkPlayer({ gameId: loved._id, favorite: true, shelf: 'finished', hoursPlayed: 50 });
    await mkPlayer({ gameId: played._id, shelf: 'playing', hoursPlayed: 30 });
    await runCatalogScanOnce();

    const res = await gameResolvers.Query.gamesLike(null, {}, ctx(ALICE));
    const titles = res.items.map((i) => i.game.title);
    expect(res.reason).toBeNull();
    expect(titles).toContain('unplayed space game');
    expect(titles).not.toContain('loved space game'); // a seed, never a candidate
    expect(titles).not.toContain('played space game'); // hoursPlayed > 0
    const hit = res.items.find((i) => i.game.title === 'unplayed space game');
    expect(hit.closestTo.title).toBe('loved space game');
    // Meaning ranking: the spacey candidate outranks the soup one.
    const soupHit = res.items.find((i) => i.game.title === 'soup game');
    expect(hit.score).toBeGreaterThan(soupHit?.score ?? -1);
  });

  test('a zero-hours backlog row still makes the game a candidate', async () => {
    await mkGame({ title: 'loved space game', description: 'space galaxy' });
    const backlog = await mkGame({ title: 'backlog space game', description: 'space starship' });
    const seeds = await Game.find({ title: 'loved space game' }).lean();
    await mkPlayer({ gameId: seeds[0]._id, rating: 5, hoursPlayed: 20 });
    await mkPlayer({ gameId: backlog._id, shelf: 'backlog', hoursPlayed: 0 });
    await runCatalogScanOnce();
    const res = await gameResolvers.Query.gamesLike(null, {}, ctx(ALICE));
    expect(res.items.map((i) => i.game.title)).toContain('backlog space game');
  });

  test('no seeds and no q → reason no_seeds', async () => {
    await seedAndScan([], [{ title: 'space game' }]);
    const res = await gameResolvers.Query.gamesLike(null, {}, ctx(ALICE));
    expect(res).toMatchObject({ reason: 'no_seeds', items: [] });
  });

  test('an unindexed scope → reason not_indexed, not no_seeds', async () => {
    await mkGame({ title: 'space game' }); // exists but never scanned
    const res = await gameResolvers.Query.gamesLike(null, {}, ctx(ALICE));
    expect(res).toMatchObject({ reason: 'not_indexed', items: [] });
  });

  test('seeds-only still answers with the service down; q alone → embeddings_unavailable', async () => {
    const loved = await mkGame({ title: 'loved space game', description: 'space galaxy' });
    await mkGame({ title: 'unplayed space game', description: 'space starship' });
    await mkPlayer({ gameId: loved._id, rating: 5 });
    await runCatalogScanOnce();

    markServiceDown(new Error('test outage'));
    const seedsOnly = await gameResolvers.Query.gamesLike(null, {}, ctx(ALICE));
    expect(seedsOnly.reason).toBeNull();
    expect(seedsOnly.items.map((i) => i.game.title)).toContain('unplayed space game');

    const qOnly = await gameResolvers.Query.gamesLike(null, { likeIds: [], q: 'space' }, ctx(ALICE));
    expect(qOnly).toMatchObject({ reason: 'embeddings_unavailable', items: [] });
  });

  test('booksLike: seeds are 4★+ books; candidates are owned, unread, not on read', async () => {
    const loved = await mkBook({ title: 'loved space book', description: 'galaxy starship', rating: 5, readCount: 1, shelf: 'read', dateFinished: new Date() });
    const candidate = await mkBook({ title: 'unread space book', description: 'space alien galaxy', shelf: 'unread', readCount: 0 });
    await mkBook({ title: 'finished book', description: 'space galaxy', shelf: 'read', readCount: 1, dateFinished: new Date() });
    await runCatalogScanOnce();
    const res = await bookResolvers.Query.booksLike(null, {}, ctx(ALICE));
    const titles = res.items.map((i) => i.book.title);
    expect(titles).toContain('unread space book');
    expect(titles).not.toContain('loved space book');
    expect(titles).not.toContain('finished book');
    expect(res.items.find((i) => i.book.title === 'unread space book').closestTo.title).toBe('loved space book');
  });
});

// ── 5b. the X3 shortlist + seed pickers (WHAT_NEXT_SPEC) ──────────────────
describe('shortlistFromSeeds (X3)', () => {
  // Hand-planted 3-dim vectors: s1=[1,0,0], s2=[0,1,0]; candidates chosen so
  // each seed's ranking is known. mkVec writes current-model rows directly.
  const mkGVec = (itemId, vector, householdId = 'default') =>
    GameVector.create({
      itemId, householdId, model: embeddingsConfig().model,
      hash: 'h', vector, indexedAt: new Date(),
    });

  async function plant() {
    const [s1, s2, c1, c2, c3] = await Promise.all([
      mkGame({ title: 'seed one' }), mkGame({ title: 'seed two' }),
      mkGame({ title: 'cand one' }), mkGame({ title: 'cand two' }), mkGame({ title: 'cand three' }),
    ]);
    await Promise.all([
      mkGVec(s1._id, [1, 0, 0]), mkGVec(s2._id, [0, 1, 0]),
      mkGVec(c1._id, [0.9, 0.5, 0]), mkGVec(c2._id, [0.5, 0.9, 0]), mkGVec(c3._id, [0.4, 0.4, 0]),
    ]);
    return { s1, s2, c1, c2, c3 };
  }
  const candidatesOf = (...games) => new Set(games.map((g) => String(g._id)));

  test('round-robin across seed lists in seed order, deduped, because = the seed', async () => {
    const { s1, s2, c1, c2, c3 } = await plant();
    const out = await shortlistFromSeeds({
      kind: 'game', scope: 'default',
      seedIds: [String(s1._id), String(s2._id)],
      candidateIds: candidatesOf(c1, c2, c3),
      size: 20,
    });
    // s1's list: c1, c2, c3 · s2's: c2, c1, c3. Round-robin: c1, c2, then c3.
    expect(out.map((o) => o.id)).toEqual([String(c1._id), String(c2._id), String(c3._id)]);
    expect(out[0]).toMatchObject({ because: String(s1._id) });
    expect(out[1]).toMatchObject({ because: String(s2._id) });
    expect(out[2]).toMatchObject({ because: String(s1._id) });
  });

  test('seeds never appear in their own shortlist; vectorless seeds are dropped', async () => {
    const { s1, s2, c1, c2, c3 } = await plant();
    const ghost = new mongoose.Types.ObjectId();
    const out = await shortlistFromSeeds({
      kind: 'game', scope: 'default',
      seedIds: [String(s1._id), String(s2._id), String(ghost)],
      candidateIds: candidatesOf(s1, s2, c1, c2, c3), // seeds inside candidates too
      size: 20,
    });
    const ids = out.map((o) => o.id);
    expect(ids).not.toContain(String(s1._id));
    expect(ids).not.toContain(String(s2._id));
    expect(out).toHaveLength(3);
  });

  test('the size cap stops the round-robin', async () => {
    const { s1, s2, c1, c2, c3 } = await plant();
    const out = await shortlistFromSeeds({
      kind: 'game', scope: 'default', seedIds: [String(s1._id), String(s2._id)],
      candidateIds: candidatesOf(c1, c2, c3), size: 1,
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(String(c1._id));
  });

  test('a mood vector changes per-seed ranking', async () => {
    const { s1, s2, c1, c2, c3 } = await plant();
    const moody = await mkGame({ title: 'mood match' });
    await mkGVec(moody._id, [0.4, 0.4, 0.9]); // mid-similar to seeds, strong on mood
    const out = await shortlistFromSeeds({
      kind: 'game', scope: 'default', seedIds: [String(s1._id)],
      candidateIds: candidatesOf(c1, c2, c3, moody),
      moodVec: [0, 0, 1], size: 20,
    });
    expect(out[0].id).toBe(String(moody._id)); // (0.4+0.9)/2 beats c1's (0.9+0)/2
  });

  test('the embeddings service down → moodQueryVector null, shortlist still answers', async () => {
    const { s1, s2, c1, c2, c3 } = await plant();
    markServiceDown(new Error('test outage'));
    expect(await moodQueryVector('cozy')).toBeNull();
    const out = await shortlistFromSeeds({
      kind: 'game', scope: 'default', seedIds: [String(s1._id)],
      candidateIds: candidatesOf(c1, c2, c3), moodVec: null, size: 20,
    });
    expect(out[0].id).toBe(String(c1._id));
  });

  test('recommendCatalog now shortlists: closestTo is the because seed', async () => {
    const { s1, s2, c1, c2, c3 } = await plant();
    const { items, reason } = await recommendCatalog({
      kind: 'game', scope: 'default',
      seeds: [{ id: String(s1._id), weight: 2 }, { id: String(s2._id), weight: 1 }],
      candidateIds: candidatesOf(c1, c2, c3), limit: 10,
    });
    expect(reason).toBeNull();
    expect(items[0].closestId).toBe(String(s1._id));
    expect(items.map((i) => i.id)).toEqual([String(c1._id), String(c2._id), String(c3._id)]);
  });
});

describe('pickGameSeeds (X1)', () => {
  const ids = (n) => Array.from({ length: n }, () => String(new mongoose.Types.ObjectId()));
  const row = (gameId, over = {}) => ({ gameId, favorite: false, rating: null, hoursPlayed: 0, lastPlayedAt: null, ...over });

  test('3 loved (favorite → rating → hours) + 2 recent; only vector ids count', () => {
    const [a, b, c, d, e, f, g] = ids(7);
    const vecIds = new Set([a, b, c, d, e, f]); // g has NO vector
    const rows = [
      row(d, { rating: 5 }),
      row(a, { favorite: true }),
      row(b, { rating: 4 }),
      row(c, { hoursPlayed: 9 }),
      row(g, { favorite: true, rating: 5 }),     // best of all, but unindexed — must not take a slot
      row(e, { lastPlayedAt: new Date('2026-09-01') }),
      row(f, { lastPlayedAt: new Date('2026-09-02') }),
    ];
    const seeds = gameLibrary.pickGameSeeds(rows, vecIds);
    expect(seeds.map((s) => s.id)).toEqual([a, d, b, f, e]);
    expect(seeds.map((s) => s.why)).toEqual(['loved', 'loved', 'loved', 'recent', 'recent']);
    expect(seeds.map((s) => s.id)).not.toContain(g);
  });

  test('a short pool is topped up from the other to five', () => {
    const [a, b, c, d] = ids(4);
    const vecIds = new Set([a, b, c, d]);
    const rows = [
      row(a, { favorite: true }),
      row(b, { lastPlayedAt: new Date('2026-09-03') }),   // only recent
      row(c, { rating: 5 }),
      row(d, { hoursPlayed: 20, lastPlayedAt: new Date('2026-09-01') }),
    ];
    const seeds = gameLibrary.pickGameSeeds(rows, vecIds);
    expect(seeds).toHaveLength(4);
    expect(seeds.filter((s) => s.why === 'loved')).toHaveLength(3);
  });
});

describe('pickBookSeeds (X2)', () => {
  const ids = (n) => Array.from({ length: n }, () => String(new mongoose.Types.ObjectId()));
  const row = (_id, over = {}) => ({ _id, rating: null, finished: false, dateFinished: null, updatedAt: null, ...over });

  test('3 loved by dateFinished desc + 2 recent finished; unindexed skipped', () => {
    const [a, b, c, d, e, f] = ids(6);
    const vecIds = new Set([a, b, c, d, e]); // f unindexed
    const rows = [
      row(a, { rating: 5, finished: true, dateFinished: new Date('2026-01-01') }),
      row(b, { rating: 4, finished: true, dateFinished: new Date('2026-03-01') }),
      row(c, { rating: 4, dateFinished: null }),                    // loved, never finished
      row(d, { finished: true, dateFinished: new Date('2026-04-01'), updatedAt: new Date('2026-04-02') }),
      row(e, { finished: true, dateFinished: new Date('2026-05-01') }),
      row(f, { rating: 5, finished: true, dateFinished: new Date('2026-06-01') }),
    ];
    const seeds = bookLibrary.pickBookSeeds(rows, vecIds);
    expect(seeds.map((s) => s.id)).toEqual([b, a, c, e, d]);
    expect(seeds.map((s) => s.why)).toEqual(['loved', 'loved', 'loved', 'recent', 'recent']);
  });
});

// ── 5. search ──────────────────────────────────────────────────────────────
describe('search (D20)', () => {
  test('keyword-only when the service is down', async () => {
    await seedAndScan([{ title: 'space book one' }], []);
    markServiceDown(new Error('test outage'));
    const calls = fetchCalls.length;
    const res = await bookResolvers.Query.bookSearch(null, { q: 'space' }, ctx(ALICE));
    expect(res.items.map((i) => i.book.title)).toEqual(['space book one']);
    expect(res.items[0].matchedBy).toBe('keyword');
    expect(fetchCalls.length).toBe(calls); // no embed attempt while down
  });

  test('fusion includes a meaning-only hit, marked meaning', async () => {
    // BookGeek's keyword fields are title/authors/tags — NOT description —
    // so 'Mystery Novel' can only arrive by vector (its description is all
    // space words, matching q 'space' in the fake topic space).
    await seedAndScan([
      { title: 'space adventures', description: 'recipe soup' },
      { title: 'Mystery Novel', description: 'galaxy starship space' },
    ], []);
    const res = await bookResolvers.Query.bookSearch(null, { q: 'space' }, ctx(ALICE));
    const byTitle = Object.fromEntries(res.items.map((i) => [i.book.title, i]));
    expect(['keyword', 'both']).toContain(byTitle['space adventures']?.matchedBy);
    expect(byTitle['Mystery Novel']?.matchedBy).toBe('meaning');
  });
});
