import { z } from 'zod';
import { GraphQLError } from 'graphql';
import { toUtcMidnight } from '@geeksuite/utils/dates';

/**
 * Input validation for the bujogeek mutations — SUITE_TODO's "input
 * validation (Joi/Zod)" item, flagged there for "client-controllable
 * timestamps, unbounded strings" (DOCS/SUITE_TODO.md).
 *
 * ## The two kinds of date, again
 *
 * `packages/utils/src/dates.js` draws the line the whole suite is supposed to
 * respect: a *calendar date* (no time-of-day, stored as UTC midnight) versus
 * an *instant* (a real moment, read in whatever timezone matters). BuJoGeek's
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

const MIN_DATE = new Date(Date.UTC(2000, 0, 1));
const MAX_YEARS_OUT = 10;

function maxDate() {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + MAX_YEARS_OUT);
  return d;
}

function inRange(d) {
  return d >= MIN_DATE && d <= maxDate();
}

// A reference to somebody else's document — see the module doc above for why
// this is deliberately not ObjectId-shape-validated.
const idString = z.string().trim().min(1).max(256);

/**
 * An instant: a Date, an ISO string, or epoch millis. Parsed and
 * range-checked; the time-of-day (if any) is preserved exactly, because a
 * task's dueDate may encode a real reminder time (see module doc).
 */
function instantField({ required = false } = {}) {
  const base = z.union([z.date(), z.string().trim().min(1), z.number()]);
  const optional = required ? base : base.nullable().optional();
  return optional.transform((val, ctx) => {
    if (val === null || val === undefined) return val;
    const d = val instanceof Date ? val : new Date(val);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a valid date' });
      return z.NEVER;
    }
    if (!inRange(d)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `date must be between ${MIN_DATE.toISOString().slice(0, 10)} and ${MAX_YEARS_OUT} years from now`,
      });
      return z.NEVER;
    }
    return d;
  });
}

/**
 * A calendar date — no time-of-day, always UTC midnight. Normalizes through
 * `@geeksuite/utils`'s `toUtcMidnight`, the same rule `habitService` already
 * applies internally, so this is a validation gate in front of an existing
 * normalization, not a new one.
 */
function calendarDateField({ required = true } = {}) {
  const base = z.union([z.date(), z.string().trim().min(1)]);
  const optional = required ? base : base.nullable().optional();
  return optional.transform((val, ctx) => {
    if (val === null || val === undefined) return val;
    const normalized = toUtcMidnight(val);
    if (!normalized || Number.isNaN(normalized.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a valid calendar date (YYYY-MM-DD)' });
      return z.NEVER;
    }
    if (!inRange(normalized)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `date must be between ${MIN_DATE.toISOString().slice(0, 10)} and ${MAX_YEARS_OUT} years from now`,
      });
      return z.NEVER;
    }
    return normalized;
  });
}

const signifierSchema = z.enum(['*', '@', 'x', '<', '>', '-', '!', '?', '#']).nullable().optional();
const statusSchema = z
  .enum(['pending', 'completed', 'migrated_back', 'migrated_future', 'cancelled', 'blocked'])
  .nullable()
  .optional();
const prioritySchema = z.number().int().min(1).max(3).nullable().optional();
const tagsSchema = z.array(z.string().trim().max(100)).max(50).optional();
// The legacy shim (taskService.recurrencePatternToRRule) accepts these four;
// anything else is already a no-op there, so the enum matches its own input.
const recurrencePatternSchema = z.enum(['none', 'daily', 'weekly', 'monthly']).nullable().optional();
// `DTSTART:...\nRRULE:...` — a real newline, so no single-line pattern here.
const recurrenceRuleSchema = z.string().trim().max(1000).nullable().optional();
const contentSchema = (max = 2000) => z.string().trim().min(1).max(max);
const noteSchema = z.string().trim().max(5000).nullable().optional();

/**
 * `daysOfWeek` is deliberately NOT range/uniqueness-checked here:
 * `habitService.normalizeDays` already de-duplicates and drops anything
 * outside 0-6, and a test (bujogeekHabits.test.js) exercises exactly that —
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
    isSeriesMaster: z.boolean().optional(),
    collectionId: idString.nullable().optional(),
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
    // Empty is valid input — see bujogeekSubtasks.test.js's "another user's
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
 * Wrap a zod schema as a resolver-arg validator. Throws a `GraphQLError` with
 * `extensions.code = 'BAD_USER_INPUT'` and a `details` array — the same shape
 * for every bujogeek mutation, mirroring `rethrowUserError`'s existing
 * 400-style translation of a service-layer error.
 */
export function validateInput(schema) {
  return function validate(args) {
    const result = schema.safeParse(args);
    if (result.success) return result.data;
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new GraphQLError('Invalid input', {
      extensions: { code: 'BAD_USER_INPUT', http: { status: 400 }, details },
    });
  };
}
