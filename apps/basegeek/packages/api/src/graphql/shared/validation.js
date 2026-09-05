import { z } from 'zod';
import { GraphQLError } from 'graphql';
import { toUtcMidnight } from '@geeksuite/utils/dates';

/**
 * Primitives shared by every gateway module's input-validation layer —
 * SUITE_TODO's "input validation (Joi/Zod)" item (`DOCS/TODO_ORDER.md` #22).
 *
 * Each module owns its own `validation.js` with one strict schema per mutation
 * family; what lives here is only the machinery those schemas are built from,
 * so that a rejection from bujogeek, notegeek and flockgeek is the *same*
 * rejection: a `GraphQLError` with `extensions.code = 'BAD_USER_INPUT'` and a
 * `details` array of `{ path, message }`.
 *
 * ## The two kinds of date
 *
 * `packages/utils/src/dates.js` draws the line the whole suite respects: a
 * *calendar date* (no time-of-day, stored as UTC midnight) versus an *instant*
 * (a real moment, read in whatever timezone matters). Which one a field is is
 * a per-field decision made in the module that owns it — see the module docs.
 * `instantField()` parses and range-checks but preserves time-of-day;
 * `calendarDateField()` additionally normalizes through `toUtcMidnight`.
 *
 * ## ids are deliberately NOT format-validated
 *
 * Owned-resource lookups across the gateway treat a malformed id and a
 * missing/foreign one as indistinguishable on purpose. Rejecting a malformed
 * id here, before the resolver ever reaches its service or model, would
 * surface a different error (BAD_USER_INPUT vs. the module's own plain "not
 * found"/"Invalid ID format") for exactly the case those lookups were written
 * to hide, and several ownership suites assert those exact messages. So an id
 * field is validated only as a non-empty, bounded string — never as a
 * 24-hex-char ObjectId shape.
 */

/**
 * The default floor: 2000-01-01. Every date the suite *schedules* — a due
 * date, a hatch date, a habit log — is a recent or near-future day, and a
 * date below this floor is a typo or a unix-epoch zero, not a real value.
 */
export const MIN_DATE = new Date(Date.UTC(2000, 0, 1));

/**
 * The floor for a date that is a *historical fact* rather than a scheduling
 * value — a book's publication date, say. The 2000 floor is correct for
 * everything the suite plans, and catastrophically wrong for anything it
 * merely records: with it in place, every metadata edit on a pre-2000 book
 * was rejected outright, because the edit dialog resends `publishedDate`
 * unchanged (BURN_REVIEW #1). 1000-01-01 keeps the typo/epoch-zero catch
 * without arguing with the printing press.
 */
export const MIN_HISTORICAL_DATE = new Date(Date.UTC(1000, 0, 1));

export const MAX_YEARS_OUT = 10;

export function maxDate() {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + MAX_YEARS_OUT);
  return d;
}

export function inRange(d, min = MIN_DATE) {
  return d >= min && d <= maxDate();
}

const outOfRangeMessage = (min) =>
  `date must be between ${min.toISOString().slice(0, 10)} and ${MAX_YEARS_OUT} years from now`;

/** A reference to another document — see the module doc above for why this is
 *  deliberately not ObjectId-shape-validated. */
export const idString = z.string().trim().min(1).max(256);

/**
 * An instant: a `Date`, an ISO string, or epoch millis. Parsed and
 * range-checked; the time-of-day (if any) is preserved exactly.
 */
export function instantField({ required = false, min = MIN_DATE } = {}) {
  const base = z.union([z.date(), z.string().trim().min(1), z.number()]);
  const optional = required ? base : base.nullable().optional();
  return optional.transform((val, ctx) => {
    if (val === null || val === undefined) return val;
    const d = val instanceof Date ? val : new Date(val);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a valid date' });
      return z.NEVER;
    }
    if (!inRange(d, min)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: outOfRangeMessage(min) });
      return z.NEVER;
    }
    return d;
  });
}

/**
 * A calendar date — no time-of-day, always UTC midnight. Normalizes through
 * `@geeksuite/utils`'s `toUtcMidnight`, so a client that sends a full instant
 * for a day-granularity field stores the same day everybody else stores.
 */
export function calendarDateField({ required = true, min = MIN_DATE } = {}) {
  const base = z.union([z.date(), z.string().trim().min(1), z.number()]);
  const optional = required ? base : base.nullable().optional();
  return optional.transform((val, ctx) => {
    if (val === null || val === undefined) return val;
    const normalized = toUtcMidnight(val);
    if (!normalized || Number.isNaN(normalized.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a valid calendar date (YYYY-MM-DD)' });
      return z.NEVER;
    }
    if (!inRange(normalized, min)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: outOfRangeMessage(min) });
      return z.NEVER;
    }
    return normalized;
  });
}

/**
 * A calendar date that records something that *already happened*, possibly
 * long ago — the `MIN_HISTORICAL_DATE` floor instead of the scheduling one,
 * same "10 years out" ceiling, same UTC-midnight normalization.
 *
 * Use it for a date that is a fact about the world (a book's publication
 * date); keep `calendarDateField()` for a date the suite plans or logs
 * (a hatch date, a habit day, a due date). If you are unsure which you have,
 * ask whether a value from 1965 would be a bug. If it would not, it belongs
 * here.
 */
export function historicalDateField({ required = false } = {}) {
  return calendarDateField({ required, min: MIN_HISTORICAL_DATE });
}

/**
 * Wrap a zod schema as a resolver-arg validator. Throws a `GraphQLError` with
 * `extensions.code = 'BAD_USER_INPUT'` and a `details` array — the same shape
 * for every validated gateway mutation, mirroring the modules' existing
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
