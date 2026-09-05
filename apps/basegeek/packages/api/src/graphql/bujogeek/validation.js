import { z } from 'zod';
import {
  idString,
  instantField,
  calendarDateField,
  validateInput,
} from '../shared/validation.js';

// `validateInput` lives in `graphql/shared/validation.js` now — bujogeek,
// notegeek and flockgeek all raise the same BAD_USER_INPUT shape. Re-exported
// here so this module stays the single import for bujogeek's resolvers and
// its test suite.
export { validateInput };

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
