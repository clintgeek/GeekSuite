/**
 * semantic.js — meaning-based search and related notes, over the vectors the
 * indexer (`indexer.js`) stored in `noteChunks`.
 *
 * Nothing here sends note text anywhere. The one outbound call is embedding
 * the user's QUERY, through `embeddings.js`, to the local service — and when
 * that service is down or slow, search quietly becomes keyword-only.
 *
 * ## Hybrid search, fused by Reciprocal Rank Fusion
 *
 * Two ranked lists: Mongo `$text` (exact words — a serial, a name, a part
 * number) and vector similarity (meaning — "garage fix" finds the note about
 * the Chamberlain opener). RRF scores each note Σ weight / (k + rank) over the
 * lists it appears in; ranks, not raw scores, so a textScore and a cosine
 * never have to be put on one scale. k = 60 (the paper's constant). Keyword
 * weight 1.0, vector weight 0.8, and a tie goes to the keyword hit: the same
 * rank in both lists means the note with the typed words comes first. A note
 * in both lists beats a note in one.
 *
 * ## Which hits count — the weak-hit cuts
 *
 * Keyword: `$text` matches any shared word, so a long question drags in
 * every note with "have" or "day" in it. A keyword hit under
 * KEYWORD_MIN_RATIO (40%) of the top textScore is dropped; the top one always
 * stays (`selectKeywordHits`). Chef's "What auth credentials do I have for
 * GameGeek?": 2.23 / 1.84 / 0.50 / 0.50 / 0.50 → the 0.50s go, 1.84 stays.
 *
 * Vector: every note is "similar" to every query at some level, so a hit must
 * clear the model's `floor` AND sit within `gap` of the best hit — relative,
 * because how high the best hit scores varies by query far more than how far
 * junk sits below it. The numbers live in the model table
 * (`embeddings.js`). mxbai-embed-large, calibrated live 2026-10-01 on Chef's
 * library (34 notes, 96 passages, 13 queries):
 *   - true hits 0.57–0.76 (meds 0.720, boat 0.762, 401(k) 0.656, keyboard
 *     remap 0.673, GameGeek auth 0.722, Usenet 0.598, smart-plug board 0.569);
 *   - junk under the true hits at 0.38–0.56, with long notes (12–13
 *     passages) the usual 0.52–0.56 junk — the best of many passages is a
 *     high-water mark of noise;
 *   - nonsense ("quantum chromodynamics") tops out at 0.496.
 *   floor 0.55 keeps nonsense out and "newsgroup downloads" to Usenet alone
 *   (next 0.548); gap 0.08 cuts "retirement savings" to the 401(k) note
 *   (gap 0.12 let four 0.54–0.56 long work notes in) while "how do I log
 *   into the server" keeps its four real hits at 0.58–0.63.
 * nomic-embed-text keeps its 2026-09-30 numbers (floor 0.55, gap 0.06).
 *
 * ## Best match
 *
 * After fusion, one note may be marked `best` and put first (`pickBestMatch`
 * has the rule). The data behind the margins (vector #1 minus vector #2):
 * clear wins led by 0.098–0.324 (401(k) 0.098, GameGeek 0.108, keyboard
 * remap 0.122, meds 0.281, boat 0.324); the in-between cases by 0.066–0.068
 * (the PIP note for "employee who is underperforming", the card-campaign
 * plan for "launching the debit card program"); near-ties by 0.024–0.050
 * (server login 0.024, partner-bank people 0.049, Usenet 0.050). So:
 *   - meaning alone: a lead of 0.08 and a score of at least 0.60 (every
 *     clear win scored 0.65+); the in-between cases do not get it;
 *   - agreement (the keyword #1 is the same note): a lead of 0.04. Usenet
 *     (both lists' #1, 0.050) and the card plan (both #1, 0.068) get it; the
 *     bank query's lists disagree, and server login's lead is 0.024.
 * Everything else keeps its RRF order below it.
 *
 * Long notes get no extra weight: a note's vector score is its single best
 * passage (never a sum), each list names a note once, and Related compares a
 * centroid. The high-water effect above is why the floor sits at 0.55.
 *
 * Related notes use the model's `relatedMin`: note-to-note similarity runs
 * higher than query-to-note. mxbai 0.70 (same-topic pairs 0.70–0.90 —
 * the two Phone Contents notes 0.827, the hiring notes 0.80; unrelated pairs
 * up to 0.69, again mostly a long note); nomic 0.65.
 *
 * ## Brute force, and where it stops being fine
 *
 * Cosine in Node over every chunk the user has — vectors are unit length, so
 * it is a dot product. 2 000 notes × 3 chunks × 1024 floats is ~25 MB as
 * Float32Array and ~5 ms per query. The user's vectors are cached in memory
 * (per user, TTL + invalidated by every index write and delete). Past roughly
 * 50 000 chunks per user (≈150 MB, ~100 ms a query) this wants a real ANN
 * index (Atlas vector search, or pgvector next door) instead.
 */

import mongoose from 'mongoose';
import Note from './models/Note.js';
import NoteChunk from './models/NoteChunk.js';
import { embedTexts, embeddingsConfig, modelSpec, EmbeddingsUnavailableError } from './embeddings.js';

// ── knobs ──────────────────────────────────────────────────────────────────
export const RRF_K = 60;
export const KEYWORD_WEIGHT = 1.0;
export const VECTOR_WEIGHT = 0.8;
/** Keyword hits under this share of the top textScore are dropped (`selectKeywordHits`). */
export const KEYWORD_MIN_RATIO = 0.4;
export const SEARCH_MAX_VECTOR_HITS = 20;
/** A search waits this long for the query's vector before going keyword-only. */
export const QUERY_EMBED_TIMEOUT_MS = 5000;
export const RELATED_DEFAULT_LIMIT = 5;
export const RELATED_MAX_LIMIT = 20;
const VECTOR_CACHE_TTL_MS = 10 * 60 * 1000;
const VECTOR_CACHE_USERS = 32;
const QUERY_CACHE_SIZE = 200;
const WHY_CHARS = 180;

// ── service health, shared with the indexer ────────────────────────────────
const BACKOFF_BASE_MS = 30 * 1000;
const BACKOFF_MAX_MS = 15 * 60 * 1000;
const health = { downUntil: 0, failures: 0, lastError: null, lastOkAt: null };

/** Record a failure; each consecutive one doubles the pause (30 s → 15 min). */
export function markServiceDown(err, now = Date.now()) {
  health.failures += 1;
  const pause = Math.min(BACKOFF_BASE_MS * 2 ** (health.failures - 1), BACKOFF_MAX_MS);
  health.downUntil = now + pause;
  health.lastError = String(err?.message || err).slice(0, 300);
  return pause;
}
export function markServiceUp(now = Date.now()) {
  health.failures = 0;
  health.downUntil = 0;
  health.lastOkAt = new Date(now);
}
export const serviceIsDown = (now = Date.now()) => health.downUntil > now;
export const serviceHealth = () => ({ ...health });
/** Tests only. */
export function _resetSemanticState() {
  health.downUntil = 0; health.failures = 0; health.lastError = null; health.lastOkAt = null;
  vectorCache.clear();
  queryCache.clear();
}

// ── the per-user vector cache ──────────────────────────────────────────────
const vectorCache = new Map(); // `${userId}\u0000${model}` -> { at, rows }

export function invalidateUserVectors(userId) {
  const prefix = `${ String(userId) }\u0000`;
  for (const key of [...vectorCache.keys()]) if (key.startsWith(prefix)) vectorCache.delete(key);
}

/** Every current-model chunk the user has: `{ noteId, chunk, text, vec: Float32Array }`. */
export async function userVectors(userId, now = Date.now()) {
  return (await userVectorState(userId, now)).rows;
}

/**
 * `{ rows, backfilling }`. `backfilling` is true while any of the user's
 * chunks are another model's — i.e. a model change is still being
 * re-embedded, so some notes have no current vector yet. Search then does
 * not claim a best match: the note that would have beaten it may simply not
 * be re-embedded yet. It clears itself — re-embedding a note replaces its
 * old-model rows, and the sweep removes strays.
 */
export async function userVectorState(userId, now = Date.now()) {
  const { model } = embeddingsConfig();
  const key = `${ String(userId) }\u0000${ model }`;
  const hit = vectorCache.get(key);
  if (hit && now - hit.at < VECTOR_CACHE_TTL_MS) {
    vectorCache.delete(key); vectorCache.set(key, hit); // LRU touch
    return hit;
  }
  // The current model's chunks only. Another model's vectors are a different
  // space (even a different width): a dot product across them is noise. While
  // the indexer re-embeds after a model change, a note still on the old model
  // simply has no vector yet — keyword search still finds it.
  const docs = await NoteChunk.find(
    { userId: new mongoose.Types.ObjectId(String(userId)), model },
    { noteId: 1, chunk: 1, text: 1, vector: 1 },
  ).lean();
  const rows = docs.map((d) => ({
    noteId: String(d.noteId),
    chunk: d.chunk,
    text: d.text || '',
    vec: Float32Array.from(d.vector),
  }));
  const backfilling = Boolean(await NoteChunk.exists({
    userId: new mongoose.Types.ObjectId(String(userId)), model: { $ne: model },
  }));
  const entry = { at: now, rows, backfilling };
  vectorCache.set(key, entry);
  while (vectorCache.size > VECTOR_CACHE_USERS) vectorCache.delete(vectorCache.keys().next().value);
  return entry;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

/** Best chunk per note against one vector, highest first. */
export function bestChunkPerNote(rows, vec, { exclude = null } = {}) {
  const best = new Map();
  for (const row of rows) {
    if (row.noteId === exclude) continue;
    const score = dot(row.vec, vec);
    const prev = best.get(row.noteId);
    if (!prev || score > prev.score) best.set(row.noteId, { noteId: row.noteId, score, text: row.text, chunk: row.chunk });
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/**
 * Floor + gap-from-best, then a count cap. Input sorted best first. The floor
 * and gap are the configured model's (`modelSpec().search`) unless given.
 */
export function selectVectorHits(ranked, { min, gap, max = SEARCH_MAX_VECTOR_HITS } = {}) {
  if (!ranked.length) return [];
  const scale = modelSpec().search;
  const cutoff = Math.max(min ?? scale.floor, ranked[0].score - (gap ?? scale.gap));
  return ranked.filter((h) => h.score >= cutoff).slice(0, max);
}

/**
 * The keyword weak-hit cut. `$text` scores every note that shares ANY word
 * with the query, so "What auth credentials do I have for GameGeek?" matched
 * GameGeek API Auth at 2.23, Google Cloud SDK Info at 1.84, and three notes
 * at 0.50 for one common word each — the "random-ish" tail Chef saw. A hit
 * scoring under KEYWORD_MIN_RATIO of the best one is dropped; the best one
 * always stays. Input sorted best first (`score` = textScore).
 */
export function selectKeywordHits(rows, { ratio = KEYWORD_MIN_RATIO } = {}) {
  if (!rows.length) return [];
  const cutoff = (rows[0].score || 0) * ratio;
  return rows.filter((r, i) => i === 0 || (r.score || 0) >= cutoff);
}

/**
 * Is there one clear answer? Returns that note's id, or null. Only ever the
 * vector #1, judged by its LEAD: its score minus the vector runner-up's (the
 * next note by raw score, before the floor/gap cut). Two ways to win:
 *
 *   - agreement: it is also the top keyword hit, and leads by
 *     `bestAgreeMargin` (0.04 for mxbai). Two independent signals pick it.
 *   - meaning alone: it scores at least `bestMin` (0.60) and leads by
 *     `bestMargin` (0.08). This wins even when its words are not the query's
 *     — "what pills do I take every day" has no keyword hit on the meds
 *     note at all, while "take", "every" and "day" matched 16 other notes
 *     (live, 2026-10-01). The old ranking put the meds note 17th of 17;
 *     with the keyword cut alone it was still 6th of 6, under five long
 *     work notes.
 *
 * Never a best match when there are no vector hits (textScore has no scale
 * that says how clear a win is), and never while `backfilling` — mid
 * re-index the note that would have beaten #1 may just not have a vector yet.
 */
export function pickBestMatch({ keywordTopId = null, vectorHits, runnerUpScore = null, backfilling = false, scale }) {
  if (backfilling || !vectorHits?.length) return null;
  const s = scale ?? modelSpec().search;
  const top = vectorHits[0];
  const lead = runnerUpScore === null || runnerUpScore === undefined ? Infinity : top.score - runnerUpScore;
  if (keywordTopId !== null && keywordTopId === top.noteId && lead >= s.bestAgreeMargin) return top.noteId;
  if (top.score >= s.bestMin && lead >= s.bestMargin) return top.noteId;
  return null;
}

/**
 * Weighted Reciprocal Rank Fusion.
 *
 * @param {{ ids: string[], weight?: number }[]} lists ranked best first
 * @returns {{ id: string, score: number, ranks: (number|null)[] }[]}
 *   best first; ties go to the better rank in the EARLIER list (keyword).
 */
export function rrfFuse(lists, k = RRF_K) {
  const acc = new Map();
  lists.forEach(({ ids, weight = 1 }, li) => {
    ids.forEach((id, rank) => {
      const key = String(id);
      let entry = acc.get(key);
      if (!entry) {
        entry = { id: key, score: 0, ranks: lists.map(() => null) };
        acc.set(key, entry);
      }
      if (entry.ranks[li] !== null) return; // a list names a note once
      entry.ranks[li] = rank;
      entry.score += weight / (k + rank + 1);
    });
  });
  const tieKey = (e) => e.ranks.map((r) => (r === null ? Infinity : r));
  return [...acc.values()].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ta = tieKey(a); const tb = tieKey(b);
    for (let i = 0; i < ta.length; i += 1) if (ta[i] !== tb[i]) return ta[i] - tb[i];
    return 0;
  });
}

/**
 * The whole hybrid ranking, pure: keyword rows (`{ _id, score }`, textScore
 * order) and vector hits in, ordered `{ id, score, ranks, matchedBy, best }`
 * out. The keyword weak-hit cut, RRF for the order, and — when one note
 * clearly wins (`pickBestMatch`) — that note first, flagged `best`; the rest
 * keep their RRF order. With no vector hits it is the cut keyword list, in
 * textScore order, with no best match.
 */
export function rankHybrid({ keywordRows, vectorHits = [], runnerUpScore = null, backfilling = false }) {
  const keyword = selectKeywordHits(keywordRows);
  const fused = rrfFuse([
    { ids: keyword.map((n) => String(n._id)), weight: KEYWORD_WEIGHT },
    { ids: vectorHits.map((h) => h.noteId), weight: VECTOR_WEIGHT },
  ]);
  const best = pickBestMatch({
    keywordTopId: keyword.length ? String(keyword[0]._id) : null, vectorHits, runnerUpScore, backfilling,
  });
  if (best) {
    const at = fused.findIndex((f) => f.id === best);
    if (at > 0) fused.unshift(...fused.splice(at, 1));
  }
  return fused.map((f) => {
    const kw = f.ranks[0] !== null;
    const vec = f.ranks[1] !== null;
    return {
      id: f.id,
      score: f.score,
      ranks: f.ranks,
      matchedBy: kw && vec ? 'both' : kw ? 'keyword' : 'meaning',
      best: f.id === best,
    };
  });
}

/** A chunk's passage without the title line the first chunk opens with. */
export function whyExcerpt(text, title) {
  let body = String(text || '');
  const t = String(title || '').trim();
  if (t && body.startsWith(t)) body = body.slice(t.length);
  body = body.replace(/\s+/g, ' ').trim();
  if (!body) return null;
  return body.length > WHY_CHARS ? `${ body.slice(0, WHY_CHARS).replace(/\s+\S*$/, '') }…` : body;
}

// ── queries ────────────────────────────────────────────────────────────────
const queryCache = new Map(); // `${model}\u0000${q}` -> vector

// Exported for the catalog meaning-search (graphql/catalog/catalogSemantic.js),
// which shares this cache rather than keeping its own.
export async function queryVector(q) {
  const { model } = embeddingsConfig();
  const key = `${ model }\u0000${ q.trim().toLowerCase() }`;
  if (queryCache.has(key)) return queryCache.get(key);
  const [vec] = await embedTexts([q.trim()], { kind: 'query', timeoutMs: QUERY_EMBED_TIMEOUT_MS });
  const f32 = Float32Array.from(vec);
  queryCache.set(key, f32);
  while (queryCache.size > QUERY_CACHE_SIZE) queryCache.delete(queryCache.keys().next().value);
  return f32;
}

/**
 * The vector half of a search: the user's notes nearest the query, best chunk
 * each. `[]` — never a throw — when the service is down, slow, or the user has
 * nothing indexed, so the caller simply has no meaning hits.
 */
export async function vectorSearch({ userId, q, log }) {
  return (await vectorSearchRanked({ userId, q, log })).hits;
}

/**
 * `vectorSearch` plus what the best-match rule needs: the raw score of the
 * vector runner-up (the second note before the floor/gap cut — a cut-away #2
 * is exactly what makes #1 a clear win). `{ hits: [], runnerUpScore: null }`
 * whenever there are no vectors.
 */
export async function vectorSearchRanked({ userId, q, log }) {
  const none = { hits: [], runnerUpScore: null, backfilling: false };
  if (serviceIsDown()) return none;
  const { rows, backfilling } = await userVectorState(userId);
  if (!rows.length) return none;
  let vec;
  try {
    vec = await queryVector(q);
    markServiceUp();
  } catch (err) {
    if (err instanceof EmbeddingsUnavailableError) {
      markServiceDown(err);
      log?.warn?.({ err: err.message }, '[notegeek] query embedding failed; keyword-only search');
      return none;
    }
    throw err;
  }
  // A query vector of another width (a model change mid-cache) would make
  // every dot product meaningless; treat it as "no vectors".
  if (vec.length !== rows[0].vec.length) return none;
  const ranked = bestChunkPerNote(rows, vec);
  return { hits: selectVectorHits(ranked), runnerUpScore: ranked.length > 1 ? ranked[1].score : null, backfilling };
}

/**
 * Notes that read like this one: the centroid of the note's own chunks
 * against every other note's best chunk. Owner-scoped twice — the chunks are
 * the user's, and the survivors are re-read from `Note` with `userId`, which
 * also drops any note deleted since its chunks were cached.
 */
export async function relatedNotes({ userId, noteId, limit = RELATED_DEFAULT_LIMIT }) {
  const n = Math.max(1, Math.min(Number(limit) || RELATED_DEFAULT_LIMIT, RELATED_MAX_LIMIT));
  const rows = await userVectors(userId);
  const own = rows.filter((r) => r.noteId === String(noteId));
  if (!own.length) return [];
  const centroid = new Float32Array(own[0].vec.length);
  for (const r of own) for (let i = 0; i < centroid.length; i += 1) centroid[i] += r.vec[i];
  let norm = 0;
  for (let i = 0; i < centroid.length; i += 1) norm += centroid[i] * centroid[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < centroid.length; i += 1) centroid[i] /= norm;

  const ranked = bestChunkPerNote(rows, centroid, { exclude: String(noteId) })
    .filter((h) => h.score >= modelSpec().relatedMin)
    .slice(0, n * 2); // headroom for notes that turn out to be gone
  if (!ranked.length) return [];
  const notes = await Note.find(
    { userId, _id: { $in: ranked.map((h) => h.noteId) } },
    { title: 1, type: 1, updatedAt: 1 },
  ).lean();
  const byId = new Map(notes.map((note) => [String(note._id), note]));
  return ranked
    .filter((h) => byId.has(h.noteId))
    .slice(0, n)
    .map((h) => {
      const note = byId.get(h.noteId);
      return {
        id: h.noteId,
        title: note.title || '',
        type: note.type,
        updatedAt: note.updatedAt,
        score: Math.round(h.score * 1000) / 1000,
        snippet: whyExcerpt(h.text, note.title),
      };
    });
}

/** How much of the user's library is searchable by meaning. */
export async function indexStatus({ userId }) {
  const uid = new mongoose.Types.ObjectId(String(userId));
  const [states, chunks] = await Promise.all([
    Note.aggregate([
      { $match: { userId: uid } },
      { $group: { _id: { $ifNull: ['$embeddingState', 'stale'] }, n: { $sum: 1 } } },
    ]),
    // Searchable passages: the current model's (old ones are ignored).
    NoteChunk.countDocuments({ userId: uid, model: embeddingsConfig().model }),
  ]);
  const count = (s) => states.find((x) => x._id === s)?.n || 0;
  const total = states.reduce((sum, x) => sum + x.n, 0);
  const h = serviceHealth();
  return {
    total,
    indexed: count('indexed'),
    stale: count('stale'),
    failed: count('failed'),
    skipped: count('skipped'),
    chunks,
    model: embeddingsConfig().model,
    serviceAvailable: !(h.downUntil > Date.now()),
    lastError: h.lastError,
    lastOkAt: h.lastOkAt,
  };
}
