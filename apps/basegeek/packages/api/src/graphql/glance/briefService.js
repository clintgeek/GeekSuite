/**
 * briefService — StartGeek's three-sentence morning brief (AI_IDEAS.md #5).
 *
 * The console already loads everything the brief says. The brief is that same
 * information read once, top to bottom, the way you would read a sticky note —
 * so it adds *less* to the screen rather than more, and it is display-only:
 * there is not a single action in it.
 *
 * The shape of the thing:
 *
 *   1. `briefFacts()` trims a `glanceToday` snapshot down to the handful of
 *      counts and titles the brief can be about, on exactly the discipline
 *      `askService.trimGlanceToday()` uses — cover paths, habit internals,
 *      activity blobs and note bodies never reach a model.
 *   2. `deterministicBrief()` writes those facts out as sentences with no
 *      model involved at all. This is not a degraded mode; it is most of the
 *      value, and it is what ships when aiGeek is down, capped, or slow.
 *   3. `runAIFeature({ app: 'startgeek', feature: 'brief' })` asks a model to
 *      say the same thing in better prose. Free-text mode — there is no JSON
 *      to parse, only a paragraph to check.
 *
 * ## The three gates
 *
 * **Time of day.** A morning brief that shows up at 2 a.m. is a notification,
 * not a brief. `localHour < 5` returns `brief: null` *before* any load, so the
 * gate costs nothing and cannot be moved by a client that lies about its own
 * settings. The client gates too; this is the half that is not negotiable.
 *
 * **Once a day.** `briefCache`, an in-module `Map` keyed `userId:YYYY-MM-DD`.
 * The glance module has no cache of its own to borrow (`fetchGlanceToday`
 * re-reads Mongo on every call), so the brief brings its own, and it is
 * process-local: a redeploy costs one extra brief, which is the right failure
 * direction for a ceiling on a hobby budget. Yesterday's keys are swept on
 * every call so the map grows with today's users, not with all of history.
 *
 * **Only a model answer is cached.** A fallback brief is returned but never
 * stored, so an aiGeek that was down at 05:58 does not lock the deterministic
 * line in for the rest of the day — the next console load tries again. That is
 * what the 3/day cap is for; the cache is what makes it 1 in practice.
 *
 * ## What leaves the box
 *
 * Task titles and counts, habit names and streaks, the current book's title
 * and progress, and today's egg count. No note bodies, no health numbers, no
 * tags, nothing locked or encrypted (the snapshot has none of it to give).
 *
 * **No weather.** AI_IDEAS #5 lists it, but `glanceToday` does not carry it:
 * StartGeek reads Open-Meteo directly from the browser (`services/
 * weatherService.js`), so the gateway has no forecast to trim. Rather than
 * fetch one server-side — a new outbound dependency in front of the console's
 * first paint — the brief simply has no weather sentence. The weather block
 * sits in the same hero, two inches away.
 */

import logger from '../../lib/logger.js';
import { runAIFeature } from '../../services/aiFeatureRunner.js';

/** Before this local hour, there is no brief. Server-side half of the gate. */
export const BRIEF_MIN_LOCAL_HOUR = 5;

/** Ceiling on model calls per user per UTC day. The cache makes it 1 in practice. */
export const BRIEF_MAX_CALLS_PER_DAY = 3;

/** The brief is a sticky note, not an essay. */
export const BRIEF_MAX_CHARS = 400;
export const BRIEF_MAX_SENTENCES = 3;

/** How many task titles the model is shown. Counts carry the rest. */
const MAX_TASK_TITLES = 3;
/** How many habits are worth naming. */
const MAX_HABITS = 5;

export const BRIEF_SYSTEM_PROMPT = `You write a person's morning brief for their own console.

Rules:
- Exactly three short sentences.
- Present tense, second person.
- No exclamation marks.
- Mention only what is in the facts. Never invent a number, a title, a date or
  a fact the JSON does not contain.
- No advice about health or money. State what is there; do not coach.
- Plain prose. No lists, no headings, no markdown, no greeting, no sign-off.`;

// ── Facts ───────────────────────────────────────────────────────────────────

function taskTitles(list) {
  return (Array.isArray(list) ? list : [])
    .map((t) => (typeof t?.content === 'string' ? t.content.trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_TASK_TITLES);
}

/**
 * Trim a `glanceToday` snapshot to the facts a brief can be about.
 *
 * Same discipline as `askService.trimGlanceToday`: counts and titles, never
 * bodies; ids are dropped too, because unlike Ask the brief cites nothing.
 *
 * @param {object|null} today a `fetchGlanceToday` result
 * @returns {object|null} the facts object, or null when there is no snapshot
 */
export function briefFacts(today) {
  if (!today || typeof today !== 'object') return null;

  const facts = { date: today.date || null };

  const tasks = today.tasks || {};
  const due = Array.isArray(tasks.due) ? tasks.due : [];
  const overdue = Array.isArray(tasks.overdue) ? tasks.overdue : [];
  facts.tasks = {
    dueCount: due.length,
    overdueCount: overdue.length,
    completedCount: tasks.completedCount ?? 0,
    due: taskTitles(due),
    overdue: taskTitles(overdue),
  };

  const habits = (Array.isArray(today.habits) ? today.habits : [])
    .slice(0, MAX_HABITS)
    .map((h) => ({
      name: typeof h?.name === 'string' ? h.name : 'a habit',
      doneToday: !!h?.doneToday,
      currentStreak: Number.isFinite(h?.currentStreak) ? h.currentStreak : 0,
    }));
  if (habits.length) facts.habits = habits;

  const book = (Array.isArray(today.reading) ? today.reading : [])[0];
  if (book?.title) {
    facts.book = {
      title: book.title,
      authors: Array.isArray(book.authors) ? book.authors.slice(0, 2) : [],
      readingProgress: Number.isFinite(book.readingProgress) ? book.readingProgress : null,
    };
  }

  if (today.flock && Number.isFinite(today.flock.todayEggs)) {
    facts.flock = { todayEggs: today.flock.todayEggs };
  }

  return facts;
}

// ── The deterministic brief ─────────────────────────────────────────────────

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The longest streak still running today, or null. */
export function bestStreak(facts) {
  let best = null;
  for (const h of facts?.habits || []) {
    if (!(h.currentStreak > 0)) continue;
    if (!best || h.currentStreak > best.currentStreak) best = h;
  }
  return best;
}

/**
 * The brief with no model in it: three sentences built straight from the facts.
 *
 * Every number here is computed by code and only ever *worded* by the model
 * (AI_IDEAS rule 3), which is why this is also the thing the model is checked
 * against — if the prose fails validation, this is what ships.
 *
 * @param {object|null} facts a `briefFacts()` result
 * @returns {string} a brief of at most three sentences (fewer when the day is thin)
 */
export function deterministicBrief(facts) {
  const sentences = [];

  const dueCount = facts?.tasks?.dueCount ?? 0;
  const overdueCount = facts?.tasks?.overdueCount ?? 0;
  if (dueCount || overdueCount) {
    const parts = [];
    if (dueCount) parts.push(`${plural(dueCount, 'task')} due`);
    if (overdueCount) parts.push(`${overdueCount} overdue`);
    sentences.push(`${parts.join(', ')}.`);
  } else {
    sentences.push('Nothing is due today.');
  }

  const streak = bestStreak(facts);
  if (streak) {
    sentences.push(`Day ${streak.currentStreak} of ${streak.name}.`);
  } else if (facts?.habits?.length) {
    sentences.push('No habit streak is running.');
  }

  if (facts?.book) {
    const { title, readingProgress } = facts.book;
    sentences.push(
      readingProgress == null
        ? `You are reading ${title}.`
        : `${readingProgress}% through ${title}.`
    );
  } else if (facts?.flock?.todayEggs) {
    sentences.push(`${plural(facts.flock.todayEggs, 'egg')} collected today.`);
  }

  return sentences.slice(0, BRIEF_MAX_SENTENCES).join(' ');
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * How many sentences a string holds, counted the way a reader would.
 *
 * Deliberately crude: a terminator followed by whitespace or the end of the
 * string. An abbreviation ("5 a.m.") over-counts by one, which errs towards
 * rejecting a model that was told not to write one anyway.
 */
export function countSentences(text) {
  return String(text ?? '')
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

/**
 * The contract the model's prose has to meet: three sentences or fewer, 400
 * characters or fewer, and not empty. Anything else falls back.
 */
export function isUsableBrief(text) {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > BRIEF_MAX_CHARS) return false;
  return countSentences(trimmed) <= BRIEF_MAX_SENTENCES;
}

// ── The once-a-day cache ────────────────────────────────────────────────────

/** `userId:YYYY-MM-DD` → `{ brief, facts, provenance }`. Model answers only. */
const briefCache = new Map();

const cacheKey = (userId, date) => `${userId || 'anon'}:${date}`;

/** Drop every entry that is not today's, so the map tracks users, not history. */
function sweepCache(date) {
  const suffix = `:${date}`;
  for (const key of briefCache.keys()) {
    if (!key.endsWith(suffix)) briefCache.delete(key);
  }
}

/** Test hook. */
export function _resetBriefCache() {
  briefCache.clear();
}

/** Provenance for a result no model was asked for. Shape matches the runner's. */
function localProvenance(reason, extra = {}) {
  return {
    source: 'fallback',
    reason,
    model: null,
    provider: null,
    cached: false,
    callsToday: 0,
    cap: BRIEF_MAX_CALLS_PER_DAY,
    ...extra,
  };
}

// ── The brief ───────────────────────────────────────────────────────────────

/**
 * Build (or replay) today's brief for one user.
 *
 * Always resolves. `brief: null` means "show nothing" — before 5 a.m. local,
 * or when the day's snapshot could not be loaded at all. Everything else
 * yields prose, model-written or not, and says which in the provenance.
 *
 * @param {object}   opts
 * @param {string}   opts.userId
 * @param {string}   opts.date       the client's own calendar day, `YYYY-MM-DD`
 * @param {number}   opts.localHour  the client's own hour, 0-23
 * @param {() => Promise<object>} opts.loadGlance  the day's snapshot loader
 * @param {object}   [opts.ai]       injectable aiService (tests)
 * @param {Date}     [opts.now]      injectable clock (tests)
 * @returns {Promise<{date: string, brief: string|null, facts: object|null, provenance: object}>}
 */
export async function buildBrief({ userId, date, localHour, loadGlance, ai, now }) {
  // Gate one: the hour. Before the loader, before the cache — a 3 a.m. call
  // does no work at all.
  if (!(localHour >= BRIEF_MIN_LOCAL_HOUR)) {
    return { date, brief: null, facts: null, provenance: localProvenance('before_hour') };
  }

  sweepCache(date);
  const key = cacheKey(userId, date);
  const cached = briefCache.get(key);
  if (cached) {
    return {
      ...cached,
      provenance: { ...cached.provenance, cached: true },
    };
  }

  let today = null;
  try {
    today = await loadGlance();
  } catch (err) {
    logger.warn({ err }, 'glanceBrief: snapshot load failed; no brief today');
    return { date, brief: null, facts: null, provenance: localProvenance('no_snapshot') };
  }

  const facts = briefFacts(today);
  if (!facts) {
    return { date, brief: null, facts: null, provenance: localProvenance('no_snapshot') };
  }

  const fallback = () => deterministicBrief(facts);

  const { data, provenance } = await runAIFeature({
    app: 'startgeek',
    feature: 'brief',
    userId,
    system: BRIEF_SYSTEM_PROMPT,
    user: JSON.stringify(facts),
    // Free text: there is no JSON here, only a paragraph and a length rule.
    validate: isUsableBrief,
    fallback,
    maxCallsPerDay: BRIEF_MAX_CALLS_PER_DAY,
    ...(ai ? { ai } : {}),
    ...(now ? { now } : {}),
  });

  const brief = typeof data === 'string' && data.trim() ? data.trim() : null;
  const result = { date, brief, facts, provenance };

  // Only a model answer earns a place in the cache: a fallback is what we had
  // to say, not what we wanted to, and the next load should be free to try
  // again (bounded by the 3/day cap).
  if (brief && provenance?.source === 'model') {
    briefCache.set(key, result);
  }

  if (brief) {
    // The one usage metric for this feature (AI_IDEAS rule 6). Logged where
    // the brief is *produced*; the cache means that is once a day per user.
    logger.info(
      { metric: 'startgeek.brief.shown', source: provenance?.source || null, model: provenance?.model || null },
      'glanceBrief: brief produced'
    );
  }

  return result;
}

export default {
  buildBrief,
  briefFacts,
  deterministicBrief,
  bestStreak,
  countSentences,
  isUsableBrief,
  BRIEF_SYSTEM_PROMPT,
  BRIEF_MIN_LOCAL_HOUR,
  BRIEF_MAX_CALLS_PER_DAY,
};
