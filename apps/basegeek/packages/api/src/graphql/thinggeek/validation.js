import { z } from 'zod';
import { GraphQLError } from 'graphql';
import { toUtcMidnight } from '@geeksuite/utils/dates';
import { idString, historicalDateField, validateInput, inRange, MIN_HISTORICAL_DATE } from '../shared/validation.js';
import constantsModule from '@geeksuite/schemas/thinggeek/constants';
import { DUE_BUCKETS } from './dates.js';

export { validateInput };

/**
 * Input validation for the thinggeek gateway (DOCS/THINGGEEK_PLAN.md). Same
 * machinery and rejection shape as every other module: a GraphQLError with
 * `extensions.code = 'BAD_USER_INPUT'` and `details [{path,message}]`.
 *
 * Every vocabulary is an enum from @geeksuite/schemas/thinggeek/constants.
 * Every schema is `.strict()`: a smuggled `householdId` is a rejection.
 *
 * What zod cannot know — whether a typeId/parentId/thingId belongs to the
 * household, whether a move makes a cycle or goes too deep, and whether
 * `attributes` fit the Thing's type — is checked by the resolver against the
 * database (`validateAttributes` below does the type check once the type is
 * loaded).
 *
 * Dates are calendar days (UTC midnight) with the historical floor: a 1987
 * purchase or a long-expired warranty is a fact, not a typo.
 */

const { FIELD_KINDS, DATE_KINDS, PHOTO_ROLES, DOCUMENT_ROLES, RELATIONSHIP_KINDS, THING_KINDS, MISSING_KEYS, bounds } = constantsModule;

/** The advertised `things` sorts. Each has a resolver arm AND an order test. */
export const THING_SORTS = Object.freeze(['name', 'recentlyAdded', 'acquired', 'value', 'nextDue', 'random']);
export const SORT_DIRS = Object.freeze(['asc', 'desc']);
export const TAG_MATCH_MODES = Object.freeze(['any', 'all']);
export const MAX_SAVED_FILTERS = 30;
/** Attribute `text` values. */
export const ATTRIBUTE_TEXT_MAX = 2000;
/** Attribute keys are stored as `attributes.<key>` paths: no dots, no `$`. */
export const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;

const LIST_MAX = bounds.listMax.max;

const enumOf = (values) => z.enum([...values]);
const nullableEnum = (values) => enumOf(values).nullable().optional();
const text = (max) => z.string().trim().max(max);
const optionalText = (max) => text(max).nullable().optional();
const currency = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter code' }));
const amount = z.number().finite().min(0, { message: 'amount must not be negative' });
const dateField = () => historicalDateField({ required: false });

const moneyInput = z.object({ amount: amount.nullable().optional(), currency: currency.nullable().optional() }).strict();

const acquiredInput = z
  .object({ date: dateField(), from: optionalText(200), price: moneyInput.nullable().optional() })
  .strict();

const valueInput = z
  .object({ amount: amount.nullable().optional(), currency: currency.nullable().optional(), asOf: dateField() })
  .strict();

const dateInput = z
  .object({
    id: idString.nullable().optional(),
    kind: enumOf(DATE_KINDS),
    label: optionalText(120),
    date: historicalDateField({ required: true }),
    recurEveryMonths: z.number().int().min(1).max(120).nullable().optional(),
    notes: optionalText(1000),
  })
  .strict();

const photoInput = z
  .object({ id: idString, role: nullableEnum(PHOTO_ROLES), caption: optionalText(300) })
  .strict();

const documentInput = z
  .object({ id: idString, role: nullableEnum(DOCUMENT_ROLES), title: optionalText(200) })
  .strict();

const relationshipInput = z.object({ kind: enumOf(RELATIONSHIP_KINDS), thingId: idString }).strict();

const tagList = z.array(z.string().trim().min(1).max(bounds.tag.maxlength)).max(LIST_MAX);

const thingFields = {
  typeId: idString.nullable().optional(),
  tags: tagList.nullable().optional(),
  parentId: idString.nullable().optional(),
  acquired: acquiredInput.nullable().optional(),
  value: valueInput.nullable().optional(),
  dates: z.array(dateInput).max(LIST_MAX).nullable().optional(),
  // Shape only here; the type check is validateAttributes, in the resolver.
  attributes: z.record(z.string(), z.unknown()).nullable().optional(),
  photos: z.array(photoInput).max(bounds.photosMax.max).nullable().optional(),
  documents: z.array(documentInput).max(bounds.documentsMax.max).nullable().optional(),
  relationships: z.array(relationshipInput).max(bounds.relationshipsMax.max).nullable().optional(),
  notes: optionalText(bounds.notes.maxlength),
};

const nameRequired = z.string().trim().min(1, { message: 'name is required' }).max(bounds.name.maxlength);

export const createThingArgsSchema = z
  .object({ input: z.object({ name: nameRequired, ...thingFields }).strict() })
  .strict();
// Update: every field optional; name never nullable (Thing.name: String!).
export const updateThingArgsSchema = z
  .object({ id: idString, input: z.object({ name: nameRequired.optional(), ...thingFields }).strict() })
  .strict();
export const idArgsSchema = z.object({ id: idString }).strict();

// ── Types ────────────────────────────────────────────────────────────────────

const typeFieldInput = z
  .object({
    key: z.string().trim().regex(FIELD_KEY_PATTERN, { message: 'key must be letters, digits or _ and start with a letter' }),
    label: z.string().trim().min(1).max(80),
    kind: enumOf(FIELD_KINDS),
    choices: z.array(z.string().trim().min(1).max(80)).max(LIST_MAX).nullable().optional(),
    unit: optionalText(20),
    identifier: z.boolean().nullable().optional(),
    required: z.boolean().nullable().optional(),
  })
  .strict()
  .refine((f) => f.kind !== 'choice' || (f.choices && f.choices.length > 0), {
    message: 'a choice field needs at least one choice',
    path: ['choices'],
  });

const typeFields = z
  .array(typeFieldInput)
  .max(bounds.fieldsMax.max)
  .refine((fields) => new Set(fields.map((f) => f.key)).size === fields.length, { message: 'field keys must be unique' });

const typeName = z.string().trim().min(1, { message: 'name is required' }).max(80);
const typeIcon = z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9]+$/, { message: 'icon must be an icon name' });

export const createThingTypeArgsSchema = z
  .object({
    input: z
      .object({
        name: typeName,
        icon: typeIcon.nullable().optional(),
        kind: nullableEnum(THING_KINDS),
        fields: typeFields.nullable().optional(),
      })
      .strict(),
  })
  .strict();
export const updateThingTypeArgsSchema = z
  .object({
    id: idString,
    input: z
      .object({
        name: typeName.optional(),
        icon: typeIcon.nullable().optional(),
        // Never null on update (ThingType.kind: String!): omit it to keep it.
        kind: enumOf(THING_KINDS).optional(),
        fields: typeFields.nullable().optional(),
      })
      .strict(),
  })
  .strict();

// ── Filters ──────────────────────────────────────────────────────────────────

const filterYear = z.number().int().min(1000).max(3000).nullable().optional();
const filterMoney = z.number().finite().nullable().optional();

/** ThingFilterInput — the query's and a saved view's, one schema. */
export const thingFilterInput = z
  .object({
    q: optionalText(500),
    types: z.array(idString).max(LIST_MAX).nullable().optional(),
    tags: tagList.nullable().optional(),
    tagMatch: nullableEnum(TAG_MATCH_MODES),
    within: z.array(idString).max(LIST_MAX).nullable().optional(),
    kinds: z.array(enumOf(THING_KINDS)).max(THING_KINDS.length).nullable().optional(),
    due: z.array(enumOf(DUE_BUCKETS)).max(DUE_BUCKETS.length).nullable().optional(),
    missing: z.array(enumOf(MISSING_KEYS)).max(MISSING_KEYS.length).nullable().optional(),
    hasPhotos: z.boolean().nullable().optional(),
    hasDocuments: z.boolean().nullable().optional(),
    acquiredYearMin: filterYear,
    acquiredYearMax: filterYear,
    valueMin: filterMoney,
    valueMax: filterMoney,
  })
  .strict()
  .refine((f) => f.acquiredYearMin == null || f.acquiredYearMax == null || f.acquiredYearMin <= f.acquiredYearMax, {
    message: 'acquiredYearMin must not be after acquiredYearMax',
    path: ['acquiredYearMax'],
  })
  .refine((f) => f.valueMin == null || f.valueMax == null || f.valueMin <= f.valueMax, {
    message: 'valueMin must not be more than valueMax',
    path: ['valueMax'],
  });

export const thingsArgsSchema = z
  .object({
    page: z.number().int().min(1).nullable().optional(),
    // Clamped (1..100) by the resolver, not rejected — like gamegeek's games.
    limit: z.number().int().nullable().optional(),
    filter: thingFilterInput.nullable().optional(),
    // Unknown sort is a rejection, never a silent fallback to name.
    sort: enumOf(THING_SORTS).nullable().optional(),
    sortDir: z
      .string()
      .trim()
      .transform((v) => v.toLowerCase())
      .pipe(enumOf(SORT_DIRS))
      .nullable()
      .optional(),
    seed: z.number().int().nullable().optional(),
  })
  .strict();

export const filterArgsSchema = z.object({ filter: thingFilterInput.nullable().optional() }).strict();

export const saveThingFilterArgsSchema = z
  .object({
    input: z
      .object({
        id: idString.nullable().optional(),
        name: z.string().trim().min(1, { message: 'Filter name is required' }).max(80),
        filter: thingFilterInput.nullable().optional(),
        sortBy: nullableEnum(THING_SORTS),
        sortDir: nullableEnum(SORT_DIRS),
      })
      .strict(),
  })
  .strict();

// ── Attributes against a type ────────────────────────────────────────────────

const isEmpty = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function badInput(details) {
  return new GraphQLError('Invalid input', { extensions: { code: 'BAD_USER_INPUT', http: { status: 400 }, details } });
}

/** One value against one field → the value to store, or throws a message string. */
function coerceAttribute(field, value) {
  switch (field.kind) {
    case 'text': {
      if (typeof value !== 'string') throw 'must be text';
      const v = value.trim();
      if (v.length > ATTRIBUTE_TEXT_MAX) throw `must be ${ATTRIBUTE_TEXT_MAX} characters or fewer`;
      return v;
    }
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw 'must be a number';
      return value;
    case 'date': {
      if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') throw 'must be a date';
      const d = toUtcMidnight(value);
      if (!d || Number.isNaN(d.getTime())) throw 'must be a valid calendar date (YYYY-MM-DD)';
      if (!inRange(d, MIN_HISTORICAL_DATE)) throw 'date is out of range';
      return d;
    }
    case 'choice':
      if (typeof value !== 'string' || !(field.choices ?? []).includes(value)) {
        throw `must be one of ${(field.choices ?? []).join(', ')}`;
      }
      return value;
    case 'money': {
      const parsed = z
        .object({ amount: amount, currency: currency.nullable().optional() })
        .strict()
        .safeParse(value);
      if (!parsed.success) throw 'must be { amount ≥ 0, currency }';
      return { amount: parsed.data.amount, currency: parsed.data.currency ?? 'USD' };
    }
    case 'url': {
      if (typeof value !== 'string' || value.length > ATTRIBUTE_TEXT_MAX) throw 'must be a URL';
      let u;
      try {
        u = new URL(value.trim());
      } catch {
        throw 'must be a URL';
      }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw 'must be an http or https URL';
      return value.trim();
    }
    case 'boolean':
      if (typeof value !== 'boolean') throw 'must be true or false';
      return value;
    default:
      throw `unknown field kind ${field.kind}`;
  }
}

/**
 * Validate `attributes` against a type's fields.
 *   - unknown keys are rejected;
 *   - null / '' means "clear this attribute" (returned in `unset`);
 *   - `requireAll` (create only) enforces the type's `required` fields.
 * @returns {{ set: Record<string, unknown>, unset: string[] }}
 */
export function validateAttributes(attributes, fields, { requireAll = false } = {}) {
  const byKey = new Map((fields ?? []).map((f) => [f.key, f]));
  const details = [];
  const set = {};
  const unset = [];
  for (const [key, value] of Object.entries(attributes ?? {})) {
    const field = byKey.get(key);
    if (!field) {
      details.push({ path: `input.attributes.${key}`, message: 'is not a field of this type' });
      continue;
    }
    if (isEmpty(value)) {
      unset.push(key);
      continue;
    }
    try {
      set[key] = coerceAttribute(field, value);
    } catch (message) {
      details.push({ path: `input.attributes.${key}`, message: String(message) });
    }
  }
  if (requireAll) {
    for (const f of fields ?? []) {
      if (f.required && !(f.key in set)) details.push({ path: `input.attributes.${f.key}`, message: `${f.label} is required` });
    }
  }
  if (details.length) throw badInput(details);
  return { set, unset };
}

export function inputError(path, message) {
  return badInput([{ path, message }]);
}
