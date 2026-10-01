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
 * ## Which vector hits count
 *
 * Every note is "similar" to every query at some level, so a vector hit must
 * clear a floor (SEARCH_MIN_SCORE) AND be near the best hit (within
 * SEARCH_SCORE_GAP of it). Calibrated on the live service 2026-09-30
 * (nomic-embed-text, the harness fixture notes): true matches scored
 * 0.59–0.71 ("cookie baking" → the cookie recipe 0.705, "how to renew the TLS
 * certificate" → the nginx cert note 0.691), unrelated pairs 0.48–0.57, and
 * "quantum chromodynamics" topped out at 0.526 — under the 0.55 floor.
 *
 * Related notes use a higher floor (RELATED_MIN_SCORE 0.65): note-to-note
 * similarity runs higher than query-to-note, and two dev notes sat at
 * 0.60–0.64 without having much to do with each other.
 *
 * ## Brute force, and where it stops being fine
 *
 * Cosine in Node over every chunk the user has — vectors are unit length, so
 * it is a dot product. 2 000 notes × 3 chunks × 768 floats is ~18 MB as
 * Float32Array and ~5 ms per query. The user's vectors are cached in memory
 * (per user, TTL + invalidated by every index write and delete). Past roughly
 * 50 000 chunks per user (≈150 MB, ~100 ms a query) this wants a real ANN
 * index (Atlas vector search, or pgvector next door) instead.
 */

import mongoose from 'mongoose';
import Note from './models/Note.js';
import NoteChunk from './models/NoteChunk.js';
import { embedTexts, embeddingsConfig, EmbeddingsUnavailableError } from './embeddings.js';

// ── knobs ──────────────────────────────────────────────────────────────────
export const RRF_K = 60;
export const KEYWORD_WEIGHT = 1.0;
export const VECTOR_WEIGHT = 0.8;
export const SEARCH_MIN_SCORE = 0.55;
export const SEARCH_SCORE_GAP = 0.06;
export const SEARCH_MAX_VECTOR_HITS = 20;
/** A search waits this long for the query's vector before going keyword-only. */
export const QUERY_EMBED_TIMEOUT_MS = 5000;
export const RELATED_MIN_SCORE = 0.65;
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
const vectorCache = new Map(); // userId -> { at, rows }

export function invalidateUserVectors(userId) {
  vectorCache.delete(String(userId));
}

/** Every chunk the user has: `{ noteId, chunk, text, vec: Float32Array }`. */
export async function userVectors(userId, now = Date.now()) {
  const key = String(userId);
  const hit = vectorCache.get(key);
  if (hit && now - hit.at < VECTOR_CACHE_TTL_MS) {
    vectorCache.delete(key); vectorCache.set(key, hit); // LRU touch
    return hit.rows;
  }
  const docs = await NoteChunk.find(
    { userId: new mongoose.Types.ObjectId(key) },
    { noteId: 1, chunk: 1, text: 1, vector: 1 },
  ).lean();
  const rows = docs.map((d) => ({
    noteId: String(d.noteId),
    chunk: d.chunk,
    text: d.text || '',
    vec: Float32Array.from(d.vector),
  }));
  vectorCache.set(key, { at: now, rows });
  while (vectorCache.size > VECTOR_CACHE_USERS) vectorCache.delete(vectorCache.keys().next().value);
  return rows;
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

/** Floor + gap-from-best, then a count cap. Input sorted best first. */
export function selectVectorHits(ranked, {
  min = SEARCH_MIN_SCORE, gap = SEARCH_SCORE_GAP, max = SEARCH_MAX_VECTOR_HITS,
} = {}) {
  if (!ranked.length) return [];
  const cutoff = Math.max(min, ranked[0].score - gap);
  return ranked.filter((h) => h.score >= cutoff).slice(0, max);
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

async function queryVector(q) {
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
  if (serviceIsDown()) return [];
  const rows = await userVectors(userId);
  if (!rows.length) return [];
  let vec;
  try {
    vec = await queryVector(q);
    markServiceUp();
  } catch (err) {
    if (err instanceof EmbeddingsUnavailableError) {
      markServiceDown(err);
      log?.warn?.({ err: err.message }, '[notegeek] query embedding failed; keyword-only search');
      return [];
    }
    throw err;
  }
  return selectVectorHits(bestChunkPerNote(rows, vec));
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
    .filter((h) => h.score >= RELATED_MIN_SCORE)
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
    NoteChunk.countDocuments({ userId: uid }),
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
