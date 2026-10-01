/**
 * notegeekSemantic.test.js
 *
 * Meaning-based search and related notes on the NoteGeek gateway:
 *   1. chunking — which text each note type contributes, passage sizes, overlap
 *   2. the embeddings client — prefixes, guards, and that it only ever talks to
 *      EMBEDDINGS_URL (the privacy rule: note text never leaves the box)
 *   3. the indexer — debounce, hash skip, backoff, failure accounting, sweep
 *   4. hybrid search — RRF ordering, meaning hits marked, owner scoping,
 *      keyword-only when the embed call fails
 *   5. relatedNotes — excludes itself, deleted notes, other users
 *
 * `fetch` is replaced by a fake embedder: words map to "topics" (one vector
 * dimension each), so "chamberlain" and "garage" are near each other and
 * "sourdough" is not. Every call is recorded.
 */

import { jest, describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { default: Note } = await import('../graphql/notegeek/models/Note.js');
const { default: NoteChunk } = await import('../graphql/notegeek/models/NoteChunk.js');
const { resolvers } = await import('../graphql/notegeek/resolvers.js');
const chunking = await import('../graphql/notegeek/chunking.js');
const embeddings = await import('../graphql/notegeek/embeddings.js');
const semantic = await import('../graphql/notegeek/semantic.js');
const indexer = await import('../graphql/notegeek/indexer.js');

const { chunkNote, noteText, CHUNK_MAX_WORDS, CHUNK_OVERLAP_WORDS, MAX_CHUNKS_PER_NOTE } = chunking;
const { embedTexts, EmbeddingsUnavailableError, DEFAULT_EMBEDDINGS_URL, MAX_CHARS_PER_REQUEST } = embeddings;
const { rrfFuse, selectVectorHits, selectKeywordHits, pickBestMatch, rankHybrid, bestChunkPerNote, _resetSemanticState, serviceIsDown } = semantic;
const { runIndexerOnce, sweepIndex, QUIET_MS } = indexer;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALICE = new mongoose.Types.ObjectId();
const BOB = new mongoose.Types.ObjectId();
const ctx = (userId) => ({ user: { id: String(userId) } });
const { Query, Mutation } = resolvers;
const LATER = () => Date.now() + QUIET_MS + 5000;
const TEST_URL = 'http://embeddings.test:11434';

// ── the fake embedder ──────────────────────────────────────────────────────
const TOPICS = {
  garage: 0, chamberlain: 0, opener: 0, remote: 0, door: 0,
  sourdough: 1, bread: 1, flour: 1, baking: 1, starter: 1,
  nginx: 2, certificate: 2, homelab: 2, certbot: 2,
  pressure: 3, blood: 3, health: 3,
};
const MXBAI_QUERY = 'Represent this sentence for searching relevant passages: ';
function fakeVector(text, dims = 1024) {
  const v = new Array(dims).fill(0);
  v[dims - 1] = 0.25; // a little shared baseline, like any real model
  for (const w of String(text).toLowerCase().split(/[^a-z0-9]+/)) {
    if (w in TOPICS) v[TOPICS[w]] += 1;
  }
  return v;
}
let fetchCalls = [];
let fetchImpl = null;
// Answers at the width of the model asked for, like Ollama does.
const DIMS = { 'mxbai-embed-large': 1024, 'nomic-embed-text': 768 };
const unprefix = (s) => s.replace(/^search_(document|query): /, '').replace(MXBAI_QUERY, '');
function okFetch(url, init) {
  const { input, model } = JSON.parse(init.body);
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({ embeddings: input.map((s) => fakeVector(unprefix(s), DIMS[model] ?? 512)) }),
    text: async () => '',
  });
}
const realFetch = globalThis.fetch;

beforeAll(async () => {
  await Note.db.asPromise();
  await Note.init();
  await NoteChunk.init();
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
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  delete process.env.EMBEDDINGS_URL;
  await Note.deleteMany({});
  await NoteChunk.deleteMany({});
});

afterAll(async () => {
  await Note.db.close();
});

const md = (userId, title, content, extra = {}) =>
  Note.create({ userId, title, content, type: 'markdown', ...extra });
const indexAll = () => runIndexerOnce({ now: LATER() });
const words = (n, w = 'word') => Array.from({ length: n }, (_, i) => `${ w }${ i }`).join(' ');

// ── 1. chunking ────────────────────────────────────────────────────────────
describe('chunking', () => {
  test('a short note is one passage that opens with the title', () => {
    expect(chunkNote({ type: 'markdown', title: 'Garage', content: 'New remote battery.' }))
      .toEqual(['Garage\n\nNew remote battery.']);
  });

  test('a long note is cut into bounded passages that overlap', () => {
    const paras = Array.from({ length: 12 }, (_, p) => words(100, `p${ p }w`)).join('\n\n');
    const chunks = chunkNote({ type: 'markdown', title: 'Long', content: paras });
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks[0].startsWith('Long\n\n')).toBe(true);
    const bodies = chunks.map((c, i) => (i === 0 ? c.slice('Long\n\n'.length) : c).split(' '));
    for (const b of bodies) expect(b.length).toBeLessThanOrEqual(CHUNK_MAX_WORDS);
    for (let i = 1; i < bodies.length; i += 1) {
      const tail = bodies[i - 1].slice(-CHUNK_OVERLAP_WORDS);
      expect(bodies[i].slice(0, CHUNK_OVERLAP_WORDS)).toEqual(tail);
    }
    // Every word of the note is in some passage.
    const all = new Set(bodies.flat());
    expect(all.has('p0w0')).toBe(true);
    expect(all.has('p11w99')).toBe(true);
  });

  test('a heading starts a new passage once the current one is big enough', () => {
    const content = `${ words(260, 'a') }\n\n## Second part\n\n${ words(30, 'b') }`;
    const chunks = chunkNote({ type: 'markdown', title: '', content });
    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toContain('## Second part');
  });

  test('one enormous paragraph is split by words', () => {
    const chunks = chunkNote({ type: 'markdown', title: 'x', content: words(1000) });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });

  test('passage count is capped', () => {
    const content = Array.from({ length: 400 }, () => words(300)).join('\n\n');
    expect(chunkNote({ type: 'markdown', title: 'x', content }).length).toBe(MAX_CHUNKS_PER_NOTE);
  });

  test('text notes lose their HTML; entities decode', () => {
    expect(noteText({ type: 'text', title: 'T', content: '<p>Fish &amp; chips</p><p>two</p>' }).body)
      .toBe('Fish & chips\n\ntwo');
  });

  test('code notes contribute their code; mind maps their labels', () => {
    expect(noteText({ type: 'code', title: 'c', content: JSON.stringify({ language: 'js', code: 'let x = 1' }) }).body)
      .toBe('let x = 1');
    expect(noteText({ type: 'code', title: 'c', content: 'raw code' }).body).toBe('raw code');
    const map = JSON.stringify({ nodes: [{ data: { label: 'Root' } }, { data: { label: 'Leaf' } }], edges: [] });
    expect(noteText({ type: 'mindmap', title: 'm', content: map }).body).toBe('Root\nLeaf');
  });

  test('sketches are their title or nothing; locked notes their title only', () => {
    expect(chunkNote({ type: 'handwritten', title: 'Shed plan', content: '{"store":{}}' })).toEqual(['Shed plan']);
    expect(chunkNote({ type: 'handwritten', title: '', content: '{"store":{}}' })).toEqual([]);
    expect(chunkNote({ type: 'markdown', title: 'Secret', content: 'ciphertext', isEncrypted: true })).toEqual(['Secret']);
    expect(chunkNote({ type: 'markdown', title: 'Locked', content: 'hidden', isLocked: true })).toEqual(['Locked']);
  });
});

// ── 2. the embeddings client ───────────────────────────────────────────────
describe('embeddings client', () => {
  test('defaults to mxbai: query prefix, no passage prefix, 1024 dims, targets EMBEDDINGS_URL', async () => {
    const [doc] = await embedTexts(['hello'], { kind: 'document' });
    await embedTexts(['hi'], { kind: 'query' });
    expect(fetchCalls.map((c) => c.url)).toEqual([`${ TEST_URL }/api/embed`, `${ TEST_URL }/api/embed`]);
    expect(fetchCalls[0].body).toEqual({ model: 'mxbai-embed-large', input: ['hello'] });
    expect(fetchCalls[1].body.input).toEqual([`${ MXBAI_QUERY }hi`]);
    expect(doc).toHaveLength(1024);
  });

  test('EMBEDDINGS_MODEL=nomic-embed-text still gets nomic prefixes and 768 dims', async () => {
    process.env.EMBEDDINGS_MODEL = 'nomic-embed-text';
    const [doc] = await embedTexts(['hello'], { kind: 'document' });
    await embedTexts(['hi'], { kind: 'query' });
    expect(fetchCalls[0].body).toEqual({ model: 'nomic-embed-text', input: ['search_document: hello'] });
    expect(fetchCalls[1].body.input).toEqual(['search_query: hi']);
    expect(doc).toHaveLength(768);
  });

  test('the model table: each model its width; a wrong width is refused; an unknown model only needs consistency', async () => {
    expect(embeddings.modelSpec('mxbai-embed-large')).toMatchObject({ dims: 1024, documentPrefix: '', known: true });
    expect(embeddings.modelSpec('nomic-embed-text')).toMatchObject({ dims: 768, queryPrefix: 'search_query: ', known: true });
    expect(embeddings.DEFAULT_EMBEDDINGS_MODEL).toBe('mxbai-embed-large');
    // mxbai answering with nomic's width is a broken service, not a vector.
    fetchImpl = () => Promise.resolve({ ok: true, json: async () => ({ embeddings: [fakeVector('x', 768)] }) });
    await expect(embedTexts(['x'], { kind: 'document' })).rejects.toBeInstanceOf(EmbeddingsUnavailableError);
    process.env.EMBEDDINGS_MODEL = 'some-new-model';
    expect(embeddings.modelSpec()).toMatchObject({ known: false, dims: null, queryPrefix: '' });
    fetchImpl = okFetch;
    const vecs = await embedTexts(['a', 'b'], { kind: 'query' });
    expect(vecs.map((v) => v.length)).toEqual([512, 512]);
    expect(fetchCalls.at(-1).body.input).toEqual(['a', 'b']);
  });

  test('defaults to the local container with no env at all', async () => {
    delete process.env.EMBEDDINGS_URL;
    await embedTexts(['x'], { kind: 'document' });
    expect(fetchCalls[0].url).toBe(`${ DEFAULT_EMBEDDINGS_URL }/api/embed`);
    expect(DEFAULT_EMBEDDINGS_URL).toBe('http://datageek_embeddings:11434');
  });

  test('refuses an over-long request without sending it', async () => {
    const big = Array.from({ length: 3 }, () => 'x'.repeat(3900));
    await expect(embedTexts(big, { kind: 'document' })).rejects.toThrow(RangeError);
    expect(fetchCalls).toHaveLength(0);
    expect(MAX_CHARS_PER_REQUEST).toBeLessThanOrEqual(8000);
  });

  test('a wrong-sized vector or HTTP error is EmbeddingsUnavailableError; 400 blames the input', async () => {
    fetchImpl = () => Promise.resolve({ ok: true, json: async () => ({ embeddings: [[1, 2, 3]] }) });
    await expect(embedTexts(['x'], { kind: 'document' })).rejects.toBeInstanceOf(EmbeddingsUnavailableError);
    fetchImpl = () => Promise.resolve({ ok: false, status: 400, text: async () => 'bad' });
    const err = await embedTexts(['x'], { kind: 'document' }).catch((e) => e);
    expect(err.inputProblem).toBe(true);
    fetchImpl = () => Promise.resolve({ ok: false, status: 503, text: async () => '' });
    expect((await embedTexts(['x'], { kind: 'document' }).catch((e) => e)).inputProblem).toBe(false);
  });

  test('no cloud path: the semantic modules import nothing from the AI stack and only embeddings.js fetches', () => {
    const dir = path.join(HERE, '../graphql/notegeek');
    const files = ['embeddings.js', 'chunking.js', 'semantic.js', 'indexer.js', 'models/NoteChunk.js'];
    for (const f of files) {
      const src = readFileSync(path.join(dir, f), 'utf8');
      const imports = [...src.matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
      for (const spec of imports) {
        expect(spec).not.toMatch(/ai(Service|FeatureRunner|Geek|Free|Catalog|Provider)|openrouter|anthropic|openai|groq|axios/i);
      }
      const fetches = (src.match(/\bfetch\(/g) || []).length;
      expect([f, fetches]).toEqual([f, f === 'embeddings.js' ? 1 : 0]);
    }
  });

  test('every embed call a whole index + search cycle makes goes to EMBEDDINGS_URL', async () => {
    await md(ALICE, 'Garage', 'chamberlain opener');
    await indexAll();
    await Query.searchNotes(null, { q: 'garage', hybrid: true }, ctx(ALICE));
    expect(fetchCalls.length).toBeGreaterThan(0);
    for (const c of fetchCalls) expect(c.url).toBe(`${ TEST_URL }/api/embed`);
  });
});

// ── 3. the indexer ─────────────────────────────────────────────────────────
describe('indexer', () => {
  test('a note is embedded only once it has been still for QUIET_MS', async () => {
    const note = await md(ALICE, 'Garage', 'chamberlain opener');
    expect(note.embeddingState).toBe('stale');
    expect((await runIndexerOnce({ now: Date.now() })).results).toEqual([]);
    expect(fetchCalls).toHaveLength(0);
    expect((await runIndexerOnce({ now: LATER() })).results).toEqual(['indexed']);
    const chunks = await NoteChunk.find({ noteId: note._id }).lean();
    expect(chunks).toHaveLength(1);
    expect(chunks[0].vector).toHaveLength(1024);
    expect(chunks[0].model).toBe('mxbai-embed-large');
    expect(String(chunks[0].userId)).toBe(String(ALICE));
    const after = await Note.findById(note._id).lean();
    expect(after.embeddingState).toBe('indexed');
    // Indexing is not an edit.
    expect(after.updatedAt.getTime()).toBe(note.updatedAt.getTime());
  });

  test('legacy notes with no state are backfilled', async () => {
    const note = await md(ALICE, 'Old', 'bread');
    await Note.collection.updateOne({ _id: note._id }, { $unset: { embeddingState: '' } });
    expect((await indexAll()).results).toEqual(['indexed']);
  });

  test('a content edit re-queues; tags and pins do not; unchanged text costs no embed call', async () => {
    const note = await md(ALICE, 'Garage', 'chamberlain opener');
    await indexAll();
    const id = String(note._id);
    await Mutation.updateNote(null, { id, tags: ['house'] }, ctx(ALICE));
    await Mutation.setNotePinned(null, { id, pinned: true }, ctx(ALICE));
    expect((await Note.findById(id).lean()).embeddingState).toBe('indexed');

    await Mutation.updateNote(null, { id, content: 'chamberlain opener', type: 'markdown' }, ctx(ALICE));
    expect((await Note.findById(id).lean()).embeddingState).toBe('stale');
    fetchCalls = [];
    expect((await indexAll()).results).toEqual(['unchanged']);
    expect(fetchCalls).toHaveLength(0);

    await Mutation.updateNote(null, { id, content: 'sourdough starter', type: 'markdown' }, ctx(ALICE));
    expect((await indexAll()).results).toEqual(['indexed']);
    const [chunk] = await NoteChunk.find({ noteId: note._id }).lean();
    expect(chunk.text).toContain('sourdough');
  });

  test('an untitled sketch is skipped without an embed call', async () => {
    await Note.create({ userId: ALICE, title: '', content: '{"store":{}}', type: 'handwritten' });
    expect((await indexAll()).results).toEqual(['skipped']);
    expect(fetchCalls).toHaveLength(0);
  });

  test('service down: the queue pauses, the note is not charged, saving still works', async () => {
    fetchImpl = () => Promise.reject(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    const note = await md(ALICE, 'Garage', 'chamberlain');
    expect((await indexAll()).results).toEqual(['backoff']);
    expect(serviceIsDown()).toBe(true);
    const after = await Note.findById(note._id).lean();
    expect(after.embeddingState).toBe('stale');
    expect(after.embeddingAttempts).toBe(0);
    expect(await runIndexerOnce({ now: LATER() })).toMatchObject({ ran: false, reason: 'backoff' });
    // Saves are untouched by any of this.
    const saved = await Mutation.updateNote(null, { id: String(note._id), content: 'new', type: 'markdown' }, ctx(ALICE));
    expect(saved.content).toBe('new');
  });

  test('a 400 charges the note and schedules a retry; five make it failed', async () => {
    fetchImpl = () => Promise.resolve({ ok: false, status: 400, text: async () => 'input too long' });
    const note = await md(ALICE, 'Garage', 'chamberlain');
    expect((await indexAll()).results).toEqual(['error']);
    let after = await Note.findById(note._id).lean();
    expect(after.embeddingAttempts).toBe(1);
    expect(after.embeddingRetryAt.getTime()).toBeGreaterThan(Date.now());
    expect(serviceIsDown()).toBe(false);
    await Note.updateOne({ _id: note._id }, { $set: { embeddingAttempts: 4, embeddingRetryAt: null } }, { timestamps: false });
    await indexAll();
    after = await Note.findById(note._id).lean();
    expect(after.embeddingState).toBe('failed');
    const status = await Query.noteIndexStatus(null, {}, ctx(ALICE));
    expect(status).toMatchObject({ total: 1, failed: 1, indexed: 0 });
  });

  test('deleteNote removes its chunks; the sweep removes orphans and re-queues chunkless notes', async () => {
    const a = await md(ALICE, 'Garage', 'chamberlain');
    const b = await md(ALICE, 'Bread', 'sourdough');
    await indexAll();
    expect(await NoteChunk.countDocuments()).toBe(2);
    await Mutation.deleteNote(null, { id: String(a._id) }, ctx(ALICE));
    expect(await NoteChunk.countDocuments({ noteId: a._id })).toBe(0);

    // An orphan the resolver never saw, and an indexed note that lost its chunks.
    await NoteChunk.create({ userId: ALICE, noteId: new mongoose.Types.ObjectId(), chunk: 0, vector: fakeVector('x'), model: 'mxbai-embed-large' });
    await NoteChunk.deleteMany({ noteId: b._id });
    expect(await sweepIndex()).toEqual({ removed: 1, requeued: 1 });
    expect((await Note.findById(b._id).lean()).embeddingState).toBe('stale');
  });

  test('noteIndexStatus is owner-scoped', async () => {
    await md(ALICE, 'Garage', 'chamberlain');
    await md(BOB, 'Bread', 'sourdough');
    await md(BOB, 'Nginx', 'certbot');
    await indexAll();
    const s = await Query.noteIndexStatus(null, {}, ctx(ALICE));
    expect(s).toMatchObject({ total: 1, indexed: 1, stale: 0, chunks: 1, model: 'mxbai-embed-large', serviceAvailable: true });
  });
});

// ── 4. hybrid search ───────────────────────────────────────────────────────
describe('rrfFuse', () => {
  test('a note in both lists beats one in either; keyword wins a same-rank tie', () => {
    const fused = rrfFuse([{ ids: ['a', 'b'], weight: 1 }, { ids: ['b', 'c'], weight: 0.8 }]);
    expect(fused.map((f) => f.id)).toEqual(['b', 'a', 'c']);
    expect(fused[0].ranks).toEqual([1, 0]);
    const tie = rrfFuse([{ ids: ['kw'], weight: 1 }, { ids: ['vec'], weight: 1 }]);
    expect(tie.map((f) => f.id)).toEqual(['kw', 'vec']);
  });

  test('with the shipped weights, the top keyword hit outranks the top meaning hit', () => {
    const fused = rrfFuse([
      { ids: ['exact'], weight: semantic.KEYWORD_WEIGHT },
      { ids: ['similar'], weight: semantic.VECTOR_WEIGHT },
    ]);
    expect(fused[0].id).toBe('exact');
  });

  test('vector hits need a floor and must be near the best', () => {
    const ranked = [{ score: 0.66 }, { score: 0.62 }, { score: 0.55 }, { score: 0.4 }];
    expect(selectVectorHits(ranked).map((h) => h.score)).toEqual([0.66, 0.62]);
    expect(selectVectorHits([{ score: 0.5 }])).toEqual([]);
  });
});

describe('searchNotes hybrid', () => {
  async function library() {
    const exact = await md(ALICE, 'Garage', 'The garage serial is 4XK-229.');
    const meaning = await md(ALICE, 'Chamberlain', 'The chamberlain opener needs a new remote battery.');
    const bread = await md(ALICE, 'Bread', 'Sourdough starter every 12 hours.');
    const bobs = await md(BOB, 'Bob garage', 'garage chamberlain opener');
    await indexAll();
    return { exact, meaning, bread, bobs };
  }

  test('keyword hit first, then the meaning-only hit, marked and explained', async () => {
    const { exact, meaning } = await library();
    const rows = await Query.searchNotes(null, { q: 'garage', hybrid: true }, ctx(ALICE));
    expect(rows.map((r) => String(r._id))).toEqual([String(exact._id), String(meaning._id)]);
    expect(rows[0].matchedBy).toBe('both');
    expect(rows[1].matchedBy).toBe('meaning');
    expect(rows[1].why).toContain('chamberlain opener');
    expect(rows[1].why).not.toMatch(/^Chamberlain/); // the title line is not repeated
  });

  test('without hybrid it is the old keyword search, same shape', async () => {
    const { exact } = await library();
    const rows = await Query.searchNotes(null, { q: 'garage' }, ctx(ALICE));
    expect(rows.map((r) => String(r._id))).toEqual([String(exact._id)]);
    expect(rows[0].matchedBy).toBeNull();
    expect(typeof rows[0].score).toBe('number');
    expect(fetchCalls.filter((c) => c.body.input[0].startsWith(MXBAI_QUERY))).toHaveLength(0);
  });

  test("never another user's notes, by keyword or by meaning", async () => {
    const { bobs } = await library();
    const rows = await Query.searchNotes(null, { q: 'garage chamberlain', hybrid: true }, ctx(ALICE));
    expect(rows.map((r) => String(r._id))).not.toContain(String(bobs._id));
    const bobRows = await Query.searchNotes(null, { q: 'garage', hybrid: true }, ctx(BOB));
    expect(bobRows.map((r) => String(r._id))).toEqual([String(bobs._id)]);
  });

  test('`under` narrows the meaning hits too', async () => {
    const { meaning } = await library();
    await Note.updateOne({ _id: meaning._id }, { $set: { tags: ['house'] } });
    const rows = await Query.searchNotes(null, { q: 'garage', under: 'work', hybrid: true }, ctx(ALICE));
    expect(rows).toEqual([]);
  });

  test('embed call fails at query time: keyword-only, no error', async () => {
    const { exact } = await library();
    fetchImpl = () => Promise.reject(new Error('socket hang up'));
    const rows = await Query.searchNotes(null, { q: 'garage', hybrid: true }, ctx(ALICE));
    expect(rows.map((r) => String(r._id))).toEqual([String(exact._id)]);
    expect(rows[0].matchedBy).toBe('keyword');
    // And while it is marked down, searches don't wait on it at all.
    fetchCalls = [];
    await Query.searchNotes(null, { q: 'garage door', hybrid: true }, ctx(ALICE));
    expect(fetchCalls).toHaveLength(0);
  });

  test('an unexpected failure in the vector half still returns the keyword hits', async () => {
    const { exact } = await library();
    const spy = jest.spyOn(NoteChunk, 'find').mockImplementation(() => { throw new Error('mongo hiccup'); });
    try {
      const rows = await Query.searchNotes(null, { q: 'garage', hybrid: true }, ctx(ALICE));
      expect(rows.map((r) => String(r._id))).toEqual([String(exact._id)]);
    } finally {
      spy.mockRestore();
    }
  });

  test('a note deleted after its vectors were cached never comes back', async () => {
    const { meaning } = await library();
    await Query.searchNotes(null, { q: 'garage', hybrid: true }, ctx(ALICE)); // warms the cache
    await Note.deleteOne({ _id: meaning._id }); // behind the resolver's back
    const rows = await Query.searchNotes(null, { q: 'opener', hybrid: true }, ctx(ALICE));
    expect(rows.map((r) => String(r._id))).not.toContain(String(meaning._id));
  });
});

// ── 4b. ranking: weak-hit cuts and the best match ─────────────────────────
// The numbers are Chef's, measured live 2026-10-01 (mxbai-embed-large, 34
// notes): see the calibration notes at the top of semantic.js.
const kwRows = (...scores) => scores.map((score, i) => ({ _id: `k${ i }`, score }));
const vHits = (...pairs) => pairs.map(([noteId, score]) => ({ noteId, score }));

describe('ranking', () => {
  test('keyword weak-hit cut: 2.23 / 1.84 / 0.50 ×3 keeps the 2.23 and the 1.84', () => {
    const kept = selectKeywordHits(kwRows(2.23, 1.84, 0.5, 0.5, 0.5));
    expect(kept.map((r) => r.score)).toEqual([2.23, 1.84]);
    expect(semantic.KEYWORD_MIN_RATIO).toBe(0.4);
  });

  test('keyword cut: the top hit always stays; equal scores all stay', () => {
    expect(selectKeywordHits(kwRows(0.5)).map((r) => r.score)).toEqual([0.5]);
    expect(selectKeywordHits(kwRows(1, 1, 1))).toHaveLength(3);
    expect(selectKeywordHits([])).toEqual([]);
  });

  test("vector cut on mxbai's scale: 'retirement savings' keeps the 401(k) note alone", () => {
    // 401(k) 0.656, then four long work notes at 0.533–0.558.
    const ranked = [0.656, 0.558, 0.557, 0.554, 0.540, 0.533].map((score, i) => ({ noteId: `v${ i }`, score }));
    expect(selectVectorHits(ranked).map((h) => h.score)).toEqual([0.656]);
    // "how do I log into the server": four real hits within 0.05 of each other stay.
    const server = [0.627, 0.603, 0.587, 0.576, 0.527, 0.524].map((score, i) => ({ noteId: `s${ i }`, score }));
    expect(selectVectorHits(server).map((h) => h.score)).toEqual([0.627, 0.603, 0.587, 0.576]);
    // Nonsense ("quantum chromodynamics") tops out under the floor.
    expect(selectVectorHits([{ noteId: 'q', score: 0.496 }])).toEqual([]);
  });

  test('best match: a clear meaning win is flagged and goes FIRST, over junk keyword hits', () => {
    // "what pills do I take every day": no keyword hit on the meds note; five
    // long work notes match "take"/"every"/"day". Meds 0.720, next 0.439.
    const ranked = rankHybrid({
      keywordRows: kwRows(2.83, 2.26, 2.26, 2.0, 1.94),
      vectorHits: vHits(['meds', 0.720]),
      runnerUpScore: 0.439,
    });
    expect(ranked[0]).toMatchObject({ id: 'meds', best: true, matchedBy: 'meaning' });
    expect(ranked.filter((r) => r.best)).toHaveLength(1);
    // The rest keep their RRF (keyword) order.
    expect(ranked.slice(1).map((r) => r.id)).toEqual(['k0', 'k1', 'k2', 'k3', 'k4']);
  });

  test('best match: the GameGeek question — top in both lists, clear lead', () => {
    const ranked = rankHybrid({
      keywordRows: [{ _id: 'gg', score: 2.23 }, { _id: 'gcloud', score: 1.84 }, { _id: 'phone', score: 0.5 }],
      vectorHits: vHits(['gg', 0.722], ['rally', 0.614]),
      runnerUpScore: 0.614,
    });
    expect(ranked.map((r) => [r.id, r.best])).toEqual([['gg', true], ['gcloud', false], ['rally', false]]);
  });

  test('no best match on a near-tie', () => {
    // "how do I log into the server": 0.627 vs 0.603.
    expect(pickBestMatch({ keywordTopId: 'backup', vectorHits: vHits(['rally', 0.627], ['ssh', 0.603]), runnerUpScore: 0.603 })).toBeNull();
    // "who are the people at the partner bank": 0.634 vs 0.585, lists disagree.
    expect(pickBestMatch({ keywordTopId: 'brief', vectorHits: vHits(['dw', 0.634], ['xf', 0.585]), runnerUpScore: 0.585 })).toBeNull();
    const tie = rankHybrid({ keywordRows: kwRows(1.0), vectorHits: vHits(['a', 0.627], ['b', 0.603]), runnerUpScore: 0.603 });
    expect(tie.some((r) => r.best)).toBe(false);
  });

  test('agreement: both lists pick the same note → a smaller lead is enough', () => {
    // "newsgroup downloads": Usenet is keyword #1 and vector #1, 0.598 vs 0.548.
    expect(pickBestMatch({ keywordTopId: 'usenet', vectorHits: vHits(['usenet', 0.598]), runnerUpScore: 0.548 })).toBe('usenet');
    // The same lead without the keyword agreement is not.
    expect(pickBestMatch({ keywordTopId: 'other', vectorHits: vHits(['usenet', 0.598]), runnerUpScore: 0.548 })).toBeNull();
  });

  test('never a best match with no vectors, or mid-backfill', () => {
    expect(rankHybrid({ keywordRows: kwRows(3.87, 1.0) }).some((r) => r.best)).toBe(false);
    expect(pickBestMatch({ keywordTopId: 'meds', vectorHits: vHits(['meds', 0.72]), runnerUpScore: 0.44, backfilling: true })).toBeNull();
  });

  test('a note with many passages gets no extra weight: its score is its best passage', () => {
    const unit = (i, dims = 4) => { const v = new Float32Array(dims); v[i] = 1; return v; };
    const q = Float32Array.from([0.6, 0.8, 0, 0]);
    // "long" has ten passages each scoring 0.6; "short" one passage scoring 0.8.
    const rows = [
      ...Array.from({ length: 10 }, (_, c) => ({ noteId: 'long', chunk: c, text: '', vec: unit(0) })),
      { noteId: 'short', chunk: 0, text: '', vec: unit(1) },
    ];
    const ranked = bestChunkPerNote(rows, q);
    expect(ranked.map((h) => h.noteId)).toEqual(['short', 'long']);
    expect(ranked[1].score).toBeCloseTo(0.6, 5);
  });
});

describe('searchNotes best match', () => {
  test('a clear winner comes back first with bestMatch: true; the rest false', async () => {
    const bread = await md(ALICE, 'Bread', 'Sourdough starter every 12 hours.');
    await md(ALICE, 'Garage', 'The chamberlain opener needs a remote.');
    await md(ALICE, 'Nginx', 'certbot renews the certificate.');
    await indexAll();
    const rows = await Query.searchNotes(null, { q: 'sourdough', hybrid: true }, ctx(ALICE));
    expect(String(rows[0]._id)).toBe(String(bread._id));
    expect(rows[0].bestMatch).toBe(true);
    expect(rows.slice(1).every((r) => r.bestMatch === false)).toBe(true);
  });

  test('two equally good notes: no best match', async () => {
    await md(ALICE, 'Bread', 'sourdough starter flour');
    await md(ALICE, 'Loaf', 'sourdough starter flour');
    await indexAll();
    const rows = await Query.searchNotes(null, { q: 'baking', hybrid: true }, ctx(ALICE));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.some((r) => r.bestMatch)).toBe(false);
  });

  test('keyword-only search always says bestMatch: false', async () => {
    await md(ALICE, 'Bread', 'Sourdough starter every 12 hours.');
    await indexAll();
    const rows = await Query.searchNotes(null, { q: 'sourdough' }, ctx(ALICE));
    expect(rows.map((r) => r.bestMatch)).toEqual([false]);
  });
});

// ── 4c. changing the model ─────────────────────────────────────────────────
describe('model change', () => {
  async function libraryOnNomic() {
    process.env.EMBEDDINGS_MODEL = 'nomic-embed-text';
    const exact = await md(ALICE, 'Garage', 'The garage serial is 4XK-229.');
    const meaning = await md(ALICE, 'Chamberlain', 'The chamberlain opener needs a new remote battery.');
    await md(ALICE, 'Bread', 'Sourdough starter every 12 hours.');
    await indexAll();
    expect(await NoteChunk.countDocuments({ model: 'nomic-embed-text' })).toBe(3);
    delete process.env.EMBEDDINGS_MODEL; // the deploy: default is now mxbai
    _resetSemanticState();
    return { exact, meaning };
  }

  test('old-model chunks are ignored: keyword-only search, no Related, no error', async () => {
    const { exact, meaning } = await libraryOnNomic();
    const rows = await Query.searchNotes(null, { q: 'garage', hybrid: true }, ctx(ALICE));
    expect(rows.map((r) => [String(r._id), r.matchedBy, r.bestMatch])).toEqual([[String(exact._id), 'keyword', false]]);
    expect(await Query.relatedNotes(null, { noteId: String(meaning._id) }, ctx(ALICE))).toEqual([]);
    expect(await Query.noteIndexStatus(null, {}, ctx(ALICE))).toMatchObject({ chunks: 0, model: 'mxbai-embed-large' });
  });

  test('the sweep re-queues every note; the indexer re-embeds them and the old chunks go', async () => {
    await libraryOnNomic();
    expect(await sweepIndex()).toEqual({ removed: 0, requeued: 3 });
    expect(await Note.countDocuments({ embeddingState: 'stale' })).toBe(3);
    expect((await indexAll()).results).toEqual(['indexed', 'indexed', 'indexed']);
    expect(await NoteChunk.countDocuments({ model: 'nomic-embed-text' })).toBe(0);
    const chunks = await NoteChunk.find({}).lean();
    expect(chunks).toHaveLength(3);
    expect(chunks.every((c) => c.model === 'mxbai-embed-large' && c.vector.length === 1024)).toBe(true);
    // Settled: a second sweep has nothing to do.
    expect(await sweepIndex()).toEqual({ removed: 0, requeued: 0 });
    // A stray old-model row on a re-embedded note (a crash mid-write) is swept.
    await NoteChunk.create({ userId: ALICE, noteId: chunks[0].noteId, chunk: 7, vector: fakeVector('x', 768), model: 'nomic-embed-text' });
    expect(await sweepIndex()).toEqual({ removed: 1, requeued: 0 });
  });

  test('mid-backfill: keyword + the re-embedded notes, never an old-model vector, no best match', async () => {
    const { exact, meaning } = await libraryOnNomic();
    await sweepIndex();
    // Re-embed only the first in the queue (the oldest edit: Garage).
    expect((await runIndexerOnce({ now: LATER(), maxNotes: 1 })).results).toEqual(['indexed']);
    expect(await NoteChunk.countDocuments({ noteId: exact._id, model: 'mxbai-embed-large' })).toBe(1);

    const rows = await Query.searchNotes(null, { q: 'garage door opener', hybrid: true }, ctx(ALICE));
    // The chamberlain note still has only nomic vectors: it must not be a meaning hit.
    expect(rows.map((r) => String(r._id))).not.toContain(String(meaning._id));
    expect(rows[0]).toMatchObject({ matchedBy: 'both', bestMatch: false });

    // The rest catch up, and the best match comes back.
    await indexAll();
    const after = await Query.searchNotes(null, { q: 'garage door opener', hybrid: true }, ctx(ALICE));
    expect(after.map((r) => String(r._id))).toContain(String(meaning._id));
    expect(await NoteChunk.countDocuments({ model: 'nomic-embed-text' })).toBe(0);
  });
});

// ── 5. relatedNotes ────────────────────────────────────────────────────────
describe('relatedNotes', () => {
  test('nearest notes, never itself, a deleted note, or another user’s', async () => {
    const a = await md(ALICE, 'Garage', 'garage door opener');
    const b = await md(ALICE, 'Chamberlain', 'chamberlain remote');
    const gone = await md(ALICE, 'Old opener', 'garage opener remote');
    const c = await md(ALICE, 'Remote', 'door remote');
    await md(ALICE, 'Bread', 'sourdough flour');
    await md(BOB, 'Bob garage', 'garage chamberlain opener remote');
    await indexAll();
    await Mutation.deleteNote(null, { id: String(gone._id) }, ctx(ALICE));

    const rel = await Query.relatedNotes(null, { noteId: String(a._id) }, ctx(ALICE));
    expect(rel.map((r) => r.id).sort()).toEqual([String(b._id), String(c._id)].sort());
    const chamberlain = rel.find((r) => r.id === String(b._id));
    expect(chamberlain).toMatchObject({ title: 'Chamberlain', type: 'markdown' });
    expect(chamberlain.score).toBeGreaterThan(0.6);
    expect(chamberlain.snippet).toBe('chamberlain remote');

    // Deleted behind the resolver's back, with the vectors still cached: the
    // re-read through Note drops it.
    await Note.deleteOne({ _id: b._id });
    const after = await Query.relatedNotes(null, { noteId: String(a._id) }, ctx(ALICE));
    expect(after.map((r) => r.id)).toEqual([String(c._id)]);
  });

  test("another user's note id gives nothing; an unindexed note gives nothing", async () => {
    const bobs = await md(BOB, 'Bob garage', 'garage');
    await md(ALICE, 'Garage', 'garage');
    await indexAll();
    expect(await Query.relatedNotes(null, { noteId: String(bobs._id) }, ctx(ALICE))).toEqual([]);
    const fresh = await md(ALICE, 'New', 'garage opener');
    expect(await Query.relatedNotes(null, { noteId: String(fresh._id) }, ctx(ALICE))).toEqual([]);
    expect(await Query.relatedNotes(null, { noteId: 'nope' }, ctx(ALICE))).toEqual([]);
  });
});
