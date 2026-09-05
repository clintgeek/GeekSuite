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
 *   draftFrom(input, kind, context)
 *     A sentence the deterministic capture parser could not read, turned into
 *     the variables `createTask` / `createNote` already take. Drafting only:
 *     nothing is written here. The client previews the draft and the user
 *     confirms, so a wrong draft costs a keystroke, not a bad row.
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

// BujoGeek's capture grammar, as the deterministic parser implements it
// (`apps/startgeek/src/lib/parseTaskInput.js`). The model is asked for the
// fields that grammar would have produced, so a drafted task and a typed one
// are the same row.
const BUJO_GRAMMAR = `The person types tasks in a shorthand their parser understands:
  #tag            a tag (letters, digits, hyphen, underscore)
  !high !medium !low   priority — high = 1, medium = 2, low = 3
  /today /tomorrow /friday /next-week /2026-03-15   a due date
  9am 2:30pm 14:30                                  a time, after the date
  ^note text      a note attached to the task, always last
  ~blocked reason parks the task, always last
  * @ - ! ?       the first character is a signifier:
                  * task (default), @ event, - note, ! important, ? question
When they write the same thing in plain words instead, produce the fields the
shorthand would have produced.`;

const DRAFT_TASK_SCHEMA = {
  name: 'GlanceTaskDraft',
  description: 'The variables BujoGeek\'s createTask mutation takes.',
  schema: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      dueDate: { type: ['string', 'null'] },
      priority: { type: ['integer', 'null'], enum: [1, 2, 3, null] },
      tags: { type: 'array', items: { type: 'string' } },
      signifier: { type: 'string', enum: ['*', '@', '-', '!', '?'] },
      summary: { type: 'string' },
    },
    required: ['content', 'dueDate', 'priority', 'tags', 'signifier', 'summary'],
    additionalProperties: false,
  },
};

const DRAFT_NOTE_SCHEMA = {
  name: 'GlanceNoteDraft',
  description: 'The variables NoteGeek\'s createNote mutation takes.',
  schema: {
    type: 'object',
    properties: {
      title: { type: ['string', 'null'] },
      content: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      summary: { type: 'string' },
    },
    required: ['title', 'content', 'tags', 'summary'],
    additionalProperties: false,
  },
};

function draftTaskPrompt(today) {
  return `You turn one line of plain English into a task for the person's own bullet journal.

${BUJO_GRAMMAR}

Today is ${today.iso} (${today.weekday}). Return JSON only, matching the schema.

- content: the task itself, imperative and short. Strip the framing ("remind me
  to", "I need to", "don't forget to") — keep the thing to be done. Never leave
  it empty.
- dueDate: a local date-time, "YYYY-MM-DDTHH:MM:SS", with no timezone suffix,
  or null when the line names no time at all. A bare weekday means the next one
  still to come — if they name today's weekday, they mean next week's. Times of
  day: morning 09:00, noon 12:00, afternoon 14:00, evening 18:00, night 20:00.
  With a date but no time, use 09:00.
- priority: 1 high, 2 medium, 3 low — only when the line says so ("urgent",
  "asap", "important", "whenever"). Otherwise null.
- tags: only tags the line already contains, with or without the leading #.
  Never invent one. Usually this is exactly the #tags they typed.
- signifier: "@" when it is an appointment or meeting at a set time, "?" when
  it is a question to answer, otherwise "*".
- summary: one short line, sentence case, saying what will be created — this is
  shown to the person before anything is saved.`;
}

function draftNotePrompt(today) {
  return `You turn one line of plain English into a note for the person's own notebook.

Today is ${today.iso} (${today.weekday}). Return JSON only, matching the schema.

- title: a short title, at most 60 characters, or null when the line is too
  slight to deserve one.
- content: the note body. Keep the person's own words — tidy the punctuation,
  do not rewrite, do not add anything they did not say. Never leave it empty.
- tags: only tags the line already contains, with or without the leading #.
  Never invent one.
- summary: one short line saying what will be saved — this is shown to the
  person before anything is saved.`;
}

const KNOWN_SIGNIFIERS = new Set(['*', '@', '-', '!', '?']);
const DRAFT_KINDS = new Set(['task', 'note']);
const MAX_TITLE = 60;

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

// ── Capture drafting ────────────────────────────────────────────────────────

/** Today, as the model needs to see it: the date and the weekday name. */
export function serverToday(now = new Date()) {
  return {
    iso: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
  };
}

/**
 * A local date-time the client can hand straight to `new Date()`.
 *
 * A bare date becomes 09:00, exactly as the parser's default does. A zone
 * suffix the model chose to send is kept; without one the string is floating,
 * which is what the parser produces (local time, from a local `new Date()`).
 */
export function normalizeDraftDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return Number.isNaN(Date.parse(`${trimmed}T09:00:00`)) ? null : `${trimmed}T09:00:00`;
  }

  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?(Z|[+-]\d{2}:?\d{2})?$/);
  if (!match) return null;

  const [, date, hm, sec, zone] = match;
  const iso = `${date}T${hm}:${sec || '00'}${zone || ''}`;
  return Number.isNaN(Date.parse(zone ? iso : `${iso}Z`)) ? null : iso;
}

/**
 * Tags the model may keep: only the ones already in the line.
 *
 * The rule is Chef's and it is absolute — a drafted task must never carry a
 * tag the person did not type. `#flock` and a bare `flock` both count; a
 * helpfully-inferred `#chores` does not.
 */
export function keepOnlyInputTags(value, input) {
  const haystack = String(input ?? '').toLowerCase();
  const out = [];
  for (const tag of stringList(value, null, 8)) {
    const clean = tag.replace(/^#+/, '').trim();
    if (!clean || !/^[a-zA-Z0-9_-]+$/.test(clean)) continue;
    if (!haystack.includes(clean.toLowerCase())) continue;
    if (out.includes(clean)) continue;
    out.push(clean);
  }
  return out;
}

function summaryOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 140) : null;
}

/**
 * Coerce a task draft into the exact variables `CREATE_TASK` takes.
 * Returns null when there is no content — a task with nothing to do is a
 * failure, not a draft, and the caller degrades.
 */
export function normalizeTaskDraft(raw, input) {
  if (!raw || typeof raw !== 'object') return null;

  const content = typeof raw.content === 'string' ? raw.content.trim() : '';
  if (!content) return null;

  const priority = Number.isInteger(raw.priority) && raw.priority >= 1 && raw.priority <= 3
    ? raw.priority
    : null;

  const signifier = typeof raw.signifier === 'string' && KNOWN_SIGNIFIERS.has(raw.signifier.trim())
    ? raw.signifier.trim()
    : '*';

  return {
    content,
    title: null,
    dueDate: normalizeDraftDate(raw.dueDate),
    priority,
    tags: keepOnlyInputTags(raw.tags, input),
    signifier,
  };
}

/** The same, for `CREATE_NOTE`. Null when the body is empty. */
export function normalizeNoteDraft(raw, input) {
  if (!raw || typeof raw !== 'object') return null;

  const content = typeof raw.content === 'string' ? raw.content.trim() : '';
  if (!content) return null;

  const title = typeof raw.title === 'string' && raw.title.trim()
    ? raw.title.trim().slice(0, MAX_TITLE)
    : null;

  return {
    content,
    title,
    dueDate: null,
    priority: null,
    tags: keepOnlyInputTags(raw.tags, input),
    signifier: null,
  };
}

/** What the client shows when the model gave no usable summary of its own. */
function fallbackSummary(kind, draft) {
  if (!draft) return null;
  if (kind === 'note') {
    return `Note: ${draft.title || draft.content}`.slice(0, 140);
  }
  return `Task: ${draft.content}`.slice(0, 140);
}

/** The shape every failure returns: nothing drafted, and said so. */
function degradedDraft(kind, provider = null, model = null) {
  return { kind, draft: null, summary: null, provider, model, degraded: true };
}

/**
 * Draft a task or a note from a line the deterministic parser could not read.
 *
 * Drafting only — nothing is written. The client previews what comes back and
 * the person presses Enter to run the mutation they would have run anyway.
 * Always resolves: `degraded: true` means "carry on as if AI were off".
 */
export async function draftFrom(input, kind, context) {
  const text = String(input ?? '').trim();
  const wanted = String(kind ?? '').trim().toLowerCase();

  if (!DRAFT_KINDS.has(wanted)) {
    logger.warn({ kind }, 'glanceDraft: unknown kind; degrading');
    return degradedDraft(DRAFT_KINDS.has(wanted) ? wanted : 'task');
  }
  if (!text) return degradedDraft(wanted);

  const today = serverToday();
  const isTask = wanted === 'task';

  try {
    const { parsed, provider, model } = await callModel({
      system: isTask ? draftTaskPrompt(today) : draftNotePrompt(today),
      user: text,
      schema: isTask ? DRAFT_TASK_SCHEMA : DRAFT_NOTE_SCHEMA,
      context,
    });

    if (!parsed) {
      logger.warn({ kind: wanted }, 'glanceDraft: response was not JSON; degrading');
      return degradedDraft(wanted, provider, model);
    }

    const draft = isTask ? normalizeTaskDraft(parsed, text) : normalizeNoteDraft(parsed, text);
    if (!draft) {
      logger.warn({ kind: wanted }, 'glanceDraft: draft had no content; degrading');
      return degradedDraft(wanted, provider, model);
    }

    return {
      kind: wanted,
      draft,
      summary: summaryOrNull(parsed.summary) || fallbackSummary(wanted, draft),
      provider,
      model,
      degraded: false,
    };
  } catch (err) {
    logger.warn({ err, kind: wanted }, 'glanceDraft: call failed; degrading to the parser');
    return degradedDraft(wanted);
  }
}

export default {
  planQuery,
  answerFrom,
  draftFrom,
  degradedIntent,
  normalizeIntent,
  normalizeTaskDraft,
  normalizeNoteDraft,
  trimGlanceToday,
  sanitizeResults,
};
