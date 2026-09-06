/**
 * suggest.js — "you already have a note about this".
 *
 * AI_IDEAS #3. Two halves, and the first one does most of the work:
 *
 *   1. **Local, deterministic, model-free.** TF-IDF cosine similarity of the
 *      note being saved (title, weighted, plus the first 500 characters of the
 *      body) against two corpora built from the caller's OWN data:
 *        - one document per tag the user already has: the tag name plus the
 *          titles of the notes carrying it;
 *        - one document per recently-updated note title.
 *      The top five tags (minus the ones already on the note) and the top five
 *      related notes come out of that. **A tag the user has never used can
 *      never be suggested** — the candidate set IS their tag list, so there is
 *      no path by which a new tag appears.
 *
 *   2. **A re-rank, behind the same opt-in.** When the user has switched
 *      "Suggest tags & links" on, `runAIFeature` may reorder the *candidate*
 *      related notes — it never adds one, never sees a note body other than
 *      the excerpt of the note in front of the user, and never touches the tag
 *      half. Any id it returns that is not already a candidate is dropped; if
 *      the whole answer fails to parse or validate, the local ranking stands.
 *
 * ## What leaves the box
 *
 * Only when the opt-in is on, and only: the note's title, the first ~500
 * characters of its body, and the id + title of the 50 candidate notes. Never
 * another note's body. Never a locked or encrypted note — those are excluded
 * from the corpora entirely, so they are neither suggested nor summarised.
 *
 * ## Why cosine and not something cleverer
 *
 * No dependency, no index to maintain, no embedding store, and it ranks
 * sensibly on a corpus of a few hundred short titles. If the local half ever
 * stops finding obvious links, that is the moment to reach for embeddings —
 * not before.
 */

import mongoose from 'mongoose';
import logger from '../../lib/logger.js';
import { runAIFeature, callsToday } from '../../services/aiFeatureRunner.js';
import Note from './models/Note.js';
import { EXCERPT_MAX, TITLE_MAX } from './validation.js';

export { EXCERPT_MAX, TITLE_MAX };

/** How many recently-updated notes may be related-note candidates. */
export const CANDIDATE_NOTE_LIMIT = 50;
/**
 * How many notes are read to build the tag corpus. Title + tags only, so this
 * is a small projection; it exists so a tag's document is more than its own
 * name whenever the tag has been used recently.
 */
export const TAG_CORPUS_NOTE_LIMIT = 200;
/** At most this many titles feed any one tag's document. */
export const TITLES_PER_TAG = 20;
/** Top-N returned per half. */
export const MAX_SUGGESTIONS = 5;
/**
 * Saves are frequent — every autosave is a potential call — so the cap is a
 * ceiling on a habit, not on a session. 30/day is roughly "a heavy writing
 * day" and still bounded.
 */
export const SUGGEST_DAILY_CAP = 30;
/**
 * Shorter than the runner's 6 s default: this fires on save, and a strip that
 * appears four seconds after the note was saved is a strip nobody reads. The
 * local ranking is already on screen by then.
 */
export const SUGGEST_TIMEOUT_MS = 4000;

/** The preference key the notegeek frontend writes (User.appPreferences.notegeek). */
export const OPT_IN_KEY = 'suggestOnSave';

/**
 * English stop words plus the handful of words that are noise in a personal
 * notebook specifically ("note", "todo"). Short enough to read, long enough to
 * stop "the" from being a link.
 */
const STOPWORDS = new Set([
  'a', 'about', 'after', 'again', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'between', 'both', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'doing', 'done', 'down', 'during',
  'each', 'few', 'for', 'from', 'further', 'get', 'got',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'him', 'his', 'how',
  'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just',
  'let', 'like', 'made', 'make', 'many', 'me', 'more', 'most', 'my',
  'no', 'nor', 'not', 'note', 'notes', 'now', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'ought', 'our', 'ours', 'out', 'over', 'own',
  'same', 'she', 'should', 'so', 'some', 'such',
  'than', 'that', 'the', 'their', 'theirs', 'them', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'to', 'todo', 'too', 'under', 'until', 'up', 'use', 'used',
  'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'will', 'with', 'would', 'you', 'your', 'yours',
]);

/**
 * Text → comparable terms.
 *
 * Strips HTML (a `text` note's body is TipTap markup), markdown link targets
 * and bare URLs — a shared hostname is not a shared subject — then splits on
 * everything that is not a letter or a digit. Tag names carry their own
 * structure (`homelab/nginx`, `blood-pressure`), and splitting on the
 * separators is exactly what makes `#nginx` match a note about nginx.
 */
export function tokenize(text) {
  if (text == null) return [];
  return String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && t.length <= 40 && !STOPWORDS.has(t));
}

/** term -> count */
function termFrequencies(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

/**
 * Document frequency across a corpus of token arrays.
 * @param {Array<{ tokens: string[] }>} docs
 */
export function documentFrequencies(docs) {
  const df = new Map();
  for (const doc of docs) {
    for (const term of new Set(doc.tokens)) df.set(term, (df.get(term) || 0) + 1);
  }
  return df;
}

/**
 * Smoothed inverse document frequency. `1 +` on both sides keeps a term that
 * appears in every document at a small positive weight rather than at zero,
 * which matters on a corpus of twenty notes where "homelab" may genuinely be
 * everywhere and still be the reason two notes belong together.
 */
export function idf(term, df, corpusSize) {
  return Math.log(1 + corpusSize / (1 + (df.get(term) || 0)));
}

function weightVector(tokens, df, corpusSize) {
  const tf = termFrequencies(tokens);
  const total = tokens.length || 1;
  const vec = new Map();
  for (const [term, count] of tf) {
    vec.set(term, (count / total) * idf(term, df, corpusSize));
  }
  return vec;
}

function norm(vec) {
  let sum = 0;
  for (const w of vec.values()) sum += w * w;
  return Math.sqrt(sum);
}

/** Cosine similarity of two weight vectors; 0 when either is empty. */
export function cosine(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, w] of small) {
    const other = large.get(term);
    if (other) dot += w * other;
  }
  return dot / (na * nb);
}

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Rank `docs` (each `{ key, tokens, payload }`) against `queryTokens`.
 * Returns `[{ key, payload, score }]`, best first, zero-scoring docs dropped.
 */
export function rankByCosine(queryTokens, docs, limit = MAX_SUGGESTIONS) {
  if (!queryTokens.length || !docs.length) return [];
  const df = documentFrequencies(docs);
  const corpusSize = docs.length;
  const query = weightVector(queryTokens, df, corpusSize);
  const scored = [];
  for (const doc of docs) {
    const score = cosine(query, weightVector(doc.tokens, df, corpusSize));
    if (score > 0) scored.push({ key: doc.key, payload: doc.payload, score: round3(score) });
  }
  scored.sort((a, b) => b.score - a.score || String(a.key).localeCompare(String(b.key)));
  return scored.slice(0, limit);
}

/**
 * The whole local half, as a pure function over an in-memory note list.
 *
 * @param {object} input
 * @param {string} input.title
 * @param {string} input.excerpt
 * @param {string[]} input.tags        tags already on the note (never re-suggested)
 * @param {string|null} input.noteId   the note being saved (never suggested as related)
 * @param {Array<{ _id, title, tags }>} input.notes  the caller's own, un-locked notes,
 *        most recently updated first.
 */
export function localSuggestions({ title = '', excerpt = '', tags = [], noteId = null, notes = [] }) {
  const queryTokens = [
    // The title says what the note is about far more reliably than the first
    // paragraph does, so it counts twice.
    ...tokenize(title), ...tokenize(title),
    ...tokenize(excerpt),
  ];

  const selfId = noteId ? String(noteId) : null;
  const own = new Set((tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean));

  // ── Tag candidates: one document per tag, name + the titles that carry it ──
  const titlesByTag = new Map();
  for (const note of notes) {
    for (const tag of note.tags || []) {
      const name = String(tag).trim();
      if (!name) continue;
      if (!titlesByTag.has(name)) titlesByTag.set(name, []);
      const bucket = titlesByTag.get(name);
      if (bucket.length < TITLES_PER_TAG) bucket.push(note.title || '');
    }
  }

  const tagDocs = [];
  for (const [name, titles] of titlesByTag) {
    if (own.has(name.toLowerCase())) continue;
    const nameTokens = tokenize(name);
    tagDocs.push({
      key: name,
      payload: name,
      // The tag's own name counts twice, for the same reason the note's title
      // does: it is the label the user chose, and the titles are evidence.
      tokens: [...nameTokens, ...nameTokens, ...titles.flatMap((t) => tokenize(t))],
    });
  }

  // ── Related-note candidates: one document per title ──
  //
  // The tag corpus above reads further back (a tag's meaning is the sum of
  // everything filed under it); the related half deliberately does not. A link
  // to something written last year is usually noise, and the recency window is
  // what keeps the strip about what the user is currently working on.
  const noteDocs = [];
  for (const note of notes) {
    if (noteDocs.length >= CANDIDATE_NOTE_LIMIT) break;
    const id = String(note._id);
    if (selfId && id === selfId) continue;
    const noteTitle = (note.title || '').trim();
    if (!noteTitle) continue;
    noteDocs.push({
      key: id,
      payload: { id, title: noteTitle },
      // A note's tags describe it as surely as its title does, and they are
      // the only signal a three-word title has.
      tokens: [...tokenize(noteTitle), ...(note.tags || []).flatMap((t) => tokenize(t))],
    });
  }

  return {
    tags: rankByCosine(queryTokens, tagDocs).map((r) => ({ tag: r.payload, score: r.score })),
    related: rankByCosine(queryTokens, noteDocs).map((r) => ({
      id: r.payload.id,
      title: r.payload.title,
      score: r.score,
      why: null,
    })),
  };
}

const RELATED_SCHEMA = {
  name: 'NoteGeekRelated',
  description: 'A re-ranking of candidate notes related to the one being written.',
  schema: {
    type: 'object',
    properties: {
      related: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            why: { type: 'string' },
          },
          required: ['id', 'why'],
          additionalProperties: false,
        },
      },
    },
    required: ['related'],
    additionalProperties: false,
  },
};

const RERANK_SYSTEM_PROMPT = `You help someone find the notes in their own notebook that relate to the one they are writing.

You are given the note they are writing (its title and the beginning of its body) and a numbered list of candidate notes, each with an id and a title. The candidates were chosen by a keyword ranking that does not understand synonyms or subject matter.

Return JSON only, matching the schema.

- related: the candidates that genuinely relate to what they are writing, most
  relevant first, at most five. Use ONLY ids from the candidate list — never
  invent an id, never invent a title, never return an id twice.
- Return fewer than five, or an empty list, when fewer than five candidates
  actually relate. A weak link is worse than no link: they will tap it once,
  find nothing, and stop trusting the strip.
- why: at most eight words saying what the two notes share. Concrete ("both
  about the nginx reverse proxy"), never generic ("related topic").`;

/** The model may only reorder and annotate ids it was given. */
export function validateRerank(data, candidateIds) {
  if (!data || !Array.isArray(data.related)) return false;
  const seen = new Set();
  for (const row of data.related) {
    if (!row || typeof row.id !== 'string') return false;
    if (!candidateIds.has(row.id)) return false;
    if (seen.has(row.id)) return false;
    seen.add(row.id);
  }
  return true;
}

/**
 * Apply the model's ordering to the candidate rows.
 *
 * The title always comes from OUR row — the local one if the keyword ranking
 * also found it, otherwise the candidate we handed over. The model reorders
 * and explains; it does not get to rename a note.
 *
 * A pick the local ranking scored at zero is kept, with `score: 0`. That is
 * the entire reason the model half exists (AI_IDEAS #3: "add the model only if
 * the local version misses obvious links") — dropping those would leave the
 * model able to demote, never to find. The zero is honest: it says the keyword
 * ranking gave this nothing and the model disagreed.
 *
 * Anything the model left out keeps its local order behind what it chose, so a
 * short answer never shrinks the strip.
 */
export function applyRerank(localRelated, modelRelated, candidates = []) {
  const localById = new Map(localRelated.map((r) => [r.id, r]));
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const out = [];
  for (const row of modelRelated || []) {
    if (out.some((r) => r.id === row.id)) continue;
    const local = localById.get(row.id);
    const candidate = candidateById.get(row.id);
    if (!local && !candidate) continue;
    const why = typeof row.why === 'string' ? row.why.trim().slice(0, 120) : '';
    out.push({
      id: row.id,
      title: local ? local.title : candidate.title,
      score: local ? local.score : 0,
      why: why || null,
    });
  }
  for (const local of localRelated) {
    if (out.length >= MAX_SUGGESTIONS) break;
    if (!out.some((r) => r.id === local.id)) out.push(local);
  }
  return out.slice(0, MAX_SUGGESTIONS);
}

/**
 * Is the feature switched on for this user?
 *
 * The setting lives server-side (`User.appPreferences.notegeek.suggestOnSave`,
 * written by notegeek's own Settings page), so the resolver enforces it rather
 * than trusting the client not to ask. Off — which is the default — means the
 * local ranking still answers and no model is consulted.
 */
export async function isOptedIn(userId) {
  if (!userId || !mongoose.isValidObjectId(userId)) return false;
  try {
    const { User } = await import('../../models/user.js');
    const user = await User.findById(userId).select('appPreferences').lean();
    const prefs = user?.appPreferences?.notegeek;
    return prefs?.[OPT_IN_KEY] === true;
  } catch (err) {
    // A preference read that fails is a reason to skip the model, not to fail
    // the whole strip.
    logger.warn({ err: err?.message }, '[notegeek:suggest] preference read failed; treating as opted out');
    return false;
  }
}

function provenanceOf(source, reason, extra = {}) {
  return {
    source,
    reason,
    model: null,
    provider: null,
    cached: false,
    callsToday: 0,
    cap: SUGGEST_DAILY_CAP,
    ...extra,
  };
}

/**
 * The service behind the `suggestForNote` query.
 *
 * @param {object} input
 * @param {string} input.userId
 * @param {string|null} input.noteId
 * @param {string} input.title
 * @param {string} input.excerpt  already truncated by validation
 * @param {string[]} input.tags
 */
export async function suggestForNote({ userId, noteId = null, title = '', excerpt = '', tags = [] }) {
  // Locked and encrypted notes are excluded here, once, for both corpora: they
  // are neither suggested, nor used as evidence for a tag, nor put in front of
  // a model.
  const notes = await Note.find(
    { userId, isLocked: { $ne: true }, isEncrypted: { $ne: true } },
    { title: 1, tags: 1, updatedAt: 1 }
  )
    .sort({ updatedAt: -1 })
    .limit(TAG_CORPUS_NOTE_LIMIT)
    .lean();

  const local = localSuggestions({
    title,
    excerpt,
    tags,
    noteId,
    notes,
  });

  const optedIn = await isOptedIn(userId);
  const candidates = buildCandidates(notes, noteId);

  let related = local.related;
  let provenance;

  if (!optedIn) {
    provenance = provenanceOf('fallback', 'opt-out', {
      callsToday: callsToday({ app: 'notegeek', feature: 'suggest', userId }),
    });
  } else if (candidates.length === 0) {
    provenance = provenanceOf('fallback', 'no-candidates', {
      callsToday: callsToday({ app: 'notegeek', feature: 'suggest', userId }),
    });
  } else {
    const candidateIds = new Set(candidates.map((c) => c.id));
    const result = await runAIFeature({
      app: 'notegeek',
      feature: 'suggest',
      userId,
      system: RERANK_SYSTEM_PROMPT,
      user: JSON.stringify({
        writing: { title, excerpt },
        candidates,
      }),
      schema: RELATED_SCHEMA,
      validate: (data) => validateRerank(data, candidateIds),
      fallback: () => ({ related: null }),
      maxCallsPerDay: SUGGEST_DAILY_CAP,
      timeoutMs: SUGGEST_TIMEOUT_MS,
    });
    provenance = { ...provenanceOf('fallback', null), ...result.provenance };
    if (result.provenance.source === 'model' && Array.isArray(result.data?.related)) {
      related = applyRerank(local.related, result.data.related, candidates);
    }
  }

  logger.info(
    {
      metric: 'notegeek.suggest.shown',
      userId: String(userId),
      tags: local.tags.length,
      related: related.length,
      source: provenance.source,
    },
    '[notegeek:suggest] suggestions returned'
  );

  return { tags: local.tags, related, provenance };
}

/**
 * The 50 most recently updated candidate titles, as `{ id, title }` — the only
 * other-note data that may reach a model, and only when the opt-in is on.
 */
export function buildCandidates(notes, noteId) {
  const selfId = noteId ? String(noteId) : null;
  const out = [];
  for (const note of notes) {
    if (out.length >= CANDIDATE_NOTE_LIMIT) break;
    const id = String(note._id);
    if (selfId && id === selfId) continue;
    const title = (note.title || '').trim();
    if (!title) continue;
    out.push({ id, title: title.slice(0, TITLE_MAX) });
  }
  return out;
}

export default { suggestForNote, localSuggestions, tokenize, rankByCosine };
