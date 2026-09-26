import mongoose from 'mongoose';
import constantsModule from '@geeksuite/schemas/thinggeek/constants';
import {
  buildFacetStage,
  countFacetStages,
  groupFacetStages,
  inList,
  matchOf,
  numberRange,
  searchRegex,
  shapeCount,
  shapeFixedFacet,
  shapeHistogram,
  shapeOpenFacet,
  valuesFacetStages,
  yearHistogramStages,
  yearRange,
} from '@geeksuite/collection/server';
import { DUE_BUCKETS, dueBucketClause, dueWithinClause, occurrenceStages, todayUtc } from './dates.js';

/**
 * ThingFilterInput (+ the search box's token grammar) → Mongo, and the
 * faceted counts. DOCS/THINGGEEK_PLAN.md "Deterministic search, no AI".
 *
 * One builder serves `things`, `thingFacets`, `thingInsuranceTotals` and
 * `thingAttention`, so a filter and the count beside it cannot disagree.
 * Each active dimension is one CONDITION keyed by the facet it belongs to;
 * each facet's counts apply every condition EXCEPT its own
 * (@geeksuite/collection/server's exclude-own-filter rule).
 *
 * ## The q grammar (parsed here, server-side, so AI/MCP get the same one)
 *
 *   type:<key or name>   the type's key or name, case-insensitive
 *   tag:<t>              a tag, case-insensitive exact
 *   in:<thing>           a thing's id, or a name path ("garage", "house/garage",
 *                        "House > Garage"; the path matches the END of the
 *                        thing's root→self path). Any live thing may be named
 *                        — a location, a container, or an item something was
 *                        moved into — and everything inside it, at any depth,
 *                        matches (not the thing itself).
 *   before:<period>      acquired strictly before the period starts
 *   after:<period>       acquired strictly after the period ends
 *                        (period = YYYY | YYYY-MM | YYYY-MM-DD, UTC)
 *   expiring:<N>d / due:<N>d
 *                        some date's occurrence falls within N days — overdue
 *                        included. The two are synonyms (kinds are a facet
 *                        concern, not a search one).
 *   missing:<key>        photo | id-plate | receipt | serial | value
 *   has:<x>              photo | document | receipt | value
 *
 * Values with spaces take quotes: in:"Shelf 2". A token with an unknown key
 * or an unparseable value (missing:foo, before:soon) is kept as free text.
 * Every token is its own AND clause (each narrows the search); a repeated
 * type:/in:/tag: is OR within that dimension (tag: honours tagMatch).
 * Tokens AND with the structured filter fields of the same dimension.
 *
 * Remaining words: each word (AND) must appear, case-insensitively and
 * regex-escaped (the ReDoS rule), in the name, notes, a tag, or a
 * stringified attribute value. Identifier attributes (serials, VIN) ARE
 * searched: a member typing their serial should find the thing, and search
 * never leaves the household. (The no-AI rule for identifiers is about what
 * leaves the box, not what a member may look up.)
 *
 * ## Structured lists
 *
 * A list in the filter (types, within, due, missing, kinds) is ANY-of, like
 * every facet in the suite; tags honour tagMatch.
 *
 * ## Kinds: locations are not inventory
 *
 * With no `kinds`, the filter is container + item: a house or a shelf is
 * never a row in the library, the insurance report or a count — unless a
 * location TYPE is asked for by name (types / type:), which brings its kind
 * in. `missing` never matches a location (it has nothing to be missing).
 *
 * Nothing here takes a householdId from the filter: the resolver puts the
 * session's in the literal first stage of every pipeline.
 */

const { MISSING_KEYS, THING_KINDS, DEFAULT_THING_KIND, PARENT_KINDS } = constantsModule;

const MATCH_NOTHING = Object.freeze({ _id: { $in: [] } });
const TOKEN_KEYS = new Set(['type', 'tag', 'in', 'before', 'after', 'expiring', 'due', 'missing', 'has']);
const HAS_VALUES = ['photo', 'document', 'receipt', 'value'];
const MAX_DUE_DAYS = 3650;

const has = (list) => Array.isArray(list) && list.length > 0;
const given = (v) => v !== undefined && v !== null;
const exactI = (value) => ({ $regex: `^${searchRegex(value)}$`, $options: 'i' });

function toObjectIds(ids) {
  return (ids ?? []).filter((id) => /^[0-9a-fA-F]{24}$/.test(String(id))).map((id) => new mongoose.Types.ObjectId(String(id)));
}

// ── Tokenizing ───────────────────────────────────────────────────────────────

/**
 * q → `{ tokens: [{key, value}], words: [string] }`. Unknown keys stay words.
 */
export function parseQuery(q) {
  const tokens = [];
  const words = [];
  const re = /([A-Za-z-]+):(?:"([^"]*)"|(\S+))|"([^"]*)"|(\S+)/g;
  const s = String(q ?? '');
  let m;
  while ((m = re.exec(s))) {
    if (m[1] !== undefined) {
      const key = m[1].toLowerCase();
      const value = (m[2] ?? m[3] ?? '').trim();
      if (TOKEN_KEYS.has(key) && value) tokens.push({ key, value, raw: m[0] });
      else words.push(m[0]);
    } else if (m[4] !== undefined) {
      if (m[4].trim()) words.push(m[4].trim());
    } else {
      words.push(m[5]);
    }
  }
  return { tokens, words };
}

/** A before:/after: period → [start, endExclusive), or null. */
export function parsePeriod(value) {
  const m = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  if (m[3] !== undefined) {
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const start = new Date(Date.UTC(y, mo, d));
    if (start.getUTCMonth() !== mo || start.getUTCDate() !== d) return null;
    return [start, new Date(Date.UTC(y, mo, d + 1))];
  }
  if (m[2] !== undefined) {
    const mo = Number(m[2]) - 1;
    if (mo < 0 || mo > 11) return null;
    return [new Date(Date.UTC(y, mo, 1)), new Date(Date.UTC(y, mo + 1, 1))];
  }
  return [new Date(Date.UTC(y, 0, 1)), new Date(Date.UTC(y + 1, 0, 1))];
}

function parseDays(value) {
  const m = /^(\d{1,4})d?$/i.exec(value);
  if (!m) return null;
  const n = Number(m[1]);
  return n <= MAX_DUE_DAYS ? n : null;
}

// ── The containment tree ─────────────────────────────────────────────────────

/** A type's kind; a thing with no (or a deleted) type is an item. */
export const kindOfType = (type) => type?.kind || DEFAULT_THING_KIND;

/**
 * The household's things as a tree, from `[{ _id, name, parentId, typeId,
 * deletedAt }]` — EVERY thing, trashed ones included, because a thing in the
 * Trash keeps its contents where they are: the jumper cables in a trashed Van
 * are still in the Garage. A parentId naming no known thing is the top level.
 * Cycles (which the resolvers refuse to create) are cut rather than looped on.
 */
export function buildThingTree(nodes) {
  const byId = new Map((nodes ?? []).map((n) => [String(n._id), n]));
  const children = new Map();
  const parentOf = (n) => (n.parentId && byId.has(String(n.parentId)) ? String(n.parentId) : null);
  for (const n of byId.values()) {
    const parent = parentOf(n);
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(String(n._id));
  }
  const isLive = (id) => {
    const n = byId.get(String(id));
    return Boolean(n && !n.deletedAt);
  };
  const pathCache = new Map();
  /** Root → self. */
  function pathOf(id) {
    if (pathCache.has(id)) return pathCache.get(id);
    const chain = [];
    const seen = new Set();
    let cur = byId.get(id);
    while (cur && !seen.has(String(cur._id))) {
      seen.add(String(cur._id));
      chain.unshift(cur);
      const parent = parentOf(cur);
      cur = parent ? byId.get(parent) : null;
    }
    pathCache.set(id, chain);
    return chain;
  }
  /** Self and everything inside it, at any depth. */
  function descendantsOf(id) {
    const out = [];
    const stack = [String(id)];
    const seen = new Set();
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur) || !byId.has(cur)) continue;
      seen.add(cur);
      out.push(cur);
      for (const c of children.get(cur) ?? []) stack.push(c);
    }
    return out;
  }
  /** How many levels hang below it (0 = it contains nothing). */
  function heightOf(id) {
    const base = pathOf(String(id)).length;
    return Math.max(0, ...descendantsOf(id).map((d) => pathOf(d).length - base));
  }
  /** Direct counts (parentId → n) → totals including everything inside. */
  function totals(direct) {
    const out = new Map();
    for (const id of byId.keys()) {
      out.set(id, descendantsOf(id).reduce((n, d) => n + (direct.get(d) ?? 0), 0));
    }
    return out;
  }
  /** Tree order: depth-first, siblings by name. */
  function ordered() {
    const out = [];
    const byName = (a, b) => String(byId.get(a).name).localeCompare(String(byId.get(b).name)) || a.localeCompare(b);
    const walk = (parent, seen) => {
      for (const id of [...(children.get(parent) ?? [])].sort(byName)) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(byId.get(id));
        walk(id, seen);
      }
    };
    walk(null, new Set());
    return out;
  }
  return { byId, children, isLive, pathOf, descendantsOf, heightOf, totals, ordered };
}

/** in:<value> → the parentIds whose children match (the named things and everything inside them). */
function containerIdsFor(tree, value) {
  if (tree.isLive(value)) return tree.descendantsOf(value);
  const segs = value
    .split(/\s*(?:\/|>|›)\s*/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!segs.length) return [];
  const out = new Set();
  for (const [id] of tree.byId) {
    if (!tree.isLive(id)) continue;
    const names = tree.pathOf(id).map((p) => String(p.name).trim().toLowerCase());
    if (names.length < segs.length) continue;
    const tail = names.slice(names.length - segs.length);
    if (tail.every((n, i) => n === segs[i])) for (const d of tree.descendantsOf(id)) out.add(d);
  }
  return [...out];
}

/** Type ids per kind: `{ location: [ObjectId], container: [ObjectId] }` (items are "neither"). */
function typeIdsByKind(types) {
  const out = { location: [], container: [] };
  for (const t of types ?? []) {
    const k = kindOfType(t);
    if (out[k]) out[k].push(t._id);
  }
  return out;
}

/** The match for "its kind is one of `kinds`", or null when that is every kind. */
export function kindClause(kinds, types) {
  const want = new Set(kinds);
  const ids = typeIdsByKind(types);
  const parts = [];
  if (!want.has('location')) parts.push({ typeId: { $nin: ids.location } });
  if (!want.has('container')) parts.push({ typeId: { $nin: ids.container } });
  if (!want.has('item')) parts.push({ typeId: { $in: [...ids.location, ...ids.container] } });
  if (!parts.length) return null;
  return parts.length === 1 ? parts[0] : { $and: parts };
}

/** Inventory only: anything but a location (insurance, needs-attention, missing). */
export const notLocation = (types) => kindClause(['container', 'item'], types);

// ── Missing ──────────────────────────────────────────────────────────────────

/** Identifier fields per type: [{ id: ObjectId, keys: [..] }], only types that have any. */
export function identifierTypes(types) {
  return (types ?? [])
    .map((t) => ({ id: t._id, keys: (t.fields ?? []).filter((f) => f.identifier).map((f) => f.key) }))
    .filter((t) => t.keys.length > 0);
}

/**
 * The query clause for one missing key (the same rules as Thing.missing):
 *   photo    — no photos;
 *   id-plate — no id-plate photo AND the type has ≥ 1 identifier field;
 *   receipt  — no receipt photo and no receipt document;
 *   serial   — the type has identifier field(s) and any of them is empty;
 *   value    — value.amount is null.
 */
export function missingClause(key, idTypes) {
  switch (key) {
    case 'photo':
      return { 'photos.0': { $exists: false } };
    case 'id-plate':
      return idTypes.length ? { typeId: { $in: idTypes.map((t) => t.id) }, 'photos.role': { $ne: 'id-plate' } } : MATCH_NOTHING;
    case 'receipt':
      return { 'photos.role': { $ne: 'receipt' }, 'documents.role': { $ne: 'receipt' } };
    case 'serial':
      return idTypes.length
        ? { $or: idTypes.map((t) => ({ typeId: t.id, $or: t.keys.map((k) => ({ [`attributes.${k}`]: { $in: [null, ''] } })) })) }
        : MATCH_NOTHING;
    case 'value':
      return { 'value.amount': null };
    default:
      return MATCH_NOTHING;
  }
}

function hasClause(value, idTypes) {
  switch (value) {
    case 'photo':
      return { 'photos.0': { $exists: true } };
    case 'document':
      return { 'documents.0': { $exists: true } };
    case 'receipt':
      return { $nor: [missingClause('receipt', idTypes)] };
    case 'value':
      return { 'value.amount': { $ne: null } };
    default:
      return null;
  }
}

// ── Conditions ───────────────────────────────────────────────────────────────

const ATTR_TEXT = '__attrText';

/** Every attribute value as one string (money → its amount), for free-text search. */
const attrTextStage = {
  $addFields: {
    [ATTR_TEXT]: {
      $reduce: {
        input: { $objectToArray: { $ifNull: ['$attributes', {}] } },
        initialValue: '',
        in: {
          $concat: [
            '$$value',
            ' ',
            {
              $cond: [
                { $eq: [{ $type: '$$this.v' }, 'object'] },
                { $convert: { input: '$$this.v.amount', to: 'string', onError: '', onNull: '' } },
                { $convert: { input: '$$this.v', to: 'string', onError: '', onNull: '' } },
              ],
            },
          ],
        },
      },
    },
  },
};

export const HELPER_FIELDS = Object.freeze({ __occ: 0, __nextDue: 0, [ATTR_TEXT]: 0 });

/**
 * The active dimensions of a filter + its q tokens.
 * @param {object} filter validated ThingFilterInput
 * @param {{ types: object[], tree?: ReturnType<typeof buildThingTree>, today?: Date }} ctx the household's types and containment tree
 * @returns {{ conditions: Record<string, {match: object}>, stages: object[] }} `stages` must run
 *   (after the household match) before any condition.
 */
export function buildConditions(filter = {}, { types = [], tree = buildThingTree([]), today = todayUtc() } = {}) {
  const c = {};
  const add = (key, match) => {
    if (!match) return;
    c[key] = c[key] ? { match: { $and: [c[key].match, match] } } : { match };
  };
  const idTypes = identifierTypes(types);
  const inventory = notLocation(types);
  const missingOnly = (clause) => ({ $and: [inventory, clause] });
  const all = filter.tagMatch === 'all';
  // Type ids asked for by name or id — a location type among them brings locations in.
  const askedTypes = [];

  // Structured fields.
  if (has(filter.types)) {
    const ids = toObjectIds(filter.types);
    askedTypes.push(...ids.map(String));
    add('types', ids.length ? { typeId: { $in: ids } } : MATCH_NOTHING);
  }
  if (has(filter.tags)) add('tags', inList('tags', filter.tags, { all }));
  if (has(filter.within)) {
    const ids = new Set();
    for (const p of filter.within) for (const d of tree.isLive(String(p)) ? tree.descendantsOf(String(p)) : []) ids.add(d);
    add('where', ids.size ? { parentId: { $in: toObjectIds([...ids]) } } : MATCH_NOTHING);
  }
  if (has(filter.due)) add('due', { $or: filter.due.map((b) => dueBucketClause(b, today)) });
  if (has(filter.missing)) add('missing', missingOnly({ $or: filter.missing.map((k) => missingClause(k, idTypes)) }));
  if (given(filter.hasPhotos)) add('hasPhotos', { 'photos.0': { $exists: Boolean(filter.hasPhotos) } });
  if (given(filter.hasDocuments)) add('hasDocuments', { 'documents.0': { $exists: Boolean(filter.hasDocuments) } });
  add('acquiredYears', yearRange('acquired.date', filter.acquiredYearMin, filter.acquiredYearMax));
  add('value', numberRange('value.amount', filter.valueMin, filter.valueMax));

  // The q tokens.
  const { tokens, words } = parseQuery(filter.q);
  const grouped = { type: [], tag: [], in: [] };
  for (const t of tokens) {
    const v = t.value;
    switch (t.key) {
      case 'type':
      case 'tag':
      case 'in':
        grouped[t.key].push(v);
        break;
      case 'before':
      case 'after': {
        const period = parsePeriod(v);
        if (!period) words.push(t.raw);
        else add('acquiredYears', { 'acquired.date': t.key === 'before' ? { $lt: period[0] } : { $gte: period[1] } });
        break;
      }
      case 'expiring':
      case 'due': {
        const days = parseDays(v);
        if (days === null) words.push(t.raw);
        else add('due', dueWithinClause(days, today));
        break;
      }
      case 'missing': {
        const key = v.toLowerCase();
        if (!MISSING_KEYS.includes(key)) words.push(t.raw);
        else add('missing', missingOnly(missingClause(key, idTypes)));
        break;
      }
      case 'has': {
        const clause = HAS_VALUES.includes(v.toLowerCase()) ? hasClause(v.toLowerCase(), idTypes) : null;
        if (!clause) words.push(t.raw);
        else add(v.toLowerCase() === 'photo' ? 'hasPhotos' : v.toLowerCase() === 'document' ? 'hasDocuments' : 'has', clause);
        break;
      }
      default:
        words.push(t.raw);
    }
  }
  if (grouped.type.length) {
    const wanted = grouped.type.map((v) => v.toLowerCase());
    const ids = types
      .filter((ty) => wanted.includes(String(ty.key).toLowerCase()) || wanted.includes(String(ty.name).toLowerCase()))
      .map((ty) => ty._id);
    askedTypes.push(...ids.map(String));
    add('types', ids.length ? { typeId: { $in: ids } } : MATCH_NOTHING);
  }
  if (grouped.tag.length) {
    const clauses = grouped.tag.map((v) => ({ tags: exactI(v) }));
    add('tags', clauses.length === 1 ? clauses[0] : all ? { $and: clauses } : { $or: clauses });
  }
  if (grouped.in.length) {
    const ids = new Set();
    for (const v of grouped.in) for (const id of containerIdsFor(tree, v)) ids.add(id);
    add('where', ids.size ? { parentId: { $in: toObjectIds([...ids]) } } : MATCH_NOTHING);
  }

  // Kinds last: the default (no `kinds`) depends on which types were asked for.
  let kinds = has(filter.kinds) ? filter.kinds : ['container', 'item'];
  if (!has(filter.kinds) && types.some((t) => kindOfType(t) === 'location' && askedTypes.includes(String(t._id)))) {
    kinds = [...kinds, 'location'];
  }
  add('kinds', kindClause(kinds, types));

  const stages = [...occurrenceStages(today)];
  if (words.length) {
    stages.push(attrTextStage);
    const perWord = words.map((w) => {
      const needle = { $regex: searchRegex(w), $options: 'i' };
      return { $or: [{ name: needle }, { notes: needle }, { tags: needle }, { [ATTR_TEXT]: needle }] };
    });
    add('q', perWord.length === 1 ? perWord[0] : { $and: perWord });
  }
  return { conditions: c, stages };
}

/** The household base match — the tenant literal, first stage, never conditional. */
export const baseMatch = (householdId) => ({ $match: { householdId, deletedAt: null } });

/** Pipeline prefix: household, helper fields, the full filter. */
export function filteredStages(householdId, filter, ctx) {
  const { conditions, stages } = buildConditions(filter, ctx);
  return [baseMatch(householdId), ...stages, { $match: matchOf(conditions) }];
}

// ── Facets ───────────────────────────────────────────────────────────────────

const missingFacetName = (k) => `missing:${k}`;
const dueFacetName = (b) => `due:${b}`;
const kindFacetName = (k) => `kind:${k}`;

/** The single aggregation behind `thingFacets`. */
export function facetsPipeline({ householdId, filter = {}, types, tree, today = todayUtc() }) {
  const { conditions, stages } = buildConditions(filter, { types, tree, today });
  const idTypes = identifierTypes(types);
  const inventory = notLocation(types);
  const facets = {
    types: (m) => [{ $match: m }, { $match: { typeId: { $ne: null } } }, { $group: { _id: '$typeId', n: { $sum: 1 } } }],
    tags: (m) => valuesFacetStages(m, '$tags'),
    // Direct counts per parent; shapeFacets rolls them up the tree.
    where: (m) => [{ $match: m }, { $match: { parentId: { $ne: null } } }, { $group: { _id: '$parentId', n: { $sum: 1 } } }],
    acquiredYears: (m) => yearHistogramStages(m, 'acquired.date'),
    hasPhotos: (m) => countFacetStages(m, { 'photos.0': { $exists: true } }),
    hasDocuments: (m) => countFacetStages(m, { 'documents.0': { $exists: true } }),
  };
  for (const b of DUE_BUCKETS) facets[dueFacetName(b)] = { exclude: 'due', stages: (m) => countFacetStages(m, dueBucketClause(b, today)) };
  for (const k of MISSING_KEYS) {
    facets[missingFacetName(k)] = { exclude: 'missing', stages: (m) => countFacetStages(m, { $and: [inventory, missingClause(k, idTypes)] }) };
  }
  for (const k of THING_KINDS) {
    facets[kindFacetName(k)] = { exclude: 'kinds', stages: (m) => countFacetStages(m, kindClause([k], types) ?? {}) };
  }
  return [baseMatch(householdId), ...stages, buildFacetStage(conditions, facets)];
}

/**
 * The `$facet` result → the ThingFacets shape. A Where count includes
 * everything inside (via the tree, through things in the Trash); only live
 * locations and containers are offered.
 */
export function shapeFacets(result, filter = {}, { types = [], tree = buildThingTree([]) } = {}) {
  const r = result ?? {};
  const typeById = new Map(types.map((t) => [String(t._id), t]));
  const offered = (id) => tree.isLive(id) && PARENT_KINDS.includes(kindOfType(typeById.get(String(tree.byId.get(id).typeId))));
  const direct = new Map((r.where ?? []).map((row) => [String(row._id), row.n]));
  const totals = tree.totals(direct);
  const whereRows = [...totals.entries()].filter(([id, n]) => n > 0 && offered(id)).map(([id, n]) => ({ _id: id, n }));
  const selectedWhere = (filter.within ?? []).filter((id) => tree.isLive(String(id)));
  return {
    total: shapeCount(r.total),
    types: shapeOpenFacet((r.types ?? []).map((row) => ({ _id: String(row._id), n: row.n })), filter.types ?? []),
    tags: shapeOpenFacet(r.tags, filter.tags ?? []),
    where: shapeOpenFacet(whereRows, selectedWhere),
    kinds: shapeFixedFacet(THING_KINDS.map((k) => ({ _id: k, n: shapeCount(r[kindFacetName(k)]) })), THING_KINDS),
    due: shapeFixedFacet(DUE_BUCKETS.map((b) => ({ _id: b, n: shapeCount(r[dueFacetName(b)]) })), DUE_BUCKETS),
    missing: shapeFixedFacet(MISSING_KEYS.map((k) => ({ _id: k, n: shapeCount(r[missingFacetName(k)]) })), MISSING_KEYS),
    acquiredYears: shapeHistogram(r.acquiredYears, 'year'),
    hasPhotos: shapeCount(r.hasPhotos),
    hasDocuments: shapeCount(r.hasDocuments),
  };
}
