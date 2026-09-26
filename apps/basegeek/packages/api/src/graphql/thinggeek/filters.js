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
 *   in:<place>           a place id, or a name path ("garage", "house/garage",
 *                        "House > Garage"; the path matches the END of the
 *                        place's root→self path), descendants included
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
 * A list in the filter (types, places, due, missing) is ANY-of, like every
 * facet in the suite; tags honour tagMatch.
 *
 * Nothing here takes a householdId from the filter: the resolver puts the
 * session's in the literal first stage of every pipeline.
 */

const { MISSING_KEYS } = constantsModule;

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

// ── The place tree ───────────────────────────────────────────────────────────

/**
 * The household's places as a tree: byId, children, and each place's
 * root→self path. Cycles (which the resolvers refuse to create) are cut
 * rather than looped on.
 */
export function buildPlaceTree(places) {
  const byId = new Map((places ?? []).map((p) => [String(p._id), p]));
  const children = new Map();
  for (const p of byId.values()) {
    const parent = p.parentId && byId.has(String(p.parentId)) ? String(p.parentId) : null;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(String(p._id));
  }
  const pathCache = new Map();
  function pathOf(id) {
    if (pathCache.has(id)) return pathCache.get(id);
    const chain = [];
    const seen = new Set();
    let cur = byId.get(id);
    while (cur && !seen.has(String(cur._id))) {
      seen.add(String(cur._id));
      chain.unshift(cur);
      cur = cur.parentId ? byId.get(String(cur.parentId)) : null;
    }
    pathCache.set(id, chain);
    return chain;
  }
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
  /** Direct counts (placeId → n) → totals including descendants. */
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
  return { byId, children, pathOf, descendantsOf, totals, ordered };
}

function placeIdsFor(tree, value) {
  if (tree.byId.has(value)) return tree.descendantsOf(value);
  const segs = value
    .split(/\s*(?:\/|>|›)\s*/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!segs.length) return [];
  const out = new Set();
  for (const [id] of tree.byId) {
    const names = tree.pathOf(id).map((p) => String(p.name).trim().toLowerCase());
    if (names.length < segs.length) continue;
    const tail = names.slice(names.length - segs.length);
    if (tail.every((n, i) => n === segs[i])) for (const d of tree.descendantsOf(id)) out.add(d);
  }
  return [...out];
}

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
 * @param {{ types: object[], places: object[], today?: Date }} ctx the household's types and places
 * @returns {{ conditions: Record<string, {match: object}>, stages: object[] }} `stages` must run
 *   (after the household match) before any condition.
 */
export function buildConditions(filter = {}, { types = [], places = [], today = todayUtc() } = {}) {
  const c = {};
  const add = (key, match) => {
    if (!match) return;
    c[key] = c[key] ? { match: { $and: [c[key].match, match] } } : { match };
  };
  const idTypes = identifierTypes(types);
  const tree = buildPlaceTree(places);
  const all = filter.tagMatch === 'all';

  // Structured fields.
  if (has(filter.types)) {
    const ids = toObjectIds(filter.types);
    add('types', ids.length ? { typeId: { $in: ids } } : MATCH_NOTHING);
  }
  if (has(filter.tags)) add('tags', inList('tags', filter.tags, { all }));
  if (has(filter.places)) {
    const ids = new Set();
    for (const p of filter.places) for (const d of tree.byId.has(String(p)) ? tree.descendantsOf(String(p)) : []) ids.add(d);
    add('places', ids.size ? { placeId: { $in: toObjectIds([...ids]) } } : MATCH_NOTHING);
  }
  if (has(filter.due)) add('due', { $or: filter.due.map((b) => dueBucketClause(b, today)) });
  if (has(filter.missing)) add('missing', { $or: filter.missing.map((k) => missingClause(k, idTypes)) });
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
        else add('missing', missingClause(key, idTypes));
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
    add('types', ids.length ? { typeId: { $in: ids } } : MATCH_NOTHING);
  }
  if (grouped.tag.length) {
    const clauses = grouped.tag.map((v) => ({ tags: exactI(v) }));
    add('tags', clauses.length === 1 ? clauses[0] : all ? { $and: clauses } : { $or: clauses });
  }
  if (grouped.in.length) {
    const ids = new Set();
    for (const v of grouped.in) for (const id of placeIdsFor(tree, v)) ids.add(id);
    add('places', ids.size ? { placeId: { $in: toObjectIds([...ids]) } } : MATCH_NOTHING);
  }

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

/** The single aggregation behind `thingFacets`. */
export function facetsPipeline({ householdId, filter = {}, types, places, today = todayUtc() }) {
  const { conditions, stages } = buildConditions(filter, { types, places, today });
  const idTypes = identifierTypes(types);
  const facets = {
    types: (m) => [{ $match: m }, { $match: { typeId: { $ne: null } } }, { $group: { _id: '$typeId', n: { $sum: 1 } } }],
    tags: (m) => valuesFacetStages(m, '$tags'),
    places: (m) => [{ $match: m }, { $match: { placeId: { $ne: null } } }, { $group: { _id: '$placeId', n: { $sum: 1 } } }],
    acquiredYears: (m) => yearHistogramStages(m, 'acquired.date'),
    hasPhotos: (m) => countFacetStages(m, { 'photos.0': { $exists: true } }),
    hasDocuments: (m) => countFacetStages(m, { 'documents.0': { $exists: true } }),
  };
  for (const b of DUE_BUCKETS) facets[dueFacetName(b)] = { exclude: 'due', stages: (m) => countFacetStages(m, dueBucketClause(b, today)) };
  for (const k of MISSING_KEYS) {
    facets[missingFacetName(k)] = { exclude: 'missing', stages: (m) => countFacetStages(m, missingClause(k, idTypes)) };
  }
  return [baseMatch(householdId), ...stages, buildFacetStage(conditions, facets)];
}

/** The `$facet` result → the ThingFacets shape. Place counts include descendants (via the tree). */
export function shapeFacets(result, filter = {}, { places = [] } = {}) {
  const r = result ?? {};
  const tree = buildPlaceTree(places);
  const direct = new Map((r.places ?? []).map((row) => [String(row._id), row.n]));
  const totals = tree.totals(direct);
  const placeRows = [...totals.entries()].filter(([, n]) => n > 0).map(([id, n]) => ({ _id: id, n }));
  const selectedPlaces = (filter.places ?? []).filter((id) => tree.byId.has(String(id)));
  return {
    total: shapeCount(r.total),
    types: shapeOpenFacet((r.types ?? []).map((row) => ({ _id: String(row._id), n: row.n })), filter.types ?? []),
    tags: shapeOpenFacet(r.tags, filter.tags ?? []),
    places: shapeOpenFacet(placeRows, selectedPlaces),
    due: shapeFixedFacet(DUE_BUCKETS.map((b) => ({ _id: b, n: shapeCount(r[dueFacetName(b)]) })), DUE_BUCKETS),
    missing: shapeFixedFacet(MISSING_KEYS.map((k) => ({ _id: k, n: shapeCount(r[missingFacetName(k)]) })), MISSING_KEYS),
    acquiredYears: shapeHistogram(r.acquiredYears, 'year'),
    hasPhotos: shapeCount(r.hasPhotos),
    hasDocuments: shapeCount(r.hasDocuments),
  };
}
