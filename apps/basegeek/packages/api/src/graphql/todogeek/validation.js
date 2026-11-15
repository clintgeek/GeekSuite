import { z } from 'zod';
import { normalizeTags } from '@geeksuite/tags';
import rrulePkg from 'rrule';
import {
  idString,
  instantField,
  calendarDateField,
  validateInput,
} from '../shared/validation.js';

// `validateInput` lives in `graphql/shared/validation.js` now — todogeek,
// notegeek and flockgeek all raise the same BAD_USER_INPUT shape. Re-exported
// here so this module stays the single import for todogeek's resolvers and
// its test suite.
export { validateInput };

const { rrulestr, RRule } = rrulePkg;

/**
 * Input validation for the todogeek mutations — SUITE_TODO's "input
 * validation (Joi/Zod)" item, flagged there for "client-controllable
 * timestamps, unbounded strings" (DOCS/SUITE_TODO.md).
 *
 * ## The two kinds of date, again
 *
 * `packages/utils/src/dates.js` draws the line the whole suite is supposed to
 * respect: a *calendar date* (no time-of-day, stored as UTC midnight) versus
 * an *instant* (a real moment, read in whatever timezone matters). TodoGeek's
 * `Task.dueDate` is unusual: it is BOTH, depending on the task. A task with no
 * particular hour is a calendar date; a task with a reminder time
 * (`reminderService.hasDueTime`) needs that hour preserved — collapsing it to
 * midnight would silently break every scheduled push. So `dueDate` (and
 * anything else that can carry a due *time*: subtasks, `createdAt`/
 * `updatedAt` overrides) is validated as an INSTANT — parsed, range-checked,
 * left otherwise alone. Only genuinely time-free fields — `toggleHabitLog`'s
 * `date` — are normalized through `toUtcMidnight`, matching
 * `habitService.toUtcMidnight`'s own contract exactly.
 *
 * ## ids are deliberately NOT format-validated
 *
 * Every owned-resource lookup in this module (taskService.findOwnedTask,
 * habitService.findOwnedHabit, collectionService.findOwnedCollection, …)
 * treats a malformed id and a missing/foreign one as indistinguishable on
 * purpose — see each service's own doc comments. Rejecting a malformed id
 * here, before the resolver ever calls the service, would surface a
 * different error (BAD_USER_INPUT vs. the service's plain "not found") for
 * exactly the case the service was written to hide. So an id field here is
 * validated only as a non-empty, bounded string — never as a 24-hex-char
 * ObjectId shape. (`virtual_<id>_<epochMs>` ids are also longer than a bare
 * ObjectId, which the bound accounts for.)
 */

const signifierSchema = z.enum(['*', '@', 'x', '<', '>', '-', '!', '?', '#']).nullable().optional();
const statusSchema = z
  .enum(['pending', 'completed', 'migrated_back', 'migrated_future', 'cancelled', 'blocked'])
  .nullable()
  .optional();
const prioritySchema = z.number().int().min(1).max(3).nullable().optional();
// Tags in the suite standard (`@geeksuite/tags`, DOCS/TAG_STANDARD.md):
// lowercase kebab-case, `/` for nesting, deduped in order. The 100 cap is
// checked again on the normalized value — normalizing can lengthen a tag.
const tagsSchema = z
  .array(z.string().trim().max(100))
  .max(50)
  .transform(normalizeTags)
  .pipe(z.array(z.string().max(100)))
  .optional();
// The legacy shim (taskService.recurrencePatternToRRule) accepts these four;
// anything else is already a no-op there, so the enum matches its own input.
const recurrencePatternSchema = z.enum(['none', 'daily', 'weekly', 'monthly']).nullable().optional();
// `DTSTART:...\nRRULE:...` — a real newline, so no single-line pattern here.
// Checked for what it EXPANDS to, not just its length (`recurrenceRuleProblem`).
const recurrenceRuleSchema = z
  .string()
  .trim()
  .max(1000)
  .superRefine((rule, ctx) => {
    const problem = recurrenceRuleProblem(rule);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  })
  .nullable()
  .optional();
/**
 * A repeating task's RRULE, judged by what it would cost to expand.
 *
 * Any text used to be accepted. `allTasks` expands every series a stretch
 * either side of today on the SHARED gateway, so `FREQ=SECONDLY` (or a DAILY
 * rule with `BYHOUR`×`BYMINUTE` lists) would build tens of millions of rows
 * and block every app's requests while it did. TodoGeek's grammar only ever
 * writes DAILY / WEEKLY / MONTHLY; YEARLY is allowed too.
 *
 * Refused: anything rrule cannot parse; more than one rule (an RRuleSet —
 * RDATE/EXRULE lines; exceptions live in `exdates`); a frequency finer than a
 * day; COUNT over MAX_RULE_COUNT; INTERVAL over MAX_RULE_INTERVAL; and any
 * rule that would produce more than MAX_OCCURRENCES_PER_YEAR occurrences in
 * the year after its DTSTART (a daily rule is 366). Returns null when fine.
 */
export const MAX_RULE_COUNT = 1000;
export const MAX_RULE_INTERVAL = 1000;
export const MAX_OCCURRENCES_PER_YEAR = 400;
const ALLOWED_FREQS = new Set([RRule.YEARLY, RRule.MONTHLY, RRule.WEEKLY, RRule.DAILY]);

export function recurrenceRuleProblem(text) {
  if (text === null || text === undefined || text === '') return null;
  let rule;
  try {
    rule = rrulestr(String(text));
  } catch {
    return 'recurrenceRule is not a valid RRULE';
  }
  if (!(rule instanceof RRule)) return 'recurrenceRule must be a single RRULE';
  const opts = rule.origOptions || {};
  if (!ALLOWED_FREQS.has(opts.freq)) return 'recurrenceRule may repeat daily at most (no HOURLY, MINUTELY or SECONDLY)';
  if (opts.count !== undefined && opts.count !== null && opts.count > MAX_RULE_COUNT) {
    return `recurrenceRule COUNT must be ${MAX_RULE_COUNT} or fewer`;
  }
  if (opts.interval !== undefined && opts.interval !== null && (opts.interval < 1 || opts.interval > MAX_RULE_INTERVAL)) {
    return `recurrenceRule INTERVAL must be between 1 and ${MAX_RULE_INTERVAL}`;
  }
  const start = rule.options.dtstart instanceof Date ? rule.options.dtstart : new Date();
  const yearOn = new Date(start.getTime() + 366 * 86400000);
  let seen = 0;
  // The iterator stops the moment the cap is passed, so a hostile rule costs
  // MAX_OCCURRENCES_PER_YEAR + 1 steps here, never its full expansion.
  rule.between(start, yearOn, true, () => {
    seen += 1;
    return seen <= MAX_OCCURRENCES_PER_YEAR;
  });
  if (seen > MAX_OCCURRENCES_PER_YEAR) return 'recurrenceRule repeats too often (more than daily)';
  return null;
}

/** An IANA zone the runtime knows ("America/Chicago"), or null/absent. */
const timeZoneSchema = z
  .string()
  .trim()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, { message: 'must be an IANA time zone, e.g. America/Chicago' })
  .nullable()
  .optional();

// Contract C1: the client's own id for one create. A UUID from TodoGeek,
// `ng:<32 hex>` from NoteGeek; any short opaque string is accepted.
const clientIdSchema = z.string().trim().min(1).max(100).nullable().optional();

// Contract C2: does dueDate carry a time? Absent/null → derived (legacy rule).
const hasDueTimeSchema = z.boolean().nullable().optional();

const contentSchema = (max = 2000) => z.string().trim().min(1).max(max);
const noteSchema = z.string().trim().max(5000).nullable().optional();

/**
 * `daysOfWeek` is deliberately NOT range/uniqueness-checked here:
 * `habitService.normalizeDays` already de-duplicates and drops anything
 * outside 0-6, and a test (todogeekHabits.test.js) exercises exactly that —
 * sending `[5, 1, 1, 9, -2]` and expecting `[1, 5]` back, not a rejection.
 * The bound below is just an abuse guard (a client cannot send a
 * million-entry array), not a schema for the values themselves.
 */
const daysOfWeekSchema = z.array(z.number().int()).max(50).optional();
const colorSchema = z.string().trim().max(32).nullable().optional();
const nameSchema = (max = 200) => z.string().trim().min(1).max(max);
const descriptionSchema = z.string().trim().max(2000).nullable().optional();

export const createTaskSchema = z
  .object({
    content: contentSchema(),
    signifier: signifierSchema,
    status: statusSchema,
    priority: prioritySchema,
    tags: tagsSchema,
    dueDate: instantField(),
    createdAt: instantField(),
    updatedAt: instantField(),
    note: noteSchema,
    recurrencePattern: recurrencePatternSchema,
    recurrenceRule: recurrenceRuleSchema,
    // Accepted so old clients still validate, and then IGNORED: a task is a
    // series master exactly when it carries a recurrenceRule
    // (taskService.createTask). A client-sent `true` with no rule made a task
    // that no view ever shows.
    isSeriesMaster: z.boolean().nullable().optional(),
    collectionId: idString.nullable().optional(),
    private: z.boolean().nullable().optional(),
    clientId: clientIdSchema,
    hasDueTime: hasDueTimeSchema,
    timeZone: timeZoneSchema,
  })
  .strict();

export const updateTaskInputSchema = z
  .object({
    content: contentSchema().optional(),
    signifier: signifierSchema,
    status: statusSchema,
    priority: prioritySchema,
    note: noteSchema,
    tags: tagsSchema,
    dueDate: instantField(),
    isBacklog: z.boolean().optional(),
    recurrencePattern: recurrencePatternSchema,
    recurrenceRule: recurrenceRuleSchema,
    collectionId: idString.nullable().optional(),
    private: z.boolean().nullable().optional(),
    hasDueTime: hasDueTimeSchema,
    timeZone: timeZoneSchema,
  })
  .strict();

export const updateTaskArgsSchema = z
  .object({
    id: idString,
    input: updateTaskInputSchema,
    editScope: z.enum(['THIS_INSTANCE', 'ALL_INSTANCES', 'FUTURE_INSTANCES']).nullable().optional(),
  })
  .strict();

export const addSubtaskArgsSchema = z
  .object({
    parentId: idString,
    content: contentSchema(),
    signifier: signifierSchema,
    status: statusSchema,
    priority: prioritySchema,
    tags: tagsSchema,
    dueDate: instantField(),
  })
  .strict();

export const reorderSubtasksArgsSchema = z
  .object({
    parentId: idString,
    // Empty is valid input — see todogeekSubtasks.test.js's "another user's
    // parent is simply not found", which reorders with `[]`.
    orderedSubtaskIds: z.array(idString).max(500),
  })
  .strict();

export const createHabitArgsSchema = z
  .object({
    name: nameSchema(),
    daysOfWeek: daysOfWeekSchema,
    color: colorSchema,
  })
  .strict();

export const updateHabitArgsSchema = z
  .object({
    id: idString,
    name: nameSchema().optional(),
    daysOfWeek: daysOfWeekSchema,
    color: colorSchema,
    archived: z.boolean().optional(),
  })
  .strict();

export const toggleHabitLogArgsSchema = z
  .object({
    habitId: idString,
    date: calendarDateField({ required: true }),
  })
  .strict();

export const createCollectionArgsSchema = z
  .object({
    name: nameSchema(),
    description: descriptionSchema,
  })
  .strict();

export const updateCollectionArgsSchema = z
  .object({
    id: idString,
    name: nameSchema().optional(),
    description: descriptionSchema,
    archived: z.boolean().optional(),
  })
  .strict();

export const createJournalFromTemplateArgsSchema = z
  .object({
    templateId: idString,
    date: instantField(),
  })
  .strict();

/**
 * `reviewDraft(weekStart:)` — the weekly review draft (AI_IDEAS.md #1).
 *
 * `weekStart` is a genuinely time-free value (which week, not which moment), so
 * it takes `calendarDateField` and lands on UTC midnight. It must also be a
 * **Monday**: the whole fact set is a Monday-to-Sunday window, and letting a
 * caller pass a Wednesday would silently produce a week nobody was looking at.
 * Rejecting it is cheaper than a review of the wrong seven days.
 */
export const reviewDraftArgsSchema = z
  .object({
    weekStart: calendarDateField({ required: true }).refine(
      (d) => d instanceof Date && d.getUTCDay() === 1,
      { message: 'must be a Monday — the review week runs Monday to Sunday' }
    ),
  })
  .strict();

/**
 * The per-day manual order (`saveDailyTaskOrder` / `dailyTaskOrder`) —
 * TodoGeek's Today drag-to-reorder, 2026-10-29.
 *
 * The ids here are NOT owned-resource lookups — nothing is fetched by them;
 * the list is stored as sent and matched against the caller's own tasks when
 * read — so the "ids are deliberately NOT format-validated" rule above, which
 * exists to keep "malformed" and "not yours" indistinguishable, does not apply.
 * Their SHAPE is checked instead, so the stored list can only ever hold the
 * two kinds of id a rendered day contains: a real task's ObjectId, or a
 * repeating task's virtual occurrence, `virtual_<masterId>_<epochMs>`.
 *
 * `dateKey` is the client's LOCAL calendar day, `yyyy-MM-dd`, kept as a
 * string (the key of the stored row, never a Date).
 */
export const MAX_ORDERED_TASK_IDS = 500;
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const VIRTUAL_ID = /^virtual_[0-9a-f]{24}_\d{1,16}$/i;
export const isOrderTaskId = (id) => typeof id === 'string' && (OBJECT_ID.test(id) || VIRTUAL_ID.test(id));

export const orderTaskIdString = z
  .string()
  .refine(isOrderTaskId, { message: 'must be a task id or a virtual_<id>_<epochMs> occurrence id' });

export const dateKeyString = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'must be a calendar day, yyyy-MM-dd');

export const saveDailyTaskOrderArgsSchema = z
  .object({
    dateKey: dateKeyString,
    orderedTaskIds: z.array(orderTaskIdString).max(MAX_ORDERED_TASK_IDS),
  })
  .strict();

export const dailyTaskOrderArgsSchema = z.object({ dateKey: dateKeyString }).strict();
