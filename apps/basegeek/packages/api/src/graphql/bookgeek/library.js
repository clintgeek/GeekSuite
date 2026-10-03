/**
 * bookgeek/library.js — the two AI-assisted library helpers (AI idea #4,
 * `DOCS/AI_IDEAS.md`; stream R117).
 *
 *   whatNext(limit)          "what should I read next" — five owned-but-unfinished
 *                            books with a one-line reason each.
 *   draftBookMetadata(id)    a description and tags for a book whose Calibre /
 *                            Goodreads import came in without them.
 *
 * Both go through `services/aiFeatureRunner.js` as `{ app: 'bookgeek',
 * feature: 'library' }`, so they SHARE one routing row, one per-user daily cap
 * and one provenance shape. Neither writes anything: `whatNext` returns ids the
 * client already knows how to open, and `draftBookMetadata` returns a draft the
 * user edits and saves through the ordinary `updateBook` mutation.
 *
 * ## The candidate set is computed, never asked
 *
 * The model is never asked "which of his books are unread" — it is handed the
 * answer. `candidateBooks()` runs the same not-finished predicate the `unread`
 * shelf uses (`resolvers.js`'s `shelfMatch`), intersected with "owns it or has
 * put it on a shelf", newest-added first, capped at 60. The model may only
 * rank and explain what it is given. Candidates travel as short labels
 * ("c1"…"cN"), mapped back after the call; `salvagePicks()` keeps the picks
 * it can map and drops the rest — an answer with no salvageable pick settles
 * on the fallback rather than reaching the client.
 *
 * ## What leaves the box
 *
 * `whatNext`: per candidate — title, authors, tags, page count, shelf and the
 * date it was added; plus the last 20 finished titles with the rating the user
 * gave them. No reviews, no reading progress, no file paths, no per-user
 * profile data (Kindle address, device word). `draftBookMetadata`: one book's
 * title, authors, publisher and year, plus the *names* of the tags this library
 * already uses.
 *
 * ## General knowledge, and the one place it is allowed
 *
 * `whatNext` forbids it — the ranking must come from the user's own data or it
 * is a book blog, not a shelf. `draftBookMetadata` requires it: filling a gap
 * an import left is exactly a question about the world. The system prompt
 * bounds it in the way that matters for a library — back-cover level only, no
 * plot beyond the setup, no twist, no ending.
 *
 * ## Opt-in
 *
 * `libraryAssistant` on the caller's `appPreferences.bookgeek` (the same store
 * `defaultShelfFilter` already lives in — `packages/user`'s `useAppPreferences`
 * writes it through `PATCH /api/users/preferences/bookgeek`). Default off. When
 * it is off the query still answers, with the deterministic fallback and
 * `provenance.reason = 'disabled'` — no model is called. The client does not
 * call it at all when the switch is off; the server-side check is the one that
 * counts.
 */

import logger from '../../lib/logger.js';
import { runAIFeature } from '../../services/aiFeatureRunner.js';
import { Book } from './models/book.js';
import { catalogVectors, shortlistFromSeeds, moodQueryVector } from '../catalog/catalogSemantic.js';
import { salvagePicks, shortId } from '../catalog/salvagePicks.js';

export const LIBRARY_APP = 'bookgeek';
export const LIBRARY_FEATURE = 'library';

/** Shared by both queries — they are one routing row and one counter. */
export const LIBRARY_DAILY_CAP = 20;

export const MAX_CANDIDATES = 60;
export const MAX_FINISHED = 20;
export const MAX_PICKS = 20;
export const MAX_LIBRARY_TAGS = 200;
export const MAX_DRAFT_TAGS = 8;
/** The model may coin this many tags the library has never used. */
export const MAX_NEW_TAGS = 2;
export const MAX_DESCRIPTION_CHARS = 1200;
export const MAX_WHY_CHARS = 160;
/** Live calls run 3–6 s; the default 6 s cut a mood call on the wire. */
export const WHAT_NEXT_TIMEOUT_MS = 12000;
/** Mood text in a fallback `why` is capped, like every other borrowed phrase. */
export const MAX_MOOD_WHY_CHARS = 40;

// ---------------------------------------------------------------------------
// The computed halves
// ---------------------------------------------------------------------------

/**
 * "Finished" in bookgeek's own terms — the four signals `shelfMatch('unread')`
 * excludes. `abandoned` counts as finished-with: a book you put down is not a
 * book to be handed back to you as a suggestion.
 */
const FINISHED_SIGNALS = [
  { shelf: 'read' },
  { shelf: 'abandoned' },
  { readCount: { $gt: 0 } },
  { dateFinished: { $exists: true, $ne: null } },
];

const NOT_FINISHED = { $nor: FINISHED_SIGNALS };

/** The JS twin of FINISHED_SIGNALS — for rows already in hand (WHAT_NEXT_SPEC X2). */
export function isFinishedBook(book) {
  return (
    book?.shelf === 'read' ||
    book?.shelf === 'abandoned' ||
    (book?.readCount ?? 0) > 0 ||
    book?.dateFinished != null
  );
}

/** Owned, or deliberately placed on a shelf. A row with neither is library noise. */
const IN_THE_LIBRARY = {
  $or: [{ owned: true }, { shelf: { $type: 'string', $nin: [''] } }],
};

const dayString = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const authorList = (book) =>
  (Array.isArray(book?.authors) ? book.authors : []).filter((a) => typeof a === 'string' && a.trim());

const tagList = (book) =>
  (Array.isArray(book?.tags) ? book.tags : []).filter((t) => typeof t === 'string' && t.trim());

/**
 * The books the model is allowed to choose from: in the library, not finished,
 * most recently added first, capped.
 *
 * Whole documents, not a projection: a pick carries its book back to the client
 * (`WhatNextPick.book`), and a projection here would silently null out whatever
 * field the shelf asks for next. What the *model* sees is a different and much
 * smaller thing — `whatNextContext()` builds it field by field.
 */
export async function candidateBooks(limit = MAX_CANDIDATES) {
  return Book.find({ $and: [IN_THE_LIBRARY, NOT_FINISHED] })
    .sort({ dateAdded: -1, _id: -1 })
    .limit(Math.max(1, limit))
    .lean();
}

export const SEED_COUNT = 5;
export const LOVED_SEEDS = 3;
export const RECENT_SEEDS = 2;
export const SHORTLIST_SIZE = 20;

/** The last N finished books, newest first, with the rating the user gave. */
export async function recentlyFinishedBooks(limit = MAX_FINISHED) {
  return Book.find({ $or: FINISHED_SIGNALS })
    .select('title authors rating dateFinished updatedAt')
    .sort({ dateFinished: -1, updatedAt: -1, _id: -1 })
    .limit(Math.max(1, limit))
    .lean();
}

/**
 * The five taste seeds (X2), chosen from rows the caller actually has a
 * record of:
 *
 *   loved  — rated ≥4, most recently finished first (never-finished last); 3.
 *   recent — the most recently finished not already chosen; 2.
 *
 * A short pool is topped up from the other to 5 total. Only ids with a
 * vector in the shared library scope count — `vectorIds` is filtered
 * against BEFORE taking, so an unindexed book never wastes a slot.
 *
 * Pure over rows (`{ id|_id, rating, dateFinished, updatedAt, finished }`);
 * the DB read lives in `whatNext`.
 */
export function pickBookSeeds(rows, vectorIds) {
  const idOf = (r) => String(r.id ?? r._id);
  const eligible = (Array.isArray(rows) ? rows : []).filter((r) => vectorIds.has(idOf(r)));
  const finishedDesc = (a, b) =>
    (b.dateFinished ? +new Date(b.dateFinished) : -Infinity) -
    (a.dateFinished ? +new Date(a.dateFinished) : -Infinity);
  const loved = eligible.filter((r) => (r.rating ?? 0) >= 4).sort(finishedDesc);
  const recent = eligible
    .filter((r) => r.finished)
    .sort((a, b) => finishedDesc(a, b) || (+new Date(b.updatedAt || 0)) - (+new Date(a.updatedAt || 0)));

  const chosen = [];
  const seen = new Set();
  const take = (pool, n, why) => {
    let left = n;
    for (const row of pool) {
      if (left <= 0) break;
      const id = idOf(row);
      if (seen.has(id)) continue;
      seen.add(id);
      chosen.push({ id, why, row });
      left -= 1;
    }
  };
  take(loved, LOVED_SEEDS, 'loved');
  take(recent, RECENT_SEEDS, 'recent');
  take(loved, SEED_COUNT - chosen.length, 'loved');
  take(recent, SEED_COUNT - chosen.length, 'recent');
  return chosen.slice(0, SEED_COUNT);
}

/** Every tag the library already uses, most-used first, capped. Names only. */
export async function libraryTags(limit = MAX_LIBRARY_TAGS) {
  const rows = await Book.aggregate([
    { $unwind: '$tags' },
    { $match: { tags: { $type: 'string', $nin: [''] } } },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: Math.max(1, limit) },
  ]);
  return rows.map((r) => r._id);
}

// ---------------------------------------------------------------------------
// whatNext
// ---------------------------------------------------------------------------

const WHAT_NEXT_SCHEMA = {
  name: 'BookWhatNext',
  description: 'A ranked short list of candidate book ids with a one-line reason each.',
  schema: {
    type: 'object',
    properties: {
      picks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            bookId: { type: 'string' },
            why: { type: 'string' },
          },
          required: ['bookId', 'why'],
          additionalProperties: false,
        },
      },
    },
    required: ['picks'],
    additionalProperties: false,
  },
};

export const WHAT_NEXT_SYSTEM_PROMPT = `You help one person choose what to read next from books they already own.

You are given JSON with:
- "candidates": books they own or have shelved and have NOT finished. Each has a
  short "id" label like "c3" (NOT a database id — copy it exactly), "title",
  "authors", "tags", "pages", "shelf" and "added" (the day it
  entered the library).
- "recentlyFinished": the books they most recently finished, with the rating they
  gave (0-5; 0 means they did not rate it).
- "limit": how many picks to return.
- "mood" (optional): a short phrase for what they feel like right now.
- "because" on a candidate names the loved or recently-finished book it most
  resembles — present only when their library has been meaning-indexed.

Rules, in order of importance:
1. Return at most "limit" picks, each a DISTINCT "bookId" copied verbatim from a
   candidate's "id" — a short label like "c3". Never invent an id. Never
   return an id that is not in "candidates". Fewer picks is fine; wrong ids
   are not.
2. Order them best first.
3. "why" is ONE short sentence, at most 90 characters, addressed to them, and
   grounded in the data you were given — an author or tag their ratings favour,
   a length that fits, the shelf they parked it on, how long it has been waiting.
   Mention the book named in "because" only when the resemblance is real and
   specific; otherwise say what makes this pick itself a good fit.
4. Do not use outside knowledge about these books. Do not describe the plot, do
   not summarise the story, and never reveal anything a reader would not want to
   know before starting.
5. When "mood" is given, honour it. When a candidate carries "because", that is
   the book they loved that this one resembles — leaning on it for "why" is
   good.`;

/** Average rating per author across the books they actually rated. */
function authorAverages(finished) {
  const totals = new Map();
  for (const book of finished) {
    const rating = Number(book?.rating);
    if (!Number.isFinite(rating) || rating <= 0) continue;
    for (const author of authorList(book)) {
      const key = author.trim();
      const entry = totals.get(key) || { sum: 0, n: 0 };
      entry.sum += rating;
      entry.n += 1;
      totals.set(key, entry);
    }
  }
  const out = new Map();
  for (const [author, { sum, n }] of totals) out.set(author, sum / n);
  return out;
}

const roundHalf = (n) => Math.round(n * 10) / 10;

/**
 * The deterministic ranking, and the reason it exists: a `whatNext` that is
 * blank when aiGeek is down is a feature the suite does not ship.
 *
 * Highest-rated author you have not finished first, then most recently added —
 * the candidates arrive in date-added order, so a stable sort by author score
 * alone produces exactly that.
 */
export function fallbackPicks(candidates, finished, limit) {
  const averages = authorAverages(finished);
  const scored = candidates.map((book, index) => {
    let best = null;
    for (const author of authorList(book)) {
      const avg = averages.get(author.trim());
      if (avg != null && (best === null || avg > best.avg)) best = { author: author.trim(), avg };
    }
    return { book, index, best };
  });

  scored.sort((a, b) => {
    const av = a.best ? a.best.avg : -1;
    const bv = b.best ? b.best.avg : -1;
    if (av !== bv) return bv - av;
    return a.index - b.index; // already newest-added first
  });

  return scored.slice(0, limit).map(({ book, best }) => ({
    bookId: String(book._id),
    why: best
      ? `You rated ${ best.author } ${ roundHalf(best.avg) } on average.`
      : 'One of the most recent additions to your library.',
  }));
}

/** The trimmed snapshot the model sees. Ids and titles, never bodies. */
export function whatNextContext(candidates, finished, limit, { becauseById = null, mood = null } = {}) {
  return {
    limit,
    mood: mood || null,
    candidates: candidates.map((book, index) => ({
      id: shortId(index),
      title: book.title || 'Untitled',
      authors: authorList(book),
      tags: tagList(book),
      pages: Number.isFinite(book.pageCount) ? book.pageCount : null,
      shelf: book.shelf || 'unread',
      added: dayString(book.dateAdded),
      ...(becauseById ? { because: becauseById.get(String(book._id)) ?? null } : {}),
    })),
    recentlyFinished: finished.map((book) => ({
      title: book.title || 'Untitled',
      authors: authorList(book),
      rating: Number.isFinite(book.rating) ? book.rating : 0,
    })),
  };
}

/**
 * The book document rides along on each pick. The candidates are already in
 * hand, so the alternative — the client asking `book(id:)` five more times —
 * would be five round trips to re-read rows this resolver just read.
 */
function normalizePicks(picks, limit, byId) {
  return (Array.isArray(picks) ? picks : [])
    .slice(0, limit)
    .map((pick) => {
      const bookId = String(pick.bookId);
      return {
        bookId,
        book: byId.get(bookId) || null,
        why: typeof pick.why === 'string' ? pick.why.trim().slice(0, MAX_WHY_CHARS) : null,
      };
    })
    .filter((pick) => pick.book);
}

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {number} opts.limit
 * @param {string} [opts.mood]    an optional steering phrase (WHAT_NEXT_SPEC X4)
 * @param {boolean} opts.enabled  the caller's opt-in switch
 */
export async function whatNext({ userId, limit, enabled, mood }) {
  const [candidates, finished, vecs] = await Promise.all([
    candidateBooks(MAX_CANDIDATES),
    recentlyFinishedBooks(MAX_FINISHED),
    catalogVectors('book', 'books'),
  ]);
  const byId = new Map(candidates.map((b) => [String(b._id), b]));

  // The vector path (WHAT_NEXT_SPEC): five taste seeds → the X3 round-robin
  // shortlist of ≤20 candidates, steered by the mood's vector. No vectors or
  // no seeds → today's shape: every candidate, newest-added first.
  const vectorIds = new Set(vecs.map((v) => v.itemId));
  let shortlist = null;
  let seeds = [];
  if (vectorIds.size) {
    const seedRows = await Book.find(
      { $or: [{ rating: { $gte: 4 } }, ...FINISHED_SIGNALS] },
      { title: 1, rating: 1, shelf: 1, readCount: 1, dateFinished: 1, updatedAt: 1 },
    ).lean();
    seeds = pickBookSeeds(
      seedRows.map((r) => ({ ...r, finished: isFinishedBook(r) })),
      vectorIds,
    );
    if (seeds.length) {
      const moodVec = await moodQueryVector(mood, logger);
      const short = await shortlistFromSeeds({
        kind: 'book',
        scope: 'books',
        seedIds: seeds.map((s) => s.id),
        candidateIds: new Set(byId.keys()),
        moodVec,
        size: SHORTLIST_SIZE,
      });
      if (short.length) shortlist = short;
    }
  }

  const modelCandidates = shortlist
    ? shortlist.map((s) => byId.get(s.id)).filter(Boolean)
    : candidates;
  const seedTitleById = new Map();
  const seedWhyById = new Map();
  for (const seed of seeds) {
    seedTitleById.set(seed.id, seed.row?.title ?? 'it');
    seedWhyById.set(seed.id, seed.why);
  }
  const becauseById = shortlist
    ? new Map(shortlist.map((s) => [s.id, seedTitleById.get(s.because) ?? null]))
    : null;

  const fallback = shortlist
    ? () => ({
        picks: shortlist.slice(0, limit).map((s) => {
          const seedWhy = seedWhyById.get(s.because);
          const title = seedTitleById.get(s.because) ?? 'it';
          const why = s.mood && mood
            ? `Fits your mood: "${ String(mood).slice(0, MAX_MOOD_WHY_CHARS) }".`
            : seedWhy === 'recent' ? `Because you read ${ title } recently.` : `Because you loved ${ title }.`;
          return { bookId: s.id, why };
        }),
      })
    : () => ({ picks: fallbackPicks(candidates, finished, limit) });

  let result;
  if (!modelCandidates.length) {
    result = { data: { picks: [] }, provenance: disabledProvenance('no_candidates') };
  } else if (!enabled) {
    result = { data: fallback(), provenance: disabledProvenance('disabled') };
  } else {
    // The model sees "c1".."cN" labels, never the real ids (a miscopied
    // 24-hex id used to sink the whole paid answer — the salvage keeps what
    // maps and tops the rest up from the deterministic list).
    const shortToReal = new Map(modelCandidates.map((b, i) => [shortId(i), String(b._id)]));
    let salvaged = null;
    result = await runAIFeature({
      app: LIBRARY_APP,
      feature: LIBRARY_FEATURE,
      userId,
      system: WHAT_NEXT_SYSTEM_PROMPT,
      user: JSON.stringify(whatNextContext(modelCandidates, finished, limit, { becauseById, mood })),
      schema: WHAT_NEXT_SCHEMA,
      validate: (data) => {
        salvaged = salvagePicks(data, shortToReal, 'bookId', limit);
        return salvaged.picks.length > 0;
      },
      fallback,
      maxTokens: 350,
      maxCallsPerDay: LIBRARY_DAILY_CAP,
      timeoutMs: WHAT_NEXT_TIMEOUT_MS,
    });

    if (result.provenance.source === 'model') {
      const salv = salvaged ?? salvagePicks(result.data, shortToReal, 'bookId', limit);
      if (!salv.picks.length) {
        result = { data: fallback(), provenance: { ...result.provenance, source: 'fallback', reason: 'invalid' } };
      } else {
        const seen = new Set(salv.picks.map((p) => p.id));
        const topUps = fallback().picks.filter((p) => !seen.has(p.bookId)).slice(0, Math.max(0, limit - salv.picks.length));
        if (salv.stats.returned !== salv.stats.kept || topUps.length) {
          // Counts only — never ids or titles.
          logger.warn(
            { app: LIBRARY_APP, feature: LIBRARY_FEATURE, ...salv.stats, toppedUp: topUps.length },
            '[bookgeek] what-next answer salvaged',
          );
        }
        result = {
          ...result,
          data: { picks: [...salv.picks.map((p) => ({ bookId: p.id, why: p.why })), ...topUps] },
        };
      }
    }
  }


  const picks = normalizePicks(result.data?.picks, limit, byId);
  logger.info(
    {
      metric: 'bookgeek.library.whatnext_shown',
      userId,
      picks: picks.length,
      candidates: candidates.length,
      source: result.provenance.source,
      reason: result.provenance.reason,
    },
    '[bookgeek] what-next shelf served'
  );
  return { picks, provenance: result.provenance };
}

// ---------------------------------------------------------------------------
// draftBookMetadata
// ---------------------------------------------------------------------------

const METADATA_SCHEMA = {
  name: 'BookMetadataDraft',
  description: 'A back-cover description and a tag list for one book.',
  schema: {
    type: 'object',
    properties: {
      description: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['description', 'tags'],
    additionalProperties: false,
  },
};

export const METADATA_SYSTEM_PROMPT = `You fill in catalogue metadata a library import left blank, for ONE book.

You are given JSON with the book's "title", "authors", "publisher" and "year",
plus "libraryTags" — the tags this library already uses.

Rules, in order of importance:
1. NO SPOILERS. The description says no more than the back cover or a bookshop
   blurb would: the premise and the setup, nothing else. Never reveal a twist, a
   death, an ending, a late reveal, or how anything turns out. If the honest
   summary of a book is its ending, write about its premise instead.
2. You MAY use general knowledge about this book — filling the gap is the point.
   But if you do not actually know this book, return an empty description ("")
   rather than inventing one. A blank field is better than a wrong one.
3. Two to four sentences, plain prose, under 600 characters. No marketing
   superlatives, no "gripping", no "unputdownable", no review quotes.
4. "tags" must come from "libraryTags", except that you may add at most 2 tags
   the library does not have yet. At most 8 tags, all lowercase.`;

/**
 * Tags this library already puts on the same author's other books — the honest
 * deterministic answer, and the right one when a model is not available.
 */
export function fallbackTagsByAuthor(book, siblings, max = 5) {
  const counts = new Map();
  for (const sibling of siblings) {
    if (String(sibling._id) === String(book._id)) continue;
    for (const tag of tagList(sibling)) {
      const key = tag.trim().toLowerCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([tag]) => tag);
}

export function validateMetadataDraft(data, knownTags) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.description !== 'string') return false;
  if (data.description.length > MAX_DESCRIPTION_CHARS) return false;
  if (!Array.isArray(data.tags)) return false;
  if (data.tags.length > MAX_DRAFT_TAGS) return false;
  let coined = 0;
  for (const tag of data.tags) {
    if (typeof tag !== 'string' || !tag.trim()) return false;
    if (!knownTags.has(tag.trim().toLowerCase())) coined += 1;
  }
  return coined <= MAX_NEW_TAGS;
}

function normalizeTags(tags) {
  const seen = new Set();
  const out = [];
  for (const tag of Array.isArray(tags) ? tags : []) {
    if (typeof tag !== 'string') continue;
    const clean = tag.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= MAX_DRAFT_TAGS) break;
  }
  return out;
}

function disabledProvenance(reason) {
  return {
    source: 'fallback',
    reason,
    model: null,
    provider: null,
    cached: false,
    callsToday: 0,
    cap: LIBRARY_DAILY_CAP,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {object} opts.book     the Book document (lean) to draft for
 * @param {boolean} opts.enabled the caller's opt-in switch
 */
export async function draftBookMetadata({ userId, book, enabled }) {
  const authors = authorList(book);
  const [tags, siblings] = await Promise.all([
    libraryTags(MAX_LIBRARY_TAGS),
    authors.length
      ? Book.find({ authors: { $in: authors } })
        .select('tags')
        .limit(200)
        .lean()
      : Promise.resolve([]),
  ]);

  const fallback = () => ({ description: '', tags: fallbackTagsByAuthor(book, siblings) });

  let result;
  if (!enabled) {
    result = { data: fallback(), provenance: disabledProvenance('disabled') };
  } else {
    const knownTags = new Set(tags.map((t) => t.toLowerCase()));
    const year = dayString(book.publishedDate)?.slice(0, 4) || null;
    result = await runAIFeature({
      app: LIBRARY_APP,
      feature: LIBRARY_FEATURE,
      userId,
      system: METADATA_SYSTEM_PROMPT,
      user: JSON.stringify({
        title: book.title || 'Untitled',
        authors,
        publisher: book.publisher || null,
        year,
        libraryTags: tags,
      }),
      schema: METADATA_SCHEMA,
      validate: (data) => validateMetadataDraft(data, knownTags),
      fallback,
      maxCallsPerDay: LIBRARY_DAILY_CAP,
    });
  }

  const description =
    typeof result.data?.description === 'string'
      ? result.data.description.trim().slice(0, MAX_DESCRIPTION_CHARS)
      : '';
  const draftTags = normalizeTags(result.data?.tags);

  logger.info(
    {
      metric: 'bookgeek.library.metadata_drafted',
      userId,
      bookId: String(book._id),
      tags: draftTags.length,
      described: description.length > 0,
      source: result.provenance.source,
      reason: result.provenance.reason,
    },
    '[bookgeek] metadata draft served'
  );

  return { description, tags: draftTags, provenance: result.provenance };
}

// ---------------------------------------------------------------------------
// The opt-in switch
// ---------------------------------------------------------------------------

/**
 * `appPreferences.bookgeek.libraryAssistant`, default false.
 *
 * The User model is imported lazily: it opens its own userGeek connection at
 * module load, and the bookgeek gateway module is imported by the schema
 * builder on every boot (and by four test suites that close only the bookgeek
 * and aiGeek connections). Paying for that connection only when somebody
 * actually asks for an AI draft keeps the import graph where it was.
 */
export async function libraryAssistantEnabled(userId) {
  if (!userId) return false;
  try {
    const [{ User }, { getAppPreferences }] = await Promise.all([
      import('../../models/user.js'),
      import('../../lib/appPreferences.js'),
    ]);
    const user = await User.findById(userId).select('appPreferences');
    if (!user) return false;
    return getAppPreferences(user, 'bookgeek').libraryAssistant === true;
  } catch (err) {
    // A malformed id casts to a CastError; an unreachable userGeek throws.
    // Either way the honest answer is "not opted in" — which costs a
    // deterministic answer, never a wrong one.
    logger.warn({ err: err?.message }, '[bookgeek] could not read the library-assistant setting');
    return false;
  }
}

export default {
  whatNext,
  draftBookMetadata,
  libraryAssistantEnabled,
  candidateBooks,
  recentlyFinishedBooks,
  libraryTags,
  fallbackPicks,
  fallbackTagsByAuthor,
  validateMetadataDraft,
  whatNextContext,
};
