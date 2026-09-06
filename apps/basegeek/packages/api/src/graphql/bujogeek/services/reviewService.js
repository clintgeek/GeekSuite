/**
 * reviewService — the weekly review draft (AI_IDEAS.md #1).
 *
 * The blank page is the expensive part of a weekly review, so this gathers the
 * week's facts and asks a model to word them. Three rules keep it honest:
 *
 *   1. **Code counts, the model writes.** Every number and every task title in
 *      the result is computed here from the user's own rows. The model is given
 *      those facts as JSON and is told to summarise them; it is never asked to
 *      add up anything, and its arithmetic is never trusted.
 *   2. **Nothing invented.** A `carryForward` entry whose title is not one of
 *      the titles we handed it is dropped, and the ones that survive are
 *      snapped back to the canonical title from the facts. A model that
 *      hallucinates a task loses that row, not the whole draft.
 *   3. **Never the only path.** `buildFallbackDraft()` produces a real,
 *      readable review from the same facts with no model call at all — used
 *      when the user has not opted in, when the daily cap is spent, when
 *      aiGeek is down or slow, and when the output does not parse.
 *
 * Nothing here writes. The draft is a proposal; the user saves it through the
 * ordinary `createJournalEntry` mutation, which stamps `aiDrafted`.
 *
 * ## What leaves the box
 *
 * Task **titles** (`content`) and collection names for the overdue and parked
 * lists, habit names with their streaks, and the week's counts. Not notes, not
 * tags, not task bodies, not anything from another app — see
 * `factsForModel()`, which is the only thing serialised into the prompt.
 *
 * ## The week
 *
 * `weekStart` is a calendar date and must be a Monday; the window is
 * `[weekStart, weekStart + 7 days)` in UTC, i.e. Monday through Sunday. The
 * client sends the Monday it is showing, so the review of "last week" and the
 * facts about it can never disagree about which week that was.
 *
 * Recurring series are counted as their **materialised rows** (the master and
 * any overrides), not as their virtual expansions: a virtual occurrence has no
 * row, no completedAt and no id, so there is nothing deterministic to count.
 */

import Task from '../models/Task.js';
import Collection from '../models/Collection.js';
import habitService from './habitService.js';
import logger from '../../../lib/logger.js';
import { runAIFeature, callsToday } from '../../../services/aiFeatureRunner.js';

export const REVIEW_APP = 'bujogeek';
export const REVIEW_FEATURE = 'review';
/** Weekly cadence — ten a day is a generous ceiling on a once-a-week ritual. */
export const REVIEW_MAX_CALLS_PER_DAY = 10;
/** How many titles the model is allowed to see per list. */
export const MAX_LIST = 12;
/** How many carry-forwards survive into the draft (AI_IDEAS.md says three). */
export const MAX_CARRY_FORWARD = 3;
export const MAX_WINS = 5;
export const MAX_SUMMARY_CHARS = 1200;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The statuses that mean "still on the list". Mirrors ReviewPage's own set. */
const OPEN_STATUSES = ['pending', 'migrated_back', 'migrated_future'];

/** `yyyy-MM-dd` for a Date, read in UTC. Null-safe. */
export function dayKey(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * The Monday-to-Sunday window a `weekStart` names.
 * `end` is exclusive, `lastDay` is the Sunday at UTC midnight.
 */
export function weekWindow(weekStart) {
  const d = weekStart instanceof Date ? weekStart : new Date(weekStart);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return {
    start,
    end: new Date(start.getTime() + 7 * DAY_MS),
    lastDay: new Date(start.getTime() + 6 * DAY_MS),
  };
}

/** Titles compare case- and whitespace-insensitively; that is the only fuzz. */
export function normalizeTitle(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function within(value, start, end) {
  if (!value) return false;
  const t = (value instanceof Date ? value : new Date(value)).getTime();
  return Number.isFinite(t) && t >= start.getTime() && t < end.getTime();
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Every deterministic fact the draft is allowed to rest on.
 *
 * @param {{ userId: string, weekStart: Date }} args
 * @returns {Promise<object>} the facts, exactly as the GraphQL `ReviewFacts` shape
 */
export async function gatherFacts({ userId, weekStart }) {
  if (!userId) {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  const { start, end, lastDay } = weekWindow(weekStart);
  const inWeek = { $gte: start, $lt: end };

  const [weekTasks, openTasks, parked, habits, logs] = await Promise.all([
    Task.find({
      createdBy: userId,
      $or: [
        { dueDate: inWeek },
        { completedAt: inWeek },
        { cancelledAt: inWeek },
        { blockedAt: inWeek },
        { originalDate: inWeek },
      ],
    })
      .select('content status dueDate originalDate completedAt cancelledAt blockedAt')
      .lean(),
    Task.find({
      createdBy: userId,
      status: { $in: OPEN_STATUSES },
      dueDate: { $ne: null, $lt: end },
    })
      .sort({ dueDate: 1 })
      .limit(MAX_LIST)
      .select('content dueDate collectionId')
      .lean(),
    Task.find({ createdBy: userId, status: 'blocked' })
      .sort({ blockedAt: -1 })
      .limit(MAX_LIST)
      .select('content blockedReason blockedAt collectionId')
      .lean(),
    habitService.listHabits(userId, false),
    habitService.getLogs({ userId, startDate: start, endDate: lastDay }),
  ]);

  // One lookup for every collection either list mentions.
  const collectionIds = [...new Set(
    [...openTasks, ...parked].map((t) => t.collectionId).filter(Boolean).map(String)
  )];
  const collections = collectionIds.length
    ? await Collection.find({ _id: { $in: collectionIds }, createdBy: userId }).select('name').lean()
    : [];
  const collectionName = new Map(collections.map((c) => [String(c._id), c.name]));
  const nameFor = (id) => (id ? collectionName.get(String(id)) ?? null : null);

  const counts = {
    completed: weekTasks.filter((t) => t.status === 'completed' && within(t.completedAt, start, end)).length,
    cancelled: weekTasks.filter((t) => t.status === 'cancelled' && within(t.cancelledAt, start, end)).length,
    blocked: weekTasks.filter((t) => t.status === 'blocked' && within(t.blockedAt, start, end)).length,
    carriedForward: weekTasks.filter(
      (t) => OPEN_STATUSES.includes(t.status)
        && (within(t.dueDate, start, end) || within(t.originalDate, start, end))
    ).length,
    created: weekTasks.filter((t) => within(t.originalDate, start, end)).length,
  };

  const doneByHabit = new Map();
  for (const log of logs) {
    const key = String(log.habitId);
    if (!doneByHabit.has(key)) doneByHabit.set(key, new Set());
    doneByHabit.get(key).add(dayKey(log.date));
  }

  const habitFacts = await Promise.all(
    habits.map(async (habit) => {
      let daysScheduled = 0;
      for (let i = 0; i < 7; i += 1) {
        if (habitService.isScheduled(habit, new Date(start.getTime() + i * DAY_MS))) daysScheduled += 1;
      }
      return {
        name: habit.name,
        streak: await habitService.getCurrentStreak(habit, userId, lastDay),
        daysDone: doneByHabit.get(String(habit._id))?.size ?? 0,
        daysScheduled,
      };
    })
  );

  const overdue = openTasks.map((t) => ({
    title: t.content,
    collection: nameFor(t.collectionId),
    dueDate: dayKey(t.dueDate),
    daysOverdue: Math.max(
      0,
      Math.floor((lastDay.getTime() - new Date(t.dueDate).setUTCHours(0, 0, 0, 0)) / DAY_MS)
    ),
  }));

  const blocked = parked.map((t) => ({
    title: t.content,
    collection: nameFor(t.collectionId),
    reason: t.blockedReason || null,
    blockedSince: dayKey(t.blockedAt),
  }));

  return {
    weekStart: dayKey(start),
    weekEnd: dayKey(lastDay),
    counts,
    habits: habitFacts,
    overdue,
    blocked,
  };
}

/**
 * The subset of the facts that is actually serialised into the prompt.
 *
 * Identical to `facts` today — which is the point: the fact set was chosen so
 * that all of it is safe to send. Keeping the projection explicit means a field
 * added to `gatherFacts` for the UI does not silently join the outbound payload.
 */
export function factsForModel(facts) {
  return {
    weekStart: facts.weekStart,
    weekEnd: facts.weekEnd,
    counts: facts.counts,
    habits: facts.habits,
    overdue: facts.overdue,
    blocked: facts.blocked,
  };
}

export const REVIEW_SCHEMA = {
  name: 'BujoWeeklyReview',
  description: "A drafted weekly review of a person's own bullet journal.",
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      wins: { type: 'array', items: { type: 'string' } },
      carryForward: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['title', 'reason'],
          additionalProperties: false,
        },
      },
      suggestedFocus: { type: 'string' },
    },
    required: ['summary', 'wins', 'carryForward', 'suggestedFocus'],
    additionalProperties: false,
  },
};

export const REVIEW_SYSTEM_PROMPT = `You draft the weekly review of a person's own bullet journal, from facts they already have.

You are given JSON: the week's counts, their habits with streaks, the titles of
tasks still open ("overdue") and of tasks they parked ("blocked"). That JSON is
everything you know. Return JSON only, matching the schema.

Rules, in order of importance:
1. Never state a fact that is not in the JSON. Do not add up, estimate or infer
   any number — every count you mention must be copied from "counts".
2. Every "carryForward" title must be copied EXACTLY from an "overdue" or
   "blocked" title. Never invent a task, never reword a title, never merge two.
   If there is nothing open, return an empty list.
3. summary: 3 to 5 sentences, past tense, plain and specific. Write it the way
   they would tell a friend how the week went — no headings, no bullet points,
   no motivational filler, no second-guessing their choices.
4. wins: up to five short phrases naming things that actually went well — a
   count that was good, a habit streak that held. Empty is an honest answer.
5. carryForward: at most three, the ones that matter most. "reason" is one short
   clause saying why it is still open, drawn from the facts (how long it has
   been overdue, why it is parked). Do not guess at motives.
6. suggestedFocus: one sentence naming the single thing to start with next week.
   It should point at something in the facts.`;

export function buildUserTurn(facts) {
  return JSON.stringify(factsForModel(facts));
}

/**
 * Structural check handed to `runAIFeature` — a failure here settles on the
 * fallback. Content checks (unknown titles) are NOT done here on purpose: the
 * contract is to drop an invented row, not to throw the whole draft away.
 */
export function isStructurallyValid(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.summary !== 'string' || !data.summary.trim()) return false;
  if (typeof data.suggestedFocus !== 'string' || !data.suggestedFocus.trim()) return false;
  if (!Array.isArray(data.wins)) return false;
  if (!Array.isArray(data.carryForward)) return false;
  return data.carryForward.every((row) => row && typeof row === 'object' && typeof row.title === 'string');
}

/**
 * Snap a model draft back onto the facts.
 *
 * Unknown carry-forward titles are dropped (never a hard failure); known ones
 * are rewritten to the canonical title so the "Add as task" button creates the
 * task the user recognises rather than the model's paraphrase of it.
 */
export function reconcileDraft(draft, facts) {
  const canonical = new Map();
  for (const row of [...facts.overdue, ...facts.blocked]) {
    canonical.set(normalizeTitle(row.title), row.title);
  }

  const seen = new Set();
  const carryForward = [];
  let dropped = 0;
  for (const row of draft.carryForward ?? []) {
    const key = normalizeTitle(row?.title);
    const title = canonical.get(key);
    if (!title) { dropped += 1; continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    carryForward.push({
      title,
      reason: String(row?.reason ?? '').trim() || 'Still open at the end of the week.',
    });
    if (carryForward.length >= MAX_CARRY_FORWARD) break;
  }

  const wins = (draft.wins ?? [])
    .map((w) => String(w ?? '').trim())
    .filter(Boolean)
    .slice(0, MAX_WINS);

  return {
    draft: {
      summary: String(draft.summary).trim().slice(0, MAX_SUMMARY_CHARS),
      wins,
      carryForward,
      suggestedFocus: String(draft.suggestedFocus).trim(),
    },
    dropped,
  };
}

/**
 * The deterministic review — no model, no network, and good enough on its own.
 * This is what a user who never opts in sees, and it is why the feature is
 * never blank.
 */
export function buildFallbackDraft(facts) {
  const c = facts.counts;
  const sentences = [`Week of ${facts.weekStart} to ${facts.weekEnd}.`];
  sentences.push(
    `Completed ${plural(c.completed, 'task')}; ${plural(c.carriedForward, 'task')} carried forward, `
    + `${c.blocked} parked, ${c.cancelled} cancelled.`
  );

  const held = facts.habits.filter((h) => h.streak > 0);
  if (held.length) {
    sentences.push(
      `Habits: ${held
        .slice(0, MAX_WINS)
        .map((h) => `${h.name} ${plural(h.streak, 'day')} (${h.daysDone}/${h.daysScheduled} this week)`)
        .join(', ')}.`
    );
  } else if (facts.habits.length) {
    sentences.push('No habit streak was running at the end of the week.');
  }

  if (facts.overdue.length) {
    sentences.push(
      `Still open: ${facts.overdue
        .slice(0, MAX_CARRY_FORWARD)
        .map((t) => `"${t.title}"${t.collection ? ` (${t.collection})` : ''}`)
        .join(', ')}.`
    );
  } else {
    sentences.push('Nothing was left overdue.');
  }

  const wins = [];
  if (c.completed > 0) wins.push(`Completed ${plural(c.completed, 'task')}`);
  for (const h of held.slice(0, MAX_WINS - wins.length)) {
    wins.push(`${h.name} — ${h.streak}-day streak`);
  }
  if (c.completed === 0 && !wins.length && c.created > 0) {
    wins.push(`Captured ${plural(c.created, 'new task')}`);
  }

  const carryForward = [
    ...facts.overdue.map((t) => ({
      title: t.title,
      reason: t.daysOverdue > 0
        ? `Overdue by ${plural(t.daysOverdue, 'day')}.`
        : 'Due at the end of the week and still open.',
    })),
    ...facts.blocked.map((t) => ({
      title: t.title,
      reason: t.reason ? `Parked: ${t.reason}` : 'Parked, waiting on something else.',
    })),
  ].slice(0, MAX_CARRY_FORWARD);

  const suggestedFocus = facts.overdue.length
    ? `Start with "${facts.overdue[0].title}" — it is the oldest thing still open.`
    : 'Nothing is overdue. Pick the one thing that matters most and give it a day.';

  return {
    summary: sentences.join(' ').slice(0, MAX_SUMMARY_CHARS),
    wins,
    carryForward,
    suggestedFocus,
  };
}

function fallbackProvenance(reason, cap = REVIEW_MAX_CALLS_PER_DAY, used = 0) {
  return {
    source: 'fallback',
    reason,
    model: null,
    provider: null,
    cached: false,
    callsToday: used,
    cap,
  };
}

/**
 * Gather the facts, then draft.
 *
 * @param {object} args
 * @param {string} args.userId
 * @param {Date}   args.weekStart  the Monday, already validated
 * @param {boolean} args.optedIn   the user's `aiReviewDraft` preference
 * @param {object} [args.ai]       injectable aiService (tests only)
 * @returns {Promise<{ facts, draft, provenance }>}
 */
export async function reviewDraft({ userId, weekStart, optedIn = false, ai }) {
  const facts = await gatherFacts({ userId, weekStart });

  if (!optedIn) {
    // The query still answers — the facts are useful on their own, and the
    // deterministic draft is the honest thing to show somebody who has not
    // asked for a model. No call is made and no quota is spent.
    const used = callsToday({ app: REVIEW_APP, feature: REVIEW_FEATURE, userId });
    logger.info(
      { metric: 'bujogeek.review.draft_shown', source: 'fallback', reason: 'opted_out', weekStart: facts.weekStart },
      '[bujogeek] review draft produced'
    );
    return { facts, draft: buildFallbackDraft(facts), provenance: fallbackProvenance('opted_out', REVIEW_MAX_CALLS_PER_DAY, used) };
  }

  const result = await runAIFeature({
    app: REVIEW_APP,
    feature: REVIEW_FEATURE,
    userId,
    system: REVIEW_SYSTEM_PROMPT,
    user: buildUserTurn(facts),
    schema: REVIEW_SCHEMA,
    validate: isStructurallyValid,
    fallback: () => buildFallbackDraft(facts),
    maxCallsPerDay: REVIEW_MAX_CALLS_PER_DAY,
    ...(ai ? { ai } : {}),
  });

  let draft = result.data;
  let dropped = 0;
  if (result.provenance.source === 'model') {
    const reconciled = reconcileDraft(result.data, facts);
    draft = reconciled.draft;
    dropped = reconciled.dropped;
  }

  logger.info(
    {
      metric: 'bujogeek.review.draft_shown',
      source: result.provenance.source,
      reason: result.provenance.reason,
      model: result.provenance.model,
      weekStart: facts.weekStart,
      droppedCarryForward: dropped,
    },
    '[bujogeek] review draft produced'
  );

  return { facts, draft, provenance: result.provenance };
}

export default {
  reviewDraft,
  gatherFacts,
  buildFallbackDraft,
  reconcileDraft,
  isStructurallyValid,
  factsForModel,
  weekWindow,
  normalizeTitle,
  dayKey,
  REVIEW_APP,
  REVIEW_FEATURE,
  REVIEW_MAX_CALLS_PER_DAY,
  REVIEW_SCHEMA,
  REVIEW_SYSTEM_PROMPT,
};
