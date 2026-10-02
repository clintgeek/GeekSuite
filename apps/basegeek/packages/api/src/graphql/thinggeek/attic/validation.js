import { z } from 'zod';
import { GraphQLError } from 'graphql';
import { idString, historicalDateField, validateInput } from '../../shared/validation.js';
import atticModule from '@geeksuite/schemas/thinggeek/attic';

/**
 * Input validation for the Attic (DOCS/THINGGEEK_PLAN.md "The Attic"). Same
 * rejection shape as the rest of the gateway: BAD_USER_INPUT + details.
 * Every schema is strict: a smuggled householdId, `secrets` or file bytes
 * is a rejection, not an ignored key.
 *
 * `fields` is checked against the document's type once it is loaded
 * (validateDocumentFields): only NON-identifier keys are accepted, so a
 * plaintext passport number can never be written through the gateway.
 */
const { ATTIC_FIELD_KINDS, ATTIC_FILE_SIDES, atticBounds } = atticModule;

export { validateInput };

/** Field keys become `fields.<key>` / `secrets.<key>` paths: no dots, no `$`. */
export const ATTIC_FIELD_KEY = /^[A-Za-z][A-Za-z0-9_]{0,59}$/;

const text = (max) => z.string().trim().max(max);
const optionalText = (max) => text(max).nullable().optional();
const dateField = () => historicalDateField({ required: false });

const personInput = z
  .object({
    name: text(atticBounds.name.maxlength).min(1, { message: 'name is required' }).optional(),
    relation: optionalText(60),
    birthDate: dateField(),
  })
  .strict();

export const createPersonArgsSchema = z
  .object({ input: personInput.refine((v) => v.name, { message: 'name is required', path: ['name'] }) })
  .strict();
export const updatePersonArgsSchema = z.object({ id: idString, input: personInput }).strict();

const typeFieldInput = z
  .object({
    key: z.string().trim().regex(ATTIC_FIELD_KEY, { message: 'key must start with a letter: letters, digits, _' }),
    label: text(80).min(1),
    kind: z.enum([...ATTIC_FIELD_KINDS]),
    choices: z.array(text(80).min(1)).max(40).nullable().optional(),
    identifier: z.boolean().nullable().optional(),
    strict: z.boolean().nullable().optional(),
    required: z.boolean().nullable().optional(),
  })
  .strict();

const typeInput = z
  .object({
    name: text(80).min(1).optional(),
    icon: optionalText(60),
    issuedLabel: optionalText(60),
    expiryLabel: optionalText(60),
    expiryWarnDays: z.number().int().min(atticBounds.warnDays.min).max(atticBounds.warnDays.max).nullable().optional(),
    fields: z
      .array(typeFieldInput)
      .max(atticBounds.fieldsMax.max)
      .refine((fs) => new Set(fs.map((f) => f.key)).size === fs.length, { message: 'field keys must be unique' })
      .nullable()
      .optional(),
  })
  .strict();

export const createTypeArgsSchema = z
  .object({ input: typeInput.refine((v) => v.name, { message: 'name is required', path: ['name'] }) })
  .strict();
export const updateTypeArgsSchema = z.object({ id: idString, input: typeInput }).strict();

const fileInput = z
  .object({ id: idString, side: z.enum([...ATTIC_FILE_SIDES]).nullable().optional(), caption: optionalText(200) })
  .strict();

const documentInput = z
  .object({
    typeId: idString.optional(),
    personIds: z.array(idString).max(atticBounds.peoplePerDocument.max).nullable().optional(),
    title: optionalText(atticBounds.title.maxlength),
    fields: z.record(z.string(), z.unknown()).nullable().optional(),
    issued: dateField(),
    expires: dateField(),
    files: z.array(fileInput).max(atticBounds.filesPerDocument.max).nullable().optional(),
    links: z.array(idString).max(atticBounds.linksPerDocument.max).nullable().optional(),
    notes: optionalText(atticBounds.notes.maxlength),
  })
  .strict();

export const createDocumentArgsSchema = z
  .object({ input: documentInput.refine((v) => v.typeId, { message: 'typeId is required', path: ['typeId'] }) })
  .strict();
export const updateDocumentArgsSchema = z.object({ id: idString, input: documentInput }).strict();

export const idArgsSchema = z.object({ id: idString }).strict();
export const documentsArgsSchema = z
  .object({ personId: idString.nullable().optional(), typeId: idString.nullable().optional() })
  .strict();
export const accessLogArgsSchema = z.object({ limit: z.number().int().min(1).max(200).nullable().optional() }).strict();

function badInput(details) {
  return new GraphQLError('Invalid input', { extensions: { code: 'BAD_USER_INPUT', http: { status: 400 }, details } });
}

export function inputError(path, message) {
  return badInput([{ path, message }]);
}

const dateOnly = historicalDateField({ required: true });

/** One plain value against one field → the value to store; throws a message string. */
function coerce(field, value) {
  switch (field.kind) {
    case 'text': {
      if (typeof value !== 'string') throw 'must be text';
      const v = value.trim();
      if (v.length > atticBounds.fieldValue.maxlength) throw `must be ${atticBounds.fieldValue.maxlength} characters or fewer`;
      return v;
    }
    case 'number': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      if (typeof n !== 'number' || !Number.isFinite(n)) throw 'must be a number';
      return n;
    }
    case 'date': {
      const r = dateOnly.safeParse(value);
      if (!r.success) throw r.error.issues[0]?.message || 'must be a date';
      return r.data;
    }
    case 'choice': {
      if (typeof value !== 'string' || !(field.choices ?? []).includes(value)) throw `must be one of: ${(field.choices ?? []).join(', ')}`;
      return value;
    }
    case 'url': {
      if (typeof value !== 'string') throw 'must be a link';
      const v = value.trim();
      if (v.length > atticBounds.fieldValue.maxlength || !/^https?:\/\/\S+$/i.test(v)) throw 'must be an http(s) link';
      return v;
    }
    default:
      throw 'unknown field kind';
  }
}

const blank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * `fields` against the document's type → the full plain map to store.
 * Identifier keys are REFUSED (their values belong to the backend, sealed);
 * unknown keys are refused; empty values drop the key. `required` plain
 * fields must be present (after merging onto `existing` on an update).
 */
export function validateDocumentFields(type, fields, existing = {}) {
  const byKey = new Map((type?.fields ?? []).map((f) => [f.key, f]));
  const out = { ...(existing ?? {}) };
  const details = [];
  for (const [key, value] of Object.entries(fields ?? {})) {
    const field = byKey.get(key);
    if (!field) {
      details.push({ path: `input.fields.${key}`, message: 'not a field of this document type' });
      continue;
    }
    if (field.identifier) {
      details.push({ path: `input.fields.${key}`, message: 'identifier values are sealed by the Attic, not sent here' });
      continue;
    }
    if (blank(value)) {
      delete out[key];
      continue;
    }
    try {
      out[key] = coerce(field, value);
    } catch (message) {
      details.push({ path: `input.fields.${key}`, message: String(message) });
    }
  }
  // Keys no longer on the type (a field the household removed) are dropped.
  for (const key of Object.keys(out)) {
    const f = byKey.get(key);
    if (!f || f.identifier) delete out[key];
  }
  for (const f of type?.fields ?? []) {
    if (f.required && !f.identifier && blank(out[f.key])) details.push({ path: `input.fields.${f.key}`, message: `${f.label} is required` });
  }
  if (details.length) throw badInput(details);
  return out;
}
