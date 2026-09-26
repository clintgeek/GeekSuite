import mongoose from 'mongoose';
import { GraphQLError } from 'graphql';
import { Thing } from './models/thing.js';
import { ThingType } from './models/thingType.js';
import { Place } from './models/place.js';
import { ThingFile } from './models/file.js';
import { ThingProfile } from './models/profile.js';
import householdModule from '@geeksuite/schemas/thinggeek/household';
import constantsModule from '@geeksuite/schemas/thinggeek/constants';
import { nullsLastSort, pageArgs, pageFacetStage, randomSortKey, shapePage } from '@geeksuite/collection/server';
import {
  buildPlaceTree,
  baseMatch,
  facetsPipeline,
  filteredStages,
  HELPER_FIELDS,
  identifierTypes,
  missingClause,
  shapeFacets,
} from './filters.js';
import { SOON_DAYS, addDays, dueBucketClause, nextDueOf, occurrenceIn, occurrenceStages, renderDate, todayUtc } from './dates.js';
import {
  validateInput,
  validateAttributes,
  inputError,
  THING_SORTS,
  MAX_SAVED_FILTERS,
  thingsArgsSchema,
  filterArgsSchema,
  idArgsSchema,
  createThingArgsSchema,
  updateThingArgsSchema,
  createThingTypeArgsSchema,
  updateThingTypeArgsSchema,
  createPlaceArgsSchema,
  updatePlaceArgsSchema,
  saveThingFilterArgsSchema,
} from './validation.js';

/**
 * ThingGeek gateway — DOCS/THINGGEEK_PLAN.md. The household inventory:
 * firearms and their serials live here, so the tenancy rules are the point.
 *
 * ## Tenancy + the member gate
 *
 * Every resolver (root AND field) opens with
 *     const userId = requireUser(user);
 *     const householdId = resolveHouseholdId(user);
 * `resolveHouseholdId` (below, wrapping @geeksuite/schemas/thinggeek/household)
 * throws NOT_A_MEMBER for any signed-in account not on the member list —
 * before input validation, before any read. Every Thing/ThingType/Place/
 * ThingFile filter carries `householdId` as a literal; Thing reads also carry
 * `deletedAt: null` except trashedThings/restoreThing. No input accepts a
 * householdId (every zod schema is strict).
 *
 * References (typeId, placeId, relationship thingIds) are checked against
 * the household before they are written, and re-scoped when read: a stored
 * id that points outside the household (or at a trashed thing) renders as
 * nothing rather than as someone else's data.
 *
 * ## Per-request caching
 *
 * The household's types and places (small, and needed by nearly every
 * field), file records, relationship targets and counts are loaded once per
 * request and hung off the GraphQL context (a WeakMap). Every mutation drops
 * that cache before returning, so the fields of the thing it returns are
 * resolved against what it just wrote.
 */

const { resolveHouseholdId: resolveThingHousehold } = householdModule;
const {
  FIELD_KINDS,
  DATE_KINDS,
  PHOTO_ROLES,
  DOCUMENT_ROLES,
  RELATIONSHIP_KINDS,
  MISSING_KEYS,
  STARTER_TYPES,
  TRASH_DAYS,
  bounds,
} = constantsModule;

const validateThings = validateInput(thingsArgsSchema);
const validateFilterArgs = validateInput(filterArgsSchema);
const validateId = validateInput(idArgsSchema);
const validateCreateThing = validateInput(createThingArgsSchema);
const validateUpdateThing = validateInput(updateThingArgsSchema);
const validateCreateThingType = validateInput(createThingTypeArgsSchema);
const validateUpdateThingType = validateInput(updateThingTypeArgsSchema);
const validateCreatePlace = validateInput(createPlaceArgsSchema);
const validateUpdatePlace = validateInput(updatePlaceArgsSchema);
const validateSaveThingFilter = validateInput(saveThingFilterArgsSchema);

const TRASH_LIST_MAX = 500;
const ATTENTION_MAX = 20;
const DEFAULT_CURRENCY = 'USD';

// ── Errors + the gate ────────────────────────────────────────────────────────

function codedError(message, code) {
  const err = new GraphQLError(message, { extensions: { code } });
  err.code = code;
  return err;
}

/** Same message and code as gamegeek's. */
function requireUser(user) {
  if (!user?.id) throw codedError('Unauthorized', 'UNAUTHORIZED');
  return String(user.id);
}

/** The household — and the MEMBER GATE: NOT_A_MEMBER for any non-member. */
function resolveHouseholdId(user) {
  try {
    return resolveThingHousehold(user);
  } catch (err) {
    throw codedError(err.message, err.code || 'UNAUTHORIZED');
  }
}

/** For field resolvers: the same gate, from the context. */
function scopeOf(context) {
  const userId = requireUser(context?.user);
  const householdId = resolveHouseholdId(context.user);
  return { userId, householdId };
}

const userError = (message, code = 'BAD_USER_INPUT') => codedError(message, code);
const notFound = (what = 'Thing') => codedError(`${what} not found`, 'NOT_FOUND');

function validObjectId(id) {
  return (typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id)) || id instanceof mongoose.Types.ObjectId;
}

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const toObj = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);
const isEmpty = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// ── Per-request cache + batching ─────────────────────────────────────────────

const requestState = new WeakMap();

function stateFor(context) {
  const holder = context && typeof context === 'object' ? context : {};
  let state = requestState.get(holder);
  if (!state) {
    state = new Map();
    requestState.set(holder, state);
  }
  return state;
}

function cached(context, key, fn) {
  const state = stateFor(context);
  if (!state.has(key)) state.set(key, fn());
  return state.get(key);
}

/** Every mutation calls this before returning (see the module doc). */
function resetRequestCache(context) {
  if (context && typeof context === 'object') requestState.delete(context);
}

function makeBatchLoader(fetchMany) {
  const cache = new Map();
  let queue = null;
  return {
    load(id) {
      const key = String(id);
      if (cache.has(key)) return cache.get(key);
      if (!queue) {
        queue = new Map();
        const batch = queue;
        setImmediate(async () => {
          queue = null;
          try {
            const results = await fetchMany([...batch.keys()]);
            for (const [k, deferred] of batch) deferred.resolve(results.get(k) ?? null);
          } catch (err) {
            for (const deferred of batch.values()) deferred.reject(err);
          }
        });
      }
      let deferred;
      const promise = new Promise((resolve, reject) => {
        deferred = { resolve, reject };
      });
      queue.set(key, deferred);
      cache.set(key, promise);
      return promise;
    },
  };
}

const loader = (context, name, fetchMany) => cached(context, `loader:${name}`, () => makeBatchLoader(fetchMany));

/** The household's types, id → type. */
function typesById(context, householdId) {
  return cached(context, `types:${householdId}`, async () => {
    const rows = await ThingType.find({ householdId }).lean();
    return new Map(rows.map((t) => [String(t._id), t]));
  });
}

/** The household's place tree. */
function placeTreeFor(context, householdId) {
  return cached(context, `places:${householdId}`, async () => buildPlaceTree(await Place.find({ householdId }).lean()));
}

/** Direct (non-trashed) thing counts per place, and per-place totals via the tree. */
function placeCounts(context, householdId) {
  return cached(context, `placeCounts:${householdId}`, async () => {
    const [tree, rows] = await Promise.all([
      placeTreeFor(context, householdId),
      Thing.aggregate([
        { $match: { householdId, deletedAt: null, placeId: { $ne: null } } },
        { $group: { _id: '$placeId', n: { $sum: 1 } } },
      ]),
    ]);
    const direct = new Map(rows.map((r) => [String(r._id), r.n]));
    return { direct, total: tree.totals(direct) };
  });
}

/** Non-trashed thing counts per type. */
function typeCounts(context, householdId) {
  return cached(context, `typeCounts:${householdId}`, async () => {
    const rows = await Thing.aggregate([
      { $match: { householdId, deletedAt: null, typeId: { $ne: null } } },
      { $group: { _id: '$typeId', n: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), r.n]));
  });
}

function fileLoader(context, householdId) {
  return loader(context, `files:${householdId}`, async (ids) => {
    const rows = await ThingFile.find({ _id: { $in: ids.filter(validObjectId).map(oid) }, householdId }).lean();
    return new Map(rows.map((f) => [String(f._id), f]));
  });
}

/** Live (non-trashed) household things by id — relationship targets. */
function liveThingLoader(context, householdId) {
  return loader(context, `live:${householdId}`, async (ids) => {
    const rows = await Thing.find(
      { _id: { $in: ids.filter(validObjectId).map(oid) }, householdId, deletedAt: null },
      { name: 1, typeId: 1, photos: 1 }
    ).lean();
    return new Map(rows.map((t) => [String(t._id), t]));
  });
}

/** Live household things whose stored relationships point at each id (the derived inverse). */
function inverseLoader(context, householdId) {
  return loader(context, `inverse:${householdId}`, async (ids) => {
    const targets = ids.filter(validObjectId).map(oid);
    const rows = await Thing.find(
      { householdId, deletedAt: null, 'relationships.thingId': { $in: targets } },
      { name: 1, typeId: 1, photos: 1, relationships: 1 }
    ).lean();
    const out = new Map();
    for (const src of rows) {
      for (const rel of src.relationships ?? []) {
        const key = String(rel.thingId);
        if (!ids.includes(key) || key === String(src._id)) continue;
        if (!out.has(key)) out.set(key, []);
        out.get(key).push({ rel, source: src });
      }
    }
    return out;
  });
}

// ── Rendering helpers ────────────────────────────────────────────────────────

const fileUrl = (fileId) => `/api/files/${fileId}`;
const thumbUrl = (fileId, file) => (file?.thumbPath ? `/api/files/${fileId}/thumb` : null);

/** The cover: the first overview photo, else the first photo. */
function coverOf(thing) {
  const photos = thing.photos ?? [];
  return photos.find((p) => (p.role ?? 'overview') === 'overview') ?? photos[0] ?? null;
}

async function renderPhoto(photo, context, householdId) {
  const file = await fileLoader(context, householdId).load(photo.fileId);
  return {
    id: String(photo._id ?? photo.id),
    fileId: String(photo.fileId),
    role: photo.role ?? 'overview',
    caption: photo.caption ?? '',
    url: fileUrl(photo.fileId),
    thumbUrl: thumbUrl(photo.fileId, file),
    width: file?.width ?? null,
    height: file?.height ?? null,
  };
}

async function typeOf(thing, context, householdId) {
  if (!thing.typeId) return null;
  return (await typesById(context, householdId)).get(String(thing.typeId)) ?? null;
}

const identifierKeys = (type) => (type?.fields ?? []).filter((f) => f.identifier).map((f) => f.key);

/** Thing.missing — the same rules as filters.js missingClause, in JS. */
export function missingOf(thing, type) {
  const out = [];
  const photos = thing.photos ?? [];
  const docs = thing.documents ?? [];
  const ident = identifierKeys(type);
  if (!photos.length) out.push('photo');
  if (ident.length && !photos.some((p) => p.role === 'id-plate')) out.push('id-plate');
  if (!photos.some((p) => p.role === 'receipt') && !docs.some((d) => d.role === 'receipt')) out.push('receipt');
  if (ident.length && ident.some((k) => isEmpty(thing.attributes?.[k]))) out.push('serial');
  if (thing.value?.amount === null || thing.value?.amount === undefined) out.push('value');
  return MISSING_KEYS.filter((k) => out.includes(k));
}

/** An attribute value as JSON: a date is its ISO string (identical in-process and over the wire). */
const jsonValue = (v) => (v instanceof Date ? v.toISOString() : v ?? null);

const summaryOf = (t) => ({ __summary: true, _id: t._id, name: t.name, typeId: t.typeId, photos: t.photos ?? [] });

// ── Scoped lookups ───────────────────────────────────────────────────────────

async function requireLiveThing(householdId, id) {
  if (!validObjectId(id)) throw notFound();
  const thing = await Thing.findOne({ _id: id, householdId, deletedAt: null });
  if (!thing) throw notFound();
  return thing;
}

async function getOrCreateProfile(userId, householdId) {
  return ThingProfile.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, householdId } },
    { upsert: true, new: true, lean: true }
  );
}

/** A typeId from input → the household's type (or null to clear), else BAD_USER_INPUT. */
async function resolveType(householdId, typeId) {
  if (typeId === null) return null;
  const type = validObjectId(typeId) ? await ThingType.findOne({ _id: typeId, householdId }).lean() : null;
  if (!type) throw inputError('input.typeId', 'type not found');
  return type;
}

async function resolvePlaceId(householdId, placeId) {
  if (placeId === null) return null;
  const place = validObjectId(placeId) ? await Place.findOne({ _id: placeId, householdId }, { _id: 1 }).lean() : null;
  if (!place) throw inputError('input.placeId', 'place not found');
  return place._id;
}

/** Relationship input → stored rows. Targets must be live things in this household; no self; duplicates collapse. */
async function resolveRelationships(householdId, rels, selfId) {
  const out = [];
  const seen = new Set();
  const ids = [...new Set(rels.map((r) => String(r.thingId)))];
  if (selfId && ids.includes(String(selfId))) throw inputError('input.relationships', 'a thing cannot be related to itself');
  const valid = ids.filter(validObjectId);
  const found = valid.length
    ? await Thing.find({ _id: { $in: valid.map(oid) }, householdId, deletedAt: null }, { _id: 1 }).lean()
    : [];
  const ok = new Set(found.map((t) => String(t._id)));
  for (const [i, r] of rels.entries()) {
    const id = String(r.thingId);
    if (!ok.has(id)) throw inputError(`input.relationships.${i}.thingId`, 'thing not found');
    const key = `${r.kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: r.kind, thingId: oid(id) });
  }
  return out;
}

function dedupeTags(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags ?? []) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

const emptyMoney = () => ({ amount: null, currency: DEFAULT_CURRENCY });

function moneyValue(input, prev) {
  const base = prev ?? emptyMoney();
  if (input === null) return emptyMoney();
  return {
    amount: input.amount !== undefined ? input.amount : base.amount ?? null,
    currency: input.currency ?? base.currency ?? DEFAULT_CURRENCY,
  };
}

/** Nested objects merge: keys present are set, omitted keys stay; null resets the whole object. */
function acquiredValue(input, prev = {}) {
  if (input === null) return { date: null, from: '', price: emptyMoney() };
  return {
    date: input.date !== undefined ? input.date : prev.date ?? null,
    from: input.from !== undefined ? input.from ?? '' : prev.from ?? '',
    price: input.price !== undefined ? moneyValue(input.price, prev.price) : prev.price ?? emptyMoney(),
  };
}

function valueValue(input, prev = {}) {
  if (input === null) return { amount: null, currency: DEFAULT_CURRENCY, asOf: null };
  return {
    amount: input.amount !== undefined ? input.amount : prev.amount ?? null,
    currency: input.currency ?? prev.currency ?? DEFAULT_CURRENCY,
    asOf: input.asOf !== undefined ? input.asOf : prev.asOf ?? null,
  };
}

function datesValue(input, existing = []) {
  const known = new Set(existing.map((d) => String(d._id)));
  return input.map((d) => {
    const row = {
      kind: d.kind,
      label: d.label ?? '',
      date: d.date,
      recurEveryMonths: d.recurEveryMonths ?? null,
      notes: d.notes ?? '',
    };
    if (d.id && known.has(String(d.id))) row._id = d.id;
    return row;
  });
}

/**
 * Photo/document edits: each input id must be one the thing already has
 * (uploads go to the backend). The result is the input order; one left out
 * is detached (the backend owns the file's lifecycle).
 */
function attachmentsValue(input, existing, { field, textKey }) {
  const byId = new Map(existing.map((a) => [String(a._id), a]));
  const seen = new Set();
  return input.map((a, i) => {
    const cur = byId.get(String(a.id));
    if (!cur) throw inputError(`input.${field}.${i}.id`, `not one of this thing's ${field}`);
    if (seen.has(String(a.id))) throw inputError(`input.${field}.${i}.id`, `listed twice`);
    seen.add(String(a.id));
    return {
      _id: cur._id,
      fileId: cur.fileId,
      role: a.role ?? cur.role,
      [textKey]: a[textKey] === undefined ? cur[textKey] ?? '' : a[textKey] ?? '',
    };
  });
}

// ── Starter types ────────────────────────────────────────────────────────────

let typeIndexes = null;
/** The unique {householdId,key} index must exist before two first calls race to seed. */
function typeIndexesReady() {
  if (!typeIndexes) typeIndexes = ThingType.init().catch((err) => {
    typeIndexes = null;
    throw err;
  });
  return typeIndexes;
}

const isDuplicateKey = (err) =>
  err?.code === 11000 ||
  (Array.isArray(err?.writeErrors) && err.writeErrors.length > 0 && err.writeErrors.every((e) => (e.code ?? e.err?.code) === 11000));

/**
 * Seed STARTER_TYPES once per household. "Once" is recorded as
 * starterTypesSeededAt on the seeding caller's profile; a household where ANY
 * member's profile carries it is never re-seeded (so a starter type someone
 * deleted stays deleted when the second member first opens the app). Two
 * concurrent first calls are made safe by the unique {householdId,key}
 * index: the loser's inserts are duplicate-key no-ops.
 */
async function ensureStarterTypes(userId, householdId) {
  const mine = await ThingProfile.findOne({ userId }, { starterTypesSeededAt: 1 }).lean();
  if (mine?.starterTypesSeededAt) return;
  const seeded = await ThingProfile.exists({ householdId, starterTypesSeededAt: { $ne: null } });
  if (!seeded) {
    await typeIndexesReady();
    const docs = STARTER_TYPES.map((t) => ({
      householdId,
      key: t.key,
      name: t.name,
      icon: t.icon,
      builtIn: true,
      fields: t.fields.map((f) => ({
        key: f.key,
        label: f.label,
        kind: f.kind,
        choices: f.choices ?? [],
        unit: f.unit ?? null,
        identifier: Boolean(f.identifier),
        required: Boolean(f.required),
      })),
    }));
    try {
      await ThingType.insertMany(docs, { ordered: false });
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
    }
  }
  await ThingProfile.updateOne(
    { userId },
    { $setOnInsert: { householdId }, $set: { starterTypesSeededAt: new Date() } },
    { upsert: true }
  );
}

function slugify(name) {
  return (
    String(name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'type'
  );
}

function typeFieldsValue(fields) {
  return (fields ?? []).map((f) => ({
    key: f.key,
    label: f.label,
    kind: f.kind,
    choices: f.kind === 'choice' ? [...new Set(f.choices ?? [])] : [],
    unit: f.unit ?? null,
    identifier: Boolean(f.identifier),
    required: Boolean(f.required),
  }));
}

// ── The things query ─────────────────────────────────────────────────────────

/** Sort key per advertised sort. */
const SORT_FIELDS = {
  name: '$sortName',
  recentlyAdded: '$createdAt',
  acquired: '$acquired.date',
  value: '$value.amount',
  nextDue: '$__nextDue',
  // Computed per request from the seed (randomSortKey); listed so the tripwire sees an arm.
  random: '$__random',
};
// Tripwire: an advertised sort without an arm is BookGeek's silent-no-op bug. Fail at import.
for (const s of THING_SORTS) {
  if (!SORT_FIELDS[s]) throw new Error(`thinggeek: sort "${s}" is advertised but has no resolver arm`);
}

async function householdContext(context, householdId) {
  const [types, tree] = await Promise.all([typesById(context, householdId), placeTreeFor(context, householdId)]);
  return { types: [...types.values()], places: [...tree.byId.values()] };
}

async function queryThings({ householdId, args, context }) {
  const { page: pageNum, limit: limitNum } = pageArgs(args, { defaultLimit: 48, maxLimit: 100 });
  const sortKey = args.sort ?? 'name';
  const dir = (args.sortDir ?? 'asc') === 'desc' ? -1 : 1;
  const ctx = await householdContext(context, householdId);

  const pipeline = filteredStages(householdId, args.filter ?? {}, ctx);
  // Nulls last in BOTH directions, then sortName, _id.
  const order = nullsLastSort({
    key: sortKey === 'random' ? randomSortKey(args.seed) : { $ifNull: [SORT_FIELDS[sortKey], null] },
    dir,
    tiebreak: sortKey !== 'name' ? { sortName: 1, _id: 1 } : { _id: 1 },
  });
  pipeline.push(...order.stages);
  pipeline.push(pageFacetStage({ sort: order.sort, page: pageNum, limit: limitNum, project: { ...order.project, ...HELPER_FIELDS } }));

  const [result] = await Thing.aggregate(pipeline);
  const { items, total, page, pages } = shapePage(result, { page: pageNum, limit: limitNum });
  return { things: items, total, page, pages };
}

const countStage = (where) => [{ $match: where }, { $count: 'n' }];
const countOf = (rows) => rows?.[0]?.n ?? 0;

// ── Resolvers ────────────────────────────────────────────────────────────────

export const resolvers = {
  Thing: {
    id: (t) => String(t._id),
    tags: (t) => t.tags ?? [],
    type: (t, _a, context) => typeOf(t, context, scopeOf(context).householdId),
    place: async (t, _a, context) => {
      const { householdId } = scopeOf(context);
      if (!t.placeId) return null;
      return (await placeTreeFor(context, householdId)).byId.get(String(t.placeId)) ?? null;
    },
    acquired: (t) => {
      const a = t.acquired ?? {};
      const price = a.price && a.price.amount !== null && a.price.amount !== undefined ? { amount: a.price.amount, currency: a.price.currency || DEFAULT_CURRENCY } : null;
      return { date: a.date ?? null, from: a.from ?? '', price };
    },
    value: (t) => ({
      amount: t.value?.amount ?? null,
      currency: t.value?.currency || DEFAULT_CURRENCY,
      asOf: t.value?.asOf ?? null,
    }),
    dates: (t) => {
      const today = todayUtc();
      return (t.dates ?? []).map((d) => renderDate(d, today)).sort((a, b) => a.daysUntil - b.daysUntil);
    },
    nextDue: (t) => nextDueOf(t.dates ?? []),
    // The stored map, limited to the type's fields (a key whose field was
    // removed from the type stays stored but is no longer shown or sent).
    attributes: async (t, _a, context) => {
      const type = await typeOf(t, context, scopeOf(context).householdId);
      const keys = new Set((type?.fields ?? []).map((f) => f.key));
      return Object.fromEntries(Object.entries(t.attributes ?? {}).filter(([k]) => keys.has(k)).map(([k, v]) => [k, jsonValue(v)]));
    },
    fields: async (t, _a, context) => {
      const type = await typeOf(t, context, scopeOf(context).householdId);
      return (type?.fields ?? []).map((f) => ({
        key: f.key,
        label: f.label,
        kind: f.kind,
        unit: f.unit ?? null,
        identifier: Boolean(f.identifier),
        value: jsonValue(t.attributes?.[f.key]),
      }));
    },
    photos: (t, _a, context) => {
      const { householdId } = scopeOf(context);
      return Promise.all((t.photos ?? []).map((p) => renderPhoto(p, context, householdId)));
    },
    coverPhoto: (t, _a, context) => {
      const { householdId } = scopeOf(context);
      const cover = coverOf(t);
      return cover ? renderPhoto(cover, context, householdId) : null;
    },
    documents: (t, _a, context) => {
      const { householdId } = scopeOf(context);
      return Promise.all(
        (t.documents ?? []).map(async (d) => {
          const file = await fileLoader(context, householdId).load(d.fileId);
          return {
            id: String(d._id ?? d.id),
            fileId: String(d.fileId),
            role: d.role ?? 'other',
            title: d.title ?? '',
            url: fileUrl(d.fileId),
            mime: file?.mime ?? null,
            size: file?.size ?? null,
            originalName: file?.originalName ?? null,
          };
        })
      );
    },
    relationships: async (t, _a, context) => {
      const { householdId } = scopeOf(context);
      const live = liveThingLoader(context, householdId);
      const out = [];
      for (const rel of t.relationships ?? []) {
        const other = await live.load(rel.thingId);
        if (!other || String(other._id) === String(t._id)) continue;
        out.push({ id: String(rel._id), kind: rel.kind, direction: 'out', thing: summaryOf(other) });
      }
      for (const { rel, source } of (await inverseLoader(context, householdId).load(t._id)) ?? []) {
        out.push({ id: `in-${rel._id}`, kind: rel.kind, direction: 'in', thing: summaryOf(source) });
      }
      return out;
    },
    notes: (t) => t.notes ?? '',
    missing: async (t, _a, context) => missingOf(t, await typeOf(t, context, scopeOf(context).householdId)),
    deletedAt: (t) => t.deletedAt ?? null,
  },

  ThingDate: {
    id: (d) => String(d._id ?? d.id),
  },

  ThingSummary: {
    id: (s) => String(s._id),
    type: (s, _a, context) => typeOf(s, context, scopeOf(context).householdId),
    coverThumbUrl: async (s, _a, context) => {
      const { householdId } = scopeOf(context);
      const cover = coverOf(s);
      if (!cover) return null;
      return thumbUrl(cover.fileId, await fileLoader(context, householdId).load(cover.fileId));
    },
  },

  ThingType: {
    id: (t) => String(t._id),
    icon: (t) => t.icon || 'Inventory2',
    fields: (t) =>
      (t.fields ?? []).map((f) => ({
        ...f,
        choices: f.choices ?? [],
        unit: f.unit ?? null,
        identifier: Boolean(f.identifier),
        required: Boolean(f.required),
      })),
    builtIn: (t) => Boolean(t.builtIn),
    thingCount: async (t, _a, context) => {
      const { householdId } = scopeOf(context);
      return (await typeCounts(context, householdId)).get(String(t._id)) ?? 0;
    },
  },

  Place: {
    id: (p) => String(p._id),
    parentId: (p) => (p.parentId ? String(p.parentId) : null),
    notes: (p) => p.notes ?? '',
    path: async (p, _a, context) => {
      const { householdId } = scopeOf(context);
      return (await placeTreeFor(context, householdId)).pathOf(String(p._id));
    },
    directCount: async (p, _a, context) => {
      const { householdId } = scopeOf(context);
      return (await placeCounts(context, householdId)).direct.get(String(p._id)) ?? 0;
    },
    totalCount: async (p, _a, context) => {
      const { householdId } = scopeOf(context);
      return (await placeCounts(context, householdId)).total.get(String(p._id)) ?? 0;
    },
  },

  ThingProfile: {
    savedFilters: (p) => p?.savedFilters ?? [],
  },

  ThingSavedFilter: {
    // An empty filter is minimized away inside the subdocument; it reads back as {}.
    filter: (f) => f?.filter ?? {},
  },

  Query: {
    things: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const args = validateThings(rawArgs ?? {});
      return queryThings({ householdId, args, context });
    },

    thing: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { id } = validateId(rawArgs ?? {});
      if (!validObjectId(id)) return null;
      return Thing.findOne({ _id: id, householdId, deletedAt: null }).lean();
    },

    thingFacets: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { filter } = validateFilterArgs(rawArgs ?? {});
      const ctx = await householdContext(context, householdId);
      const [result] = await Thing.aggregate(facetsPipeline({ householdId, filter: filter ?? {}, ...ctx }));
      return shapeFacets(result, filter ?? {}, ctx);
    },

    thingTypes: async (_, __, context = {}) => {
      const userId = requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      await ensureStarterTypes(userId, householdId);
      resetRequestCache(context);
      return ThingType.find({ householdId }).sort({ name: 1, _id: 1 }).lean();
    },

    places: async (_, __, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      return (await placeTreeFor(context, householdId)).ordered();
    },

    thingAttention: async (_, __, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { types } = await householdContext(context, householdId);
      const idTypes = identifierTypes(types);
      const today = todayUtc();
      const soonEnd = addDays(today, SOON_DAYS);
      const project = { ...HELPER_FIELDS, __key: 0 };
      const firstOcc = (cond) => ({ $min: { $filter: { input: '$__occ', as: 'o', cond } } });
      const [r] = await Thing.aggregate([
        baseMatch(householdId),
        ...occurrenceStages(today),
        {
          $facet: {
            overdue: [
              { $match: dueBucketClause('overdue', today) },
              { $addFields: { __key: firstOcc({ $lt: ['$$o', today] }) } },
              { $sort: { __key: 1, sortName: 1, _id: 1 } },
              { $limit: ATTENTION_MAX },
              { $project: project },
            ],
            dueSoon: [
              { $match: occurrenceIn(today, soonEnd) },
              { $addFields: { __key: firstOcc({ $and: [{ $gte: ['$$o', today] }, { $lte: ['$$o', soonEnd] }] }) } },
              { $sort: { __key: 1, sortName: 1, _id: 1 } },
              { $limit: ATTENTION_MAX },
              { $project: project },
            ],
            missingIdPlate: countStage(missingClause('id-plate', idTypes)),
            missingReceipt: countStage(missingClause('receipt', idTypes)),
            missingSerial: countStage(missingClause('serial', idTypes)),
            missingValue: countStage(missingClause('value', idTypes)),
            missingPhoto: countStage(missingClause('photo', idTypes)),
          },
        },
      ]);
      return {
        overdue: r?.overdue ?? [],
        dueSoon: r?.dueSoon ?? [],
        missingIdPlate: countOf(r?.missingIdPlate),
        missingReceipt: countOf(r?.missingReceipt),
        missingSerial: countOf(r?.missingSerial),
        missingValue: countOf(r?.missingValue),
        missingPhoto: countOf(r?.missingPhoto),
      };
    },

    thingProfile: async (_, __, context = {}) => {
      const userId = requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      return getOrCreateProfile(userId, householdId);
    },

    thingVocabulary: async (_, __, context = {}) => {
      requireUser(context.user);
      resolveHouseholdId(context.user);
      return {
        fieldKinds: [...FIELD_KINDS],
        dateKinds: [...DATE_KINDS],
        photoRoles: [...PHOTO_ROLES],
        documentRoles: [...DOCUMENT_ROLES],
        relationshipKinds: [...RELATIONSHIP_KINDS],
        missingKeys: [...MISSING_KEYS],
        trashDays: TRASH_DAYS,
      };
    },

    trashedThings: async (_, __, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      return Thing.find({ householdId, deletedAt: { $ne: null } })
        .sort({ deletedAt: -1, _id: -1 })
        .limit(TRASH_LIST_MAX)
        .lean();
    },

    thingInsuranceTotals: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { filter } = validateFilterArgs(rawArgs ?? {});
      const ctx = await householdContext(context, householdId);
      const idTypes = identifierTypes(ctx.types);
      const withSerial = idTypes.length
        ? { typeId: { $in: idTypes.map((t) => t.id) }, $nor: [missingClause('serial', idTypes)] }
        : { _id: { $in: [] } };
      const [r] = await Thing.aggregate([
        ...filteredStages(householdId, filter ?? {}, ctx),
        {
          $facet: {
            count: [{ $count: 'n' }],
            total: [{ $group: { _id: null, sum: { $sum: { $ifNull: ['$value.amount', 0] } } } }],
            withSerial: countStage(withSerial),
            withReceipt: countStage({ $nor: [missingClause('receipt', idTypes)] }),
            withPhoto: countStage({ 'photos.0': { $exists: true } }),
          },
        },
      ]);
      return {
        count: countOf(r?.count),
        totalValue: Math.round((r?.total?.[0]?.sum ?? 0) * 100) / 100,
        currency: DEFAULT_CURRENCY,
        withSerial: countOf(r?.withSerial),
        withReceipt: countOf(r?.withReceipt),
        withPhoto: countOf(r?.withPhoto),
      };
    },
  },

  Mutation: {
    createThing: async (_, rawArgs, context = {}) => {
      const userId = requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { input } = validateCreateThing(rawArgs ?? {});

      const type = input.typeId ? await resolveType(householdId, input.typeId) : null;
      const placeId = input.placeId ? await resolvePlaceId(householdId, input.placeId) : null;
      // A new thing has no photos/documents yet: uploads attach them via the backend.
      if (input.photos?.length) throw inputError('input.photos.0.id', "not one of this thing's photos");
      if (input.documents?.length) throw inputError('input.documents.0.id', "not one of this thing's documents");
      const relationships = input.relationships?.length ? await resolveRelationships(householdId, input.relationships, null) : [];
      const { set } = validateAttributes(input.attributes ?? {}, type?.fields ?? [], { requireAll: true });

      const thing = await Thing.create({
        householdId,
        createdBy: userId,
        name: input.name,
        typeId: type?._id ?? null,
        tags: dedupeTags(input.tags),
        placeId,
        acquired: acquiredValue(input.acquired ?? {}),
        value: valueValue(input.value ?? {}),
        dates: datesValue(input.dates ?? []),
        attributes: set,
        relationships,
        notes: input.notes ?? '',
      });
      resetRequestCache(context);
      return thing.toObject();
    },

    /**
     * Omitted = unchanged; arrays replace whole; nested objects (acquired,
     * value) merge. `attributes` MERGES: each key given is validated and set
     * (null / '' clears it), keys not given are untouched.
     *
     * Changing typeId keeps the attributes whose keys the new type also
     * defines and DROPS the rest (they would be unknown keys of the new
     * type), then applies any `attributes` given, validated against the new
     * type. `required` is enforced on create only.
     */
    updateThing: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { id, input } = validateUpdateThing(rawArgs ?? {});
      const thing = await requireLiveThing(householdId, id);
      const current = thing.toObject();

      let type;
      if (input.typeId !== undefined) {
        type = await resolveType(householdId, input.typeId);
      } else {
        type = current.typeId ? await ThingType.findOne({ _id: current.typeId, householdId }).lean() : null;
      }

      let attributes = { ...(current.attributes ?? {}) };
      if (input.typeId !== undefined && String(input.typeId ?? '') !== String(current.typeId ?? '')) {
        const keep = new Set((type?.fields ?? []).map((f) => f.key));
        attributes = Object.fromEntries(Object.entries(attributes).filter(([k]) => keep.has(k)));
        thing.typeId = type?._id ?? null;
      }
      if (input.attributes !== undefined && input.attributes !== null) {
        const { set, unset } = validateAttributes(input.attributes, type?.fields ?? []);
        for (const k of unset) delete attributes[k];
        Object.assign(attributes, set);
      }
      thing.attributes = attributes;
      thing.markModified('attributes');

      if (input.name !== undefined) thing.name = input.name;
      if (input.tags !== undefined) thing.tags = dedupeTags(input.tags ?? []);
      if (input.placeId !== undefined) thing.placeId = await resolvePlaceId(householdId, input.placeId);
      if (input.acquired !== undefined) thing.acquired = acquiredValue(input.acquired, current.acquired);
      if (input.value !== undefined) thing.value = valueValue(input.value, current.value);
      if (input.dates !== undefined) thing.dates = datesValue(input.dates ?? [], current.dates ?? []);
      if (input.photos !== undefined) {
        thing.photos = attachmentsValue(input.photos ?? [], current.photos ?? [], { field: 'photos', textKey: 'caption' });
      }
      if (input.documents !== undefined) {
        thing.documents = attachmentsValue(input.documents ?? [], current.documents ?? [], { field: 'documents', textKey: 'title' });
      }
      if (input.relationships !== undefined) {
        thing.relationships = await resolveRelationships(householdId, input.relationships ?? [], thing._id);
      }
      if (input.notes !== undefined) thing.notes = input.notes ?? '';

      await thing.save();
      resetRequestCache(context);
      return thing.toObject();
    },

    deleteThing: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { id } = validateId(rawArgs ?? {});
      resetRequestCache(context);
      if (!validObjectId(id)) return { success: false, message: 'Thing not found' };
      const res = await Thing.updateOne({ _id: id, householdId, deletedAt: null }, { $set: { deletedAt: new Date() } });
      if (res.matchedCount === 0) return { success: false, message: 'Thing not found' };
      return { success: true, message: `Moved to Trash for ${TRASH_DAYS} days` };
    },

    restoreThing: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { id } = validateId(rawArgs ?? {});
      if (!validObjectId(id)) throw notFound();
      const thing = await Thing.findOneAndUpdate(
        { _id: id, householdId, deletedAt: { $ne: null } },
        { $set: { deletedAt: null } },
        { new: true, lean: true }
      );
      if (!thing) throw notFound();
      resetRequestCache(context);
      return thing;
    },

    createThingType: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { input } = validateCreateThingType(rawArgs ?? {});
      await typeIndexesReady();
      const base = slugify(input.name);
      const taken = new Set(
        (await ThingType.find({ householdId, key: { $regex: `^${base}(-\\d+)?$` } }, { key: 1 }).lean()).map((t) => t.key)
      );
      let n = 1;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        let key = base;
        while (taken.has(key)) key = `${base}-${++n}`;
        try {
          const type = await ThingType.create({
            householdId,
            key,
            name: input.name,
            icon: input.icon || 'Inventory2',
            fields: typeFieldsValue(input.fields),
            builtIn: false,
          });
          resetRequestCache(context);
          return type.toObject();
        } catch (err) {
          if (!isDuplicateKey(err)) throw err;
          taken.add(key);
        }
      }
      throw userError('Could not pick a unique key for this type', 'CONFLICT');
    },

    /** The key never changes. A field edit does not rewrite existing things' stored values. */
    updateThingType: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { id, input } = validateUpdateThingType(rawArgs ?? {});
      if (!validObjectId(id)) throw notFound('Type');
      const set = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.icon !== undefined) set.icon = input.icon || 'Inventory2';
      if (input.fields !== undefined) set.fields = typeFieldsValue(input.fields ?? []);
      const type = Object.keys(set).length
        ? await ThingType.findOneAndUpdate({ _id: id, householdId }, { $set: set }, { new: true, lean: true, runValidators: true })
        : await ThingType.findOne({ _id: id, householdId }).lean();
      if (!type) throw notFound('Type');
      resetRequestCache(context);
      return type;
    },

    /** Refused (CONFLICT) while any non-trashed thing uses it. A trashed thing that did keeps its dangling typeId and restores typeless. */
    deleteThingType: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { id } = validateId(rawArgs ?? {});
      resetRequestCache(context);
      if (!validObjectId(id)) return { success: false, message: 'Type not found' };
      const type = await ThingType.findOne({ _id: id, householdId }, { _id: 1 }).lean();
      if (!type) return { success: false, message: 'Type not found' };
      const used = await Thing.countDocuments({ householdId, typeId: type._id, deletedAt: null });
      if (used > 0) throw userError(`This type is used by ${used} thing${used === 1 ? '' : 's'}`, 'CONFLICT');
      await ThingType.deleteOne({ _id: type._id, householdId });
      return { success: true, message: 'Type deleted' };
    },

    createPlace: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { input } = validateCreatePlace(rawArgs ?? {});
      const tree = buildPlaceTree(await Place.find({ householdId }).lean());
      let parentId = null;
      if (input.parentId) {
        if (!tree.byId.has(String(input.parentId))) throw inputError('input.parentId', 'place not found');
        if (tree.pathOf(String(input.parentId)).length + 1 > bounds.placeDepth.max) {
          throw inputError('input.parentId', `places nest at most ${bounds.placeDepth.max} deep`);
        }
        parentId = oid(input.parentId);
      }
      const place = await Place.create({ householdId, name: input.name, parentId, notes: input.notes ?? '' });
      resetRequestCache(context);
      return place.toObject();
    },

    updatePlace: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { id, input } = validateUpdatePlace(rawArgs ?? {});
      if (!validObjectId(id)) throw notFound('Place');
      const tree = buildPlaceTree(await Place.find({ householdId }).lean());
      if (!tree.byId.has(String(id))) throw notFound('Place');

      const set = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.notes !== undefined) set.notes = input.notes ?? '';
      if (input.parentId !== undefined) {
        if (input.parentId === null) {
          set.parentId = null;
        } else {
          const parent = String(input.parentId);
          if (!tree.byId.has(parent)) throw inputError('input.parentId', 'place not found');
          const subtree = tree.descendantsOf(String(id));
          if (subtree.includes(parent)) throw inputError('input.parentId', 'a place cannot move inside itself');
          const selfDepth = tree.pathOf(String(id)).length;
          const height = Math.max(...subtree.map((d) => tree.pathOf(d).length - selfDepth + 1));
          if (tree.pathOf(parent).length + height > bounds.placeDepth.max) {
            throw inputError('input.parentId', `places nest at most ${bounds.placeDepth.max} deep`);
          }
          set.parentId = oid(parent);
        }
      }
      const place = Object.keys(set).length
        ? await Place.findOneAndUpdate({ _id: id, householdId }, { $set: set }, { new: true, lean: true, runValidators: true })
        : await Place.findOne({ _id: id, householdId }).lean();
      if (!place) throw notFound('Place');
      resetRequestCache(context);
      return place;
    },

    /** Children move up to its parent; every thing there (trashed ones too) becomes place-less. */
    deletePlace: async (_, rawArgs, context = {}) => {
      requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { id } = validateId(rawArgs ?? {});
      resetRequestCache(context);
      if (!validObjectId(id)) return { success: false, message: 'Place not found' };
      const place = await Place.findOne({ _id: id, householdId }).lean();
      if (!place) return { success: false, message: 'Place not found' };
      await Place.updateMany({ householdId, parentId: place._id }, { $set: { parentId: place.parentId ?? null } });
      await Thing.updateMany({ householdId, placeId: place._id }, { $set: { placeId: null } });
      await Place.deleteOne({ _id: place._id, householdId });
      return { success: true, message: 'Place deleted' };
    },

    saveThingFilter: async (_, rawArgs, context = {}) => {
      const userId = requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { input } = validateSaveThingFilter(rawArgs ?? {});
      const preset = {
        id: input.id || generateId(),
        name: input.name,
        filter: input.filter ?? {},
        sortBy: input.sortBy ?? 'name',
        sortDir: input.sortDir ?? 'asc',
      };
      const profile = await getOrCreateProfile(userId, householdId);
      const filters = profile.savedFilters ?? [];
      resetRequestCache(context);
      if (input.id && filters.some((f) => f.id === input.id)) {
        return ThingProfile.findOneAndUpdate({ userId, 'savedFilters.id': input.id }, { $set: { 'savedFilters.$': preset } }, { new: true, lean: true });
      }
      if (input.id) throw notFound('Saved filter');
      if (filters.length >= MAX_SAVED_FILTERS) throw userError(`You can have up to ${MAX_SAVED_FILTERS} saved filters`);
      return ThingProfile.findOneAndUpdate({ userId }, { $push: { savedFilters: preset } }, { new: true, lean: true });
    },

    deleteThingFilter: async (_, rawArgs, context = {}) => {
      const userId = requireUser(context.user);
      const householdId = resolveHouseholdId(context.user);
      const { id } = validateId(rawArgs ?? {});
      await getOrCreateProfile(userId, householdId);
      resetRequestCache(context);
      return ThingProfile.findOneAndUpdate({ userId }, { $pull: { savedFilters: { id } } }, { new: true, lean: true });
    },
  },
};

