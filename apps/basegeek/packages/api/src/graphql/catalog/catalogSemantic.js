/**
 * catalogSemantic.js — meaning search and similarity over the catalog
 * vectors the indexer stores in `gamevectors` / `bookvectors` (MCP_SPEC
 * Stage 1b, D20–D22).
 *
 * Nothing here sends catalog text anywhere. The one outbound call is
 * embedding the caller's QUERY (or `q` blend text) through
 * `notegeek/embeddings.js` — the same local service, the same health state
 * (`serviceIsDown`/`markServiceDown`), so a down Ollama degrades everything
 * together instead of tripping twice.
 *
 * Scopes: books are one shared library (`scope = 'books'`); games are
 * per-household (`scope = householdId`). The per-scope vector cache mirrors
 * `userVectorState` — TTL plus explicit invalidation on every index write.
 */

import { embeddingsConfig, modelSpec, EmbeddingsUnavailableError } from '../notegeek/embeddings.js';
import {
  rrfFuse,
  selectVectorHits,
  queryVector,
  markServiceUp,
  markServiceDown,
  serviceIsDown,
  KEYWORD_WEIGHT,
  VECTOR_WEIGHT,
} from '../notegeek/semantic.js';
import { GameVector } from './models/GameVector.js';
import { BookVector } from './models/BookVector.js';

export const CATALOG_SEARCH_MAX_VECTOR_HITS = 20;
const VECTOR_CACHE_TTL_MS = 10 * 60 * 1000;
const VECTOR_CACHE_SCOPES = 64;

const KINDS = {
  book: { Vector: BookVector, scoped: false },
  game: { Vector: GameVector, scoped: true },
};

function kindSpec(kind) {
  const spec = KINDS[kind];
  if (!spec) throw new TypeError(`catalogSemantic: unknown kind '${ kind }'`);
  return spec;
}

// ── the per-scope vector cache ─────────────────────────────────────────────
const vectorCache = new Map(); // `${kind}\0${scope}\0${model}` -> { at, rows }

/** Drop every cached scope (the indexer calls this after writing). */
export function invalidateCatalogVectors() {
  vectorCache.clear();
}

export function invalidateCatalogScope(kind, scope) {
  const prefix = `${ kind }\u0000${ scope }`;
  for (const key of [...vectorCache.keys()]) if (key.startsWith(prefix)) vectorCache.delete(key);
}

/** Tests only. */
export function _resetCatalogState() {
  vectorCache.clear();
}

/**
 * Every current-model vector in one scope: `{ itemId, vec: Float32Array }`.
 * Old-model rows are a different space — ignored, never mixed in.
 */
export async function catalogVectors(kind, scope, now = Date.now()) {
  const spec = kindSpec(kind);
  const { model } = embeddingsConfig();
  const key = `${ kind }\u0000${ spec.scoped ? scope : '' }\u0000${ model }`;
  const hit = vectorCache.get(key);
  if (hit && now - hit.at < VECTOR_CACHE_TTL_MS) {
    vectorCache.delete(key); vectorCache.set(key, hit);
    return hit.rows;
  }
  const filter = { model };
  if (spec.scoped) filter.householdId = scope;
  const docs = await spec.Vector.find(filter, { itemId: 1, vector: 1 }).lean();
  const rows = docs.map((d) => ({ itemId: String(d.itemId), vec: Float32Array.from(d.vector) }));
  vectorCache.set(key, { at: now, rows });
  while (vectorCache.size > VECTOR_CACHE_SCOPES) vectorCache.delete(vectorCache.keys().next().value);
  return rows;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

/**
 * Hybrid catalog search: the caller's keyword rows (already tenant-scoped,
 * already ordered — title matches first) fused with the scope's nearest
 * vectors by RRF, same weights as note search. The floor/gap come from the
 * model's `catalogSearch` entry — UNCALIBRATED (D20). `[]`-vector side when
 * the service is down, so the answer is keyword-only like `searchNotes`.
 *
 * @returns {Promise<{ id: string, score: number, matchedBy: 'keyword'|'meaning'|'both' }[]>}
 */
export async function searchCatalog({ kind, scope, q, keywordRows = [], limit = 20, log } = {}) {
  const scale = modelSpec().catalogSearch;
  let vectorHits = [];
  if (!serviceIsDown()) {
    const rows = await catalogVectors(kind, scope);
    if (rows.length) {
      let vec;
      try {
        vec = await queryVector(q);
        markServiceUp();
      } catch (err) {
        if (err instanceof EmbeddingsUnavailableError) {
          markServiceDown(err);
          log?.warn?.({ err: err.message }, `[catalog] query embedding failed; keyword-only ${ kind } search`);
        } else {
          throw err;
        }
      }
      if (vec && vec.length === rows[0].vec.length) {
        const ranked = rows
          .map((r) => ({ noteId: r.itemId, score: dot(r.vec, vec) }))
          .sort((a, b) => b.score - a.score);
        vectorHits = selectVectorHits(ranked, { min: scale.floor, gap: scale.gap, max: CATALOG_SEARCH_MAX_VECTOR_HITS });
      }
    }
  }

  const fused = rrfFuse([
    { ids: keywordRows.map((r) => String(r._id ?? r.id)), weight: KEYWORD_WEIGHT },
    { ids: vectorHits.map((h) => h.noteId), weight: VECTOR_WEIGHT },
  ]);
  return fused.slice(0, limit).map((f) => {
    const kw = f.ranks[0] !== null;
    const vec = f.ranks[1] !== null;
    return { id: f.id, score: f.score, matchedBy: kw && vec ? 'both' : kw ? 'keyword' : 'meaning' };
  });
}

/**
 * Embed a short mood/steering phrase through the LOCAL query embedder —
 * guarded so a down service degrades to "no mood term" instead of throwing.
 * `null` means "no mood vector": the service is down, the call failed, or
 * the text was empty. What-Next (WHAT_NEXT_SPEC X4) and `recommendCatalog`
 * both steer with this; the text itself still reaches the model.
 */
export async function moodQueryVector(mood, log) {
  if (!mood || !String(mood).trim() || serviceIsDown()) return null;
  try {
    const vec = await queryVector(String(mood));
    markServiceUp();
    return vec;
  } catch (err) {
    if (!(err instanceof EmbeddingsUnavailableError)) throw err;
    markServiceDown(err);
    log?.warn?.({ err: err.message }, '[catalog] mood embedding failed');
    return null;
  }
}

/**
 * The X3 shortlist: NOT a centroid. Per seed, the candidates are ranked by
 * dot(candidate, seed) — or `(dot(candidate, seed) + dot(candidate, mood)) / 2`
 * when a mood vector is given — then one candidate is taken from each seed's
 * list in turn, in seed order, skipping duplicates, until `size`. Each entry
 * keeps `because`: the seed whose list it came through. Seeds without a
 * vector in the scope are dropped before ranking; every seed id is excluded
 * from every list (a seed never recommends itself or a sibling seed).
 *
 * @returns {Promise<{ id: string, because: string, score: number }[]>}
 */
export async function shortlistFromSeeds({ kind, scope, seedIds, candidateIds = null, moodVec = null, size = 20 }) {
  const rows = await catalogVectors(kind, scope);
  const byId = new Map(rows.map((r) => [r.itemId, r.vec]));
  const dims = rows[0]?.vec.length ?? 0;
  if (moodVec && moodVec.length !== dims) moodVec = null;

  const seeds = [...new Set((seedIds || []).map(String))].filter((id) => byId.has(id));
  const seedSet = new Set(seeds);
  const cands = candidateIds ? new Set([...candidateIds].map(String)) : null;

  const lists = seeds.map((seedId) => {
    const sVec = byId.get(seedId);
    const ranked = [];
    for (const row of rows) {
      if (seedSet.has(row.itemId)) continue;
      if (cands && !cands.has(row.itemId)) continue;
      const base = dot(row.vec, sVec);
      ranked.push({ id: row.itemId, because: seedId, score: moodVec ? (base + dot(row.vec, moodVec)) / 2 : base });
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  });

  const out = [];
  const seen = new Set();
  for (let depth = 0; out.length < size; depth += 1) {
    let advanced = false;
    for (const list of lists) {
      const hit = list[depth];
      if (hit === undefined) continue;
      advanced = true;
      if (seen.has(hit.id)) continue;
      seen.add(hit.id);
      out.push(hit);
      if (out.length >= size) break;
    }
    if (!advanced) break;
  }
  return out;
}

/**
 * "Items like these": the X3 round-robin shortlist over the caller's seeds
 * (X11 — the same implementation whatNext uses). `q`, when given, is a mood:
 * embedded locally and averaged into every seed's ranking. Seeds are excluded
 * from the result; `closestId` is the `because` seed.
 *
 * Stored vectors are enough for a seeds-only call — the service is needed
 * ONLY to embed `q`. So:
 *   - the scope has no vectors at all   → `{ items: [], reason: 'not_indexed' }`
 *   - no usable seed vectors and no q   → `{ items: [], reason: 'no_seeds' }`
 *   - q given but the service is down   → `{ items: [], reason: 'embeddings_unavailable' }`
 *   - seeds only, service down          → still answers.
 *
 * @returns {Promise<{ items: { id, score, closestId }[], reason: string|null }>}
 */
export async function recommendCatalog({ kind, scope, seeds = [], candidateIds = null, q = null, limit = 10, log } = {}) {
  const rows = await catalogVectors(kind, scope);
  const byId = new Map(rows.map((r) => [r.itemId, r.vec]));
  // Nothing indexed yet is a different answer from "you have no taste seeds":
  // the indexer may just not have reached this scope.
  if (!rows.length) return { items: [], reason: 'not_indexed' };

  // Heavier seeds first: under round-robin, seed order is the queue order.
  const seedIds = seeds
    .slice()
    .sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))
    .map((s) => String(s.id))
    .filter((id) => byId.has(id));

  let moodVec = null;
  const hasQ = Boolean(q && String(q).trim());
  if (hasQ) moodVec = await moodQueryVector(q, log);

  if (!seedIds.length && !moodVec) {
    return { items: [], reason: hasQ ? 'embeddings_unavailable' : 'no_seeds' };
  }

  let ranked;
  if (seedIds.length) {
    ranked = await shortlistFromSeeds({ kind, scope, seedIds, candidateIds, moodVec, size: limit });
  } else {
    // q only: one list ranked by the mood vector itself.
    const cands = candidateIds ? new Set([...candidateIds].map(String)) : null;
    ranked = rows
      .filter((r) => !cands || cands.has(r.itemId))
      .map((r) => ({ id: r.itemId, because: null, score: dot(r.vec, moodVec) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  return {
    items: ranked.map((r) => ({ id: r.id, score: Math.round(r.score * 1000) / 1000, closestId: r.because ?? null })),
    reason: null,
  };
}
