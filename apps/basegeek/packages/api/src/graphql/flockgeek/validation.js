import { z } from 'zod';
import { idString, calendarDateField, validateInput } from '../shared/validation.js';

export { validateInput };

/**
 * Input validation for the flockgeek gateway mutations — `DOCS/TODO_ORDER.md`
 * #22, the same layer bujogeek got in `3265b1c`. One strict schema per
 * mutation family; every rejection is one shape (`GraphQLError`,
 * `extensions.code = 'BAD_USER_INPUT'`, `extensions.details [{path,message}]`)
 * built by the shared `validateInput`.
 *
 * ## Every date here is a CALENDAR date
 *
 * Unlike bujogeek — where a task's `dueDate` can carry a real reminder hour —
 * nothing FlockGeek records happens at a time of day. Hatch date, set date,
 * status date, group start/end, pairing date, harvest date, egg-collection
 * date, health-event date: all of them are days. Every form that writes one is
 * an `<input type="date">` sending `YYYY-MM-DD`, and `4856227` fixed the read
 * side to match — those forms now prefill through `utcDateString`, the
 * calendar accessor, because reading a stored UTC midnight with the *local*
 * accessor rolls the day back for anyone west of UTC.
 *
 * So every date field below goes through `calendarDateField()`, which
 * normalizes with `@geeksuite/utils`'s `toUtcMidnight`. For the frontend this
 * is a no-op (`new Date('2026-09-05')` is already UTC midnight); what it fixes
 * is any other client sending a full instant for a day-granularity field, which
 * would otherwise store 06:00Z and read back as the previous day west of UTC.
 *
 * ## ids stay strings
 *
 * See `../shared/validation.js`. `resolvers.js` has its own `validateId`
 * (`Invalid ID format: …`) and `assertOwned`/`updateOwned` deliberately report
 * a foreign id as a plain `<Label> not found`; `flockgeekOwnership.test.js`
 * asserts those exact messages. An id is therefore bounded here as a string
 * and left to the resolver to interpret.
 *
 * `assertOwned` also treats `''` as "no reference at all" and returns early,
 * so an *optional* reference accepts the empty string — `refIdString` below —
 * while a required one does not (`new Model({ pairingId: '' })` would only
 * fail later, in a mongoose cast).
 *
 * ## Enums come from the models, and only from the models
 *
 * `sex`, `origin`, `status`, `eggSize`, a location's `type`, a health record's
 * `type`/`outcome` and a meat run's `status` are all `enum:` in
 * `models/*.js`, and mongoose only enforces those on `.save()` — a
 * `findOneAndUpdate` runs with `runValidators` off, so until now
 * `updateBird(status: "anything")` was accepted. These schemas close that.
 *
 * A group's `purpose` and `type` are the exception: the GraphQL schema takes
 * them but `models/Group.js` declares neither, so mongoose's strict mode drops
 * them on write. Constraining them to an enum would guard nothing that is
 * stored; they are bounded strings until the model grows the fields.
 */

// ── Shared field shapes ──────────────────────────────────────────────────────

/** An optional reference. `''` means "none" — `assertOwned`'s own contract. */
const refIdString = z.union([z.literal(''), idString]).nullable().optional();
const refIdArray = z.array(idString).max(500).nullable().optional();

const nameSchema = (max = 200) => z.string().trim().min(1).max(max);
const optionalName = (max = 200) => z.string().trim().max(max).nullable().optional();
const notesSchema = z.string().trim().max(5000).nullable().optional();
const descriptionSchema = z.string().trim().max(2000).nullable().optional();
const colorSchema = z.string().trim().max(32).nullable().optional();

/** A count of birds, eggs or days. Never negative, never a fraction. */
const countSchema = (max = 100_000) => z.number().int().min(0).max(max).nullable().optional();
const requiredCount = (max = 100_000) => z.number().int().min(0).max(max);
/** Grams. A chicken is ~2 000g; the ceiling is an abuse guard, not a limit. */
const gramsSchema = z.number().min(0).max(1_000_000).nullable().optional();

// Model enums — `models/Bird.js`, `models/Location.js`, `models/EggProduction.js`,
// `models/HealthRecord.js`, `models/MeatRun.js`.
const sexSchema = z.enum(['pullet', 'hen', 'cockerel', 'rooster', 'unknown']).nullable().optional();
const originSchema = z.enum(['own_egg', 'purchased', 'traded', 'rescued', 'unknown']).nullable().optional();
// Note the space: `"meat run"`, not `"meat_run"`.
const birdStatusSchema = z.enum(['active', 'meat run', 'retired']).nullable().optional();
const locationTypeSchema = z.enum(['tractor', 'coop', 'breeding_pen', 'brooder', 'other']);
const eggSizeSchema = z.enum(['peewee', 'small', 'medium', 'large', 'xl', 'jumbo', 'unknown']).nullable().optional();
const healthTypeSchema = z.enum(['illness', 'injury', 'treatment', 'vaccination', 'checkup', 'cull']);
const healthOutcomeSchema = z.enum(['recovered', 'ongoing', 'deceased', 'culled', 'NA']).nullable().optional();
const meatRunStatusSchema = z.enum(['growing', 'harvested', 'cancelled']).nullable().optional();

// ── Birds ────────────────────────────────────────────────────────────────────

export const createBirdArgsSchema = z
  .object({
    name: optionalName(),
    tagId: nameSchema(100),
    species: optionalName(100),
    breed: optionalName(100),
    sex: sexSchema,
    status: birdStatusSchema,
    notes: notesSchema,
    hatchDate: calendarDateField({ required: false }),
    origin: originSchema,
  })
  .strict();

export const updateBirdArgsSchema = z
  .object({
    id: idString,
    name: optionalName(),
    tagId: nameSchema(100).optional(),
    status: birdStatusSchema,
    notes: notesSchema,
    locationId: refIdString,
    sex: sexSchema,
  })
  .strict();

// ── Groups (broods) ──────────────────────────────────────────────────────────

export const createFlockGroupArgsSchema = z
  .object({
    name: nameSchema(),
    // Not on `models/Group.js` — see the module doc.
    purpose: optionalName(100),
    type: optionalName(100),
    startDate: calendarDateField({ required: true }),
    endDate: calendarDateField({ required: false }),
    description: descriptionSchema,
    notes: notesSchema,
  })
  .strict();

export const updateFlockGroupArgsSchema = z
  .object({
    id: idString,
    name: nameSchema().optional(),
    purpose: optionalName(100),
    type: optionalName(100),
    startDate: calendarDateField({ required: false }),
    endDate: calendarDateField({ required: false }),
    description: descriptionSchema,
    notes: notesSchema,
  })
  .strict();

// ── Locations ────────────────────────────────────────────────────────────────

export const createFlockLocationArgsSchema = z
  .object({
    name: nameSchema(),
    type: locationTypeSchema,
    capacity: countSchema(1_000_000),
    description: descriptionSchema,
    notes: notesSchema,
  })
  .strict();

export const updateFlockLocationArgsSchema = z
  .object({
    id: idString,
    name: nameSchema().optional(),
    type: locationTypeSchema.optional(),
    capacity: countSchema(1_000_000),
    isActive: z.boolean().nullable().optional(),
    description: descriptionSchema,
    notes: notesSchema,
  })
  .strict();

// ── Egg production ───────────────────────────────────────────────────────────

export const recordEggProductionArgsSchema = z
  .object({
    birdId: refIdString,
    groupId: refIdString,
    locationId: refIdString,
    date: calendarDateField({ required: true }),
    eggsCount: requiredCount(),
    daysObserved: countSchema(10_000),
    avgEggWeightGrams: gramsSchema,
    eggColor: colorSchema,
    eggSize: eggSizeSchema,
    notes: notesSchema,
  })
  .strict();

export const updateEggProductionArgsSchema = z
  .object({
    id: idString,
    date: calendarDateField({ required: false }),
    eggsCount: countSchema(),
    daysObserved: countSchema(10_000),
    locationId: refIdString,
    notes: notesSchema,
  })
  .strict();

// ── Pairings ─────────────────────────────────────────────────────────────────

export const createPairingArgsSchema = z
  .object({
    name: nameSchema(),
    roosterIds: refIdArray,
    henIds: refIdArray,
    pairingDate: calendarDateField({ required: false }),
    active: z.boolean().nullable().optional(),
    notes: notesSchema,
  })
  .strict();

export const updatePairingArgsSchema = z
  .object({
    id: idString,
    name: nameSchema().optional(),
    roosterIds: refIdArray,
    henIds: refIdArray,
    pairingDate: calendarDateField({ required: false }),
    active: z.boolean().nullable().optional(),
    notes: notesSchema,
  })
  .strict();

// ── Hatch events ─────────────────────────────────────────────────────────────

export const recordHatchEventArgsSchema = z
  .object({
    setDate: calendarDateField({ required: true }),
    hatchDate: calendarDateField({ required: false }),
    eggsSet: requiredCount(),
    notes: notesSchema,
  })
  .strict();

export const updateHatchEventArgsSchema = z
  .object({
    id: idString,
    setDate: calendarDateField({ required: false }),
    hatchDate: calendarDateField({ required: false }),
    eggsSet: countSchema(),
    eggsFertile: countSchema(),
    chicksHatched: countSchema(),
    pullets: countSchema(),
    cockerels: countSchema(),
    notes: notesSchema,
  })
  .strict();

// ── Meat runs ────────────────────────────────────────────────────────────────

export const createMeatRunArgsSchema = z
  .object({
    pairingId: idString,
    hatchEventId: refIdString,
    name: optionalName(),
    startDate: calendarDateField({ required: true }),
    startCount: requiredCount(),
    notes: notesSchema,
  })
  .strict();

export const updateMeatRunArgsSchema = z
  .object({
    id: idString,
    harvestDate: calendarDateField({ required: false }),
    harvestCount: countSchema(),
    mortalityCount: countSchema(),
    avgWeightGrams: gramsSchema,
    status: meatRunStatusSchema,
    notes: notesSchema,
  })
  .strict();

// ── Health records ───────────────────────────────────────────────────────────

export const addHealthRecordArgsSchema = z
  .object({
    birdId: idString,
    eventDate: calendarDateField({ required: true }),
    type: healthTypeSchema,
    diagnosis: descriptionSchema,
    treatment: descriptionSchema,
    outcome: healthOutcomeSchema,
    notes: notesSchema,
  })
  .strict();

// ── Soft delete ──────────────────────────────────────────────────────────────

/**
 * `type` is a dispatch key, not a stored field: the resolver lower-cases it and
 * looks it up in its own `modelMap`, answering an unknown key with
 * `Unsupported entity type for deletion: …` before touching the database. That
 * message is more useful than a generic enum failure and costs nothing, so this
 * only bounds the string.
 */
export const deleteFlockEntityArgsSchema = z
  .object({
    type: z.string().trim().min(1).max(64),
    id: idString,
  })
  .strict();
