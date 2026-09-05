/**
 * askService — the AI half of StartGeek Ask.
 *
 * Two calls, both optional, both fail-soft:
 *
 *   planQuery(query, context)
 *     Natural language in, a structured search plan out. The plan is fed to
 *     the same regex search `glanceSearch` already runs, so a failed or slow
 *     model degrades to "search for the literal query" rather than to nothing.
 *
 *   answerFrom(query, context, { glanceToday, results })
 *     Only for question-shaped queries. The model sees a trimmed snapshot of
 *     the user's day plus the top search hits and must answer *from that*,
 *     citing the ids it used, or return null.
 *
 * Routing goes through aiGeek's App Routing config for app id `startgeek`
 * (the `basegeek-app` virtual model): whatever model the App Routing dialog
 * points at is what answers. No provider or key detail is chosen here.
 *
 * Nothing locked or encrypted is ever put in front of the model — the search
 * layer excludes those already, and `sanitizeResults` strips anything that
 * still looks locked before it leaves this module.
 */

import logger from '../../lib/logger.js';
import aiService from '../../services/aiService.js';

// aiGeek's App Routing alias. Expressed server-side as the same normalization
// `/api/ai/call` performs for `model: "basegeek-app"`: useAppConfig + appName.
export const ASK_APP_NAME = 'startgeek';
export const ASK_TIMEOUT_MS = 3000;

const THING_TYPES = `
The suite stores four kinds of Thing, each in its own app:
- note  (app "notegeek")  — free text with a title, tags, and a body.
- task  (app "bujogeek")  — a to-do or event with a due date, tags, priority.
- book  (app "bookgeek")  — a title with authors and a shelf ("reading",
  "read", "want-to-read"). The library is shared, not per-user.
- bird  (app "flockgeek") — a chicken with a name, tag id, breed, and status.
`.trim();

const PLAN_SYSTEM_PROMPT = `You turn a person's search box input into a search plan for their personal suite.

${THING_TYPES}

Return JSON only, matching the schema.

- kind: "answer" if the input is a question about their own data that a short
  sentence could answer ("what am I reading", "what's due today", "how many
  eggs this week"). "search" if they are looking for Things to open.
- keywords: 1-4 short search terms to run as literal, case-insensitive
  substring matches. Include obvious synonyms ("coop", "henhouse"). Never
  include stop words alone. If nothing better exists, echo the input.
- apps / types: narrow to the apps and Thing types the input is about. Leave
  both empty when the input could be about anything.
- since: an ISO date (YYYY-MM-DD) when the input bounds a time range, else null.
- shelf: one of "reading", "read", "want-to-read" when the input is about
  books at a particular stage, else null.
- tags: tags the input names explicitly, without the leading #.`;

const ANSWER_SYSTEM_PROMPT = `You answer a person's question using ONLY the JSON context you are given about their own data.

${THING_TYPES}

Rules, in order of importance:
1. If the context does not contain the answer, set "answer" to null. Do not
   guess, do not use general knowledge, do not answer from memory.
2. When you can answer, keep it to one short sentence, plain and specific.
3. "citations" must contain only id strings that appear in the context, and
   only the ones your answer actually used. Empty when answer is null.`;

const PLAN_SCHEMA = {
  name: 'GlanceIntent',
  description: 'A structured search plan for the GeekSuite meta search.',
  schema: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['search', 'answer'] },
      keywords: { type: 'array', items: { type: 'string' } },
      apps: {
        type: 'array',
        items: { type: 'string', enum: ['notegeek', 'bujogeek', 'bookgeek', 'flockgeek'] },
      },
      types: {
        type: 'array',
        items: { type: 'string', enum: ['note', 'task', 'book', 'bird'] },
      },
      since: { type: ['string', 'null'] },
      shelf: { type: ['string', 'null'] },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['kind', 'keywords', 'apps', 'types', 'since', 'shelf', 'tags'],
    additionalProperties: false,
  },
};

const ANSWER_SCHEMA = {
  name: 'GlanceAnswer',
  description: 'A grounded one-line answer with the ids it was drawn from.',
  schema: {
    type: 'object',
    properties: {
      answer: { type: ['string', 'null'] },
      citations: { type: 'array', items: { type: 'string' } },
    },
    required: ['answer', 'citations'],
    additionalProperties: false,
  },
};

const KNOWN_APPS = new Set(['notegeek', 'bujogeek', 'bookgeek', 'flockgeek']);
const KNOWN_TYPES = new Set(['note', 'task', 'book', 'bird']);
const KNOWN_SHELVES = new Set(['reading', 'read', 'want-to-read']);

const MAX_KEYWORDS = 4;
const MAX_CONTEXT_RESULTS = 8;

// ── Small helpers ───────────────────────────────────────────────────────────

/** The plan we run when the model is off, slow, or wrong: the query, literally. */
export function degradedIntent(query) {
  return {
    kind: 'search',
    keywords: [String(query ?? '')],
    apps: [],
    types: [],
    since: null,
    shelf: null,
    tags: [],
  };
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function parseJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  const text = String(raw).trim();
  try {
    return JSON.parse(text);
  } catch {
    // Providers without native json_schema go through aiGeek's prompt-injection
    // fallback, which usually — but not always — returns bare JSON.
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    try {
      return JSON.parse(text.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}

function stringList(value, allowed = null, cap = 8) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const normalized = allowed ? trimmed.toLowerCase() : trimmed;
    if (allowed && !allowed.has(normalized)) continue;
    if (out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= cap) break;
  }
  return out;
}

function isoDateOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;
  return Number.isNaN(Date.parse(trimmed)) ? null : trimmed.slice(0, 10);
}

/** Coerce whatever the model returned into a plan the resolvers can trust. */
export function normalizeIntent(raw, query) {
  const fallback = degradedIntent(query);
  if (!raw || typeof raw !== 'object') return fallback;

  const kind = raw.kind === 'answer' ? 'answer' : 'search';
  const keywords = stringList(raw.keywords, null, MAX_KEYWORDS);
  const shelf = typeof raw.shelf === 'string' && KNOWN_SHELVES.has(raw.shelf.trim().toLowerCase())
    ? raw.shelf.trim().toLowerCase()
    : null;

  return {
    kind,
    keywords: keywords.length ? keywords : fallback.keywords,
    apps: stringList(raw.apps, KNOWN_APPS, 4),
    types: stringList(raw.types, KNOWN_TYPES, 4),
    since: isoDateOrNull(raw.since),
    shelf,
    tags: stringList(raw.tags, null, 8),
  };
}

function callerId(context) {
  return context?.user?.id || context?.user?._id || null;
}

async function callModel({ system, user, schema, context }) {
  const content = await withTimeout(
    aiService.callAI(user, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      // aiGeek App Routing: `model: "basegeek-app"` for app id `startgeek`.
      // `/api/ai/call` normalizes that alias to exactly these two fields.
      useAppConfig: true,
      appName: ASK_APP_NAME,
      userId: callerId(context) ? String(callerId(context)) : null,
      responseFormat: { type: 'json_schema', json_schema: schema },
      temperature: 0,
    }),
    ASK_TIMEOUT_MS,
    schema.name
  );

  const info = aiService.lastProviderInfo || {};
  return {
    parsed: parseJson(content),
    provider: info.provider || null,
    model: info.model || null,
  };
}

// ── Context shaping ─────────────────────────────────────────────────────────

/**
 * Trim glanceToday to the parts a question could plausibly be about. The full
 * snapshot carries habit streak internals, cover paths and activity blobs the
 * model has no use for and that only cost tokens.
 */
export function trimGlanceToday(today) {
  if (!today || typeof today !== 'object') return null;

  const task = (t) => ({
    id: t.id,
    content: t.content,
    dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : null,
    tags: t.tags || [],
  });

  const trimmed = { date: today.date || null };

  if (today.tasks) {
    trimmed.tasks = {
      due: (today.tasks.due || []).map(task),
      overdue: (today.tasks.overdue || []).map(task),
      completedCount: today.tasks.completedCount ?? 0,
    };
  }

  trimmed.reading = (today.reading || []).map((b) => ({
    id: b.id,
    title: b.title,
    authors: b.authors || [],
    readingProgress: b.readingProgress ?? null,
  }));

  trimmed.habits = (today.habits || []).map((h) => ({
    id: h.id,
    name: h.name,
    doneToday: !!h.doneToday,
    currentStreak: h.currentStreak ?? 0,
  }));

  if (today.fitness) {
    trimmed.fitness = {
      calories: today.fitness.calories ?? null,
      calorieGoal: today.fitness.calorieGoal ?? null,
      mealsLogged: today.fitness.mealsLogged ?? 0,
      lastActivity: today.fitness.lastActivity?.activityName || null,
    };
  }

  if (today.flock) {
    trimmed.flock = {
      activeBirds: today.flock.activeBirds ?? 0,
      todayEggs: today.flock.todayEggs ?? 0,
      weekEggs: today.flock.weekEggs ?? 0,
    };
  }

  return trimmed;
}

/**
 * Belt and braces on the locked-note rule. `searchThings` never returns the
 * body of a locked or encrypted note, but this is the last gate before text
 * leaves the building, so it re-checks rather than trusting the caller.
 */
export function sanitizeResults(results) {
  return (Array.isArray(results) ? results : [])
    .filter((r) => r && !r.isLocked && !r.isEncrypted)
    .slice(0, MAX_CONTEXT_RESULTS)
    .map((r) => ({
      id: r.id,
      app: r.app,
      type: r.type,
      title: r.title,
      snippet: r.snippet || null,
      updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString().slice(0, 10) : null,
    }));
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Ask the model for a search plan.
 * Always resolves — `degraded: true` means "run the literal query instead".
 */
export async function planQuery(query, context) {
  const text = String(query ?? '').trim();

  try {
    const { parsed, provider, model } = await callModel({
      system: PLAN_SYSTEM_PROMPT,
      user: text,
      schema: PLAN_SCHEMA,
      context,
    });

    if (!parsed) {
      logger.warn({ query: text }, 'glanceAsk: plan response was not JSON; degrading');
      return { intent: degradedIntent(text), degraded: true, provider, model };
    }

    return { intent: normalizeIntent(parsed, text), degraded: false, provider, model };
  } catch (err) {
    logger.warn({ err }, 'glanceAsk: plan call failed; degrading to literal search');
    return { intent: degradedIntent(text), degraded: true, provider: null, model: null };
  }
}

/**
 * Ask the model to answer from the user's own data. Returns
 * `{ answer: null, citations: [] }` on any failure — a missing answer is a
 * normal outcome here, not an error worth surfacing.
 */
export async function answerFrom(query, context, { glanceToday, results } = {}) {
  const text = String(query ?? '').trim();
  const contextPayload = {
    question: text,
    today: trimGlanceToday(glanceToday),
    results: sanitizeResults(results),
  };

  try {
    const { parsed, provider, model } = await callModel({
      system: ANSWER_SYSTEM_PROMPT,
      user: `Question: ${text}\n\nContext:\n${JSON.stringify(contextPayload)}`,
      schema: ANSWER_SCHEMA,
      context,
    });

    if (!parsed) {
      return { answer: null, citations: [], provider, model };
    }

    const answer = typeof parsed.answer === 'string' && parsed.answer.trim()
      ? parsed.answer.trim()
      : null;

    // Only ids the model was actually shown may be cited.
    const known = new Set(contextPayload.results.map((r) => String(r.id)));
    for (const t of contextPayload.today?.tasks?.due || []) known.add(String(t.id));
    for (const t of contextPayload.today?.tasks?.overdue || []) known.add(String(t.id));
    for (const b of contextPayload.today?.reading || []) known.add(String(b.id));
    for (const h of contextPayload.today?.habits || []) known.add(String(h.id));

    const citations = answer ? stringList(parsed.citations, null, 8).filter((id) => known.has(id)) : [];

    return { answer, citations, provider, model };
  } catch (err) {
    logger.warn({ err }, 'glanceAsk: answer call failed; returning no answer');
    return { answer: null, citations: [], provider: null, model: null };
  }
}

export default { planQuery, answerFrom, degradedIntent, normalizeIntent, trimGlanceToday, sanitizeResults };
