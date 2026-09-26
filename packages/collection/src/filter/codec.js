/**
 * The collection's query state — a filter object, any state-level fields that
 * sit outside it, sort, direction and a random seed — and the one codec that
 * moves it in and out of the URL.
 *
 * Everything lives in the query string, so a filtered library is a link, back
 * and forward work, and a detail sheet opened over the list closes onto
 * exactly the list it came from.
 *
 * The app describes its filter once, as a SCHEMA, and gets back a codec:
 *
 *   const codec = createFilterCodec({
 *     fields: [
 *       { key: 'q', type: 'search', param: 'q' },
 *       { key: 'shelves', type: 'list', param: 'shelf', drop: ['all'] },
 *       { key: 'lengths', type: 'list', param: 'length', values: ['short', …] },
 *       { key: 'tagMatch', type: 'enum', param: 'match', values: ['any', 'all'], default: 'any',
 *         counts: false, requires: ['genres', 'tags'] },
 *       { key: 'favorite', type: 'boolean', param: 'fav' },      // ?fav=1 / ?fav=0
 *       { key: 'needsDecision', type: 'flag', param: 'decide' }, // only true is written
 *       { key: 'year', type: 'range', param: 'year', minKey: 'releaseYearMin', maxKey: 'releaseYearMax',
 *         parse: integerBetween(1901, 2199) },                   // ?year=2010-2020, "2010-", "-2020"
 *     ],
 *     state: [{ key: 'owned', param: 'owned', values: ['true', 'false'], default: 'all' }],
 *     sorts: { order: [...], default: 'title', random: 'random', defaultDir: {...} },
 *   });
 *
 * URL grammar — short keys, one per filter, defaults never written:
 *   - multi-values are REPEATED params (`?genre=RPG&genre=Puzzle`), never comma
 *     lists: a value may contain a comma, and a repeated param round-trips any
 *     string. A single-value link (`?shelf=backlog`) is simply a one-value list.
 *   - params are written in schema order, then state fields, then sort, then
 *     `seed` (random only) or `dir` (when not the sort's natural direction).
 *   - params the codec does not own are left alone.
 *
 * Field types:
 *   search  — a free-text string; written when it has non-space content.
 *   list    — string[]; `drop` lists values read as "no filter" (`shelf=all`),
 *             `values` (optional) restricts it to a closed vocabulary.
 *   enum    — one of `values`, else `default`. `counts: false` keeps it out of
 *             the active count (a modifier like tagMatch); `requires` sends it
 *             to the server only alongside one of those list keys.
 *   boolean — true | false | null; `1`/`0` in the URL (`true`/`false` read too).
 *   flag    — true | null; only true is written.
 *   range   — two filter keys (`minKey`, `maxKey`) under one `lo-hi` param;
 *             `parse` turns one side into a number or null; a reversed range
 *             is swapped.
 *
 * `legacy(params, state)` (optional) runs last in `read`, for an app's old
 * link shapes the schema cannot express.
 *
 * Every function is pure so the codec is testable without a router;
 * `useCollectionFilter()` is what components call.
 */

const uniq = (values) => [...new Set(values.map((v) => String(v).trim()).filter(Boolean))];

const toBool = (raw) => (raw === '1' || raw === 'true' ? true : raw === '0' || raw === 'false' ? false : null);

const given = (v) => v !== null && v !== undefined;

/** A random seed for a shuffled sort: a positive 31-bit int (a GraphQL Int). */
export function newSeed() {
  return 1 + Math.floor(Math.random() * 2147483646);
}

/** A range-side parser: an integer in [lo, hi], else null. */
export function integerBetween(lo, hi) {
  return (raw) => {
    if (raw === '' || raw === null || raw === undefined) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  };
}

const DIRS = ['asc', 'desc'];

function emptyValue(field) {
  switch (field.type) {
    case 'search':
      return '';
    case 'list':
      return [];
    case 'enum':
      return field.default ?? '';
    default:
      return null;
  }
}

/**
 * Build a codec from a schema (see the header). Returns plain functions and
 * the frozen defaults; nothing in it holds state.
 */
export function createFilterCodec(schema) {
  const fields = schema.fields ?? [];
  const stateFields = schema.state ?? [];
  const sortsIn = schema.sorts ?? {};
  const sorts = {
    order: sortsIn.order ?? [],
    default: sortsIn.default ?? sortsIn.order?.[0] ?? null,
    random: sortsIn.random ?? null,
    defaultDir: sortsIn.defaultDir ?? {},
  };
  const P = { sort: 'sort', dir: 'dir', seed: 'seed', ...(schema.params ?? {}) };

  const listFields = fields.filter((f) => f.type === 'list');
  const stateKeys = new Set(stateFields.map((s) => s.key));

  const empty = {};
  for (const f of fields) {
    if (f.type === 'range') {
      empty[f.minKey] = null;
      empty[f.maxKey] = null;
    } else {
      empty[f.key] = emptyValue(f);
    }
  }
  const EMPTY_FILTER = Object.freeze(empty);

  const stateDefaults = Object.fromEntries(stateFields.map((s) => [s.key, s.default]));
  const DEFAULT_STATE = Object.freeze({
    filter: EMPTY_FILTER,
    ...stateDefaults,
    sort: sorts.default,
    dir: sorts.defaultDir[sorts.default] ?? 'asc',
    seed: null,
  });

  const validSort = (s) => (sorts.order.includes(s) ? s : sorts.default);
  const dirFor = (sort) => sorts.defaultDir[sort] ?? 'asc';

  /** Every param this codec owns; anything else in the URL is left alone. */
  const OWN_PARAMS = [...fields.map((f) => f.param), ...stateFields.map((s) => s.param), P.sort, P.dir, P.seed];

  /** URLSearchParams → state. Anything unknown falls back to its default. */
  function read(params) {
    const get = (k) => params.get(k) ?? '';
    const filter = { ...EMPTY_FILTER };

    for (const f of fields) {
      switch (f.type) {
        case 'search':
          filter[f.key] = get(f.param);
          break;
        case 'list': {
          let values = uniq(params.getAll(f.param));
          if (f.drop) values = values.filter((v) => !f.drop.includes(v));
          if (f.values) values = values.filter((v) => f.values.includes(v));
          filter[f.key] = values;
          break;
        }
        case 'enum':
          filter[f.key] = (f.values ?? []).includes(get(f.param)) ? get(f.param) : emptyValue(f);
          break;
        case 'boolean':
          filter[f.key] = toBool(get(f.param));
          break;
        case 'flag':
          filter[f.key] = toBool(get(f.param)) === true ? true : null;
          break;
        case 'range': {
          const parse = f.parse ?? integerBetween(-Infinity, Infinity);
          const [lo = '', hi = ''] = get(f.param).split('-');
          let min = parse(lo);
          let max = parse(hi);
          if (min !== null && max !== null && min > max) [min, max] = [max, min];
          filter[f.minKey] = min;
          filter[f.maxKey] = max;
          break;
        }
        default:
          break;
      }
    }

    const state = { filter };
    for (const s of stateFields) state[s.key] = s.values.includes(get(s.param)) ? get(s.param) : s.default;

    const sort = validSort(get(P.sort));
    const dir = DIRS.includes(get(P.dir)) ? get(P.dir) : sorts.defaultDir[sort];
    const seedNum = Number(get(P.seed));
    const seed = sorts.random && sort === sorts.random && Number.isInteger(seedNum) && seedNum > 0 ? seedNum : null;
    Object.assign(state, { sort, dir, seed });

    return schema.legacy ? schema.legacy(params, state) : state;
  }

  /** State → params, on top of `base` (whose foreign params survive). */
  function toParams(state, base = new URLSearchParams()) {
    const next = new URLSearchParams(base);
    OWN_PARAMS.forEach((k) => next.delete(k));
    const f = { ...EMPTY_FILTER, ...state.filter };

    for (const field of fields) {
      const v = f[field.key];
      switch (field.type) {
        case 'search':
          if (v && v.trim()) next.set(field.param, v);
          break;
        case 'list':
          uniq(v || []).forEach((x) => next.append(field.param, x));
          break;
        case 'enum':
          if (v !== emptyValue(field) && (field.values ?? []).includes(v)) next.set(field.param, v);
          break;
        case 'boolean':
          if (v === true || v === false) next.set(field.param, v ? '1' : '0');
          break;
        case 'flag':
          if (v === true) next.set(field.param, '1');
          break;
        case 'range': {
          const min = f[field.minKey];
          const max = f[field.maxKey];
          if (min != null || max != null) next.set(field.param, `${min ?? ''}-${max ?? ''}`);
          break;
        }
        default:
          break;
      }
    }
    for (const s of stateFields) if (s.values.includes(state[s.key])) next.set(s.param, state[s.key]);

    const sort = validSort(state.sort);
    if (sort !== sorts.default) next.set(P.sort, sort);
    if (sorts.random && sort === sorts.random) {
      if (state.seed) next.set(P.seed, String(state.seed));
    } else if (state.dir && state.dir !== sorts.defaultDir[sort]) {
      next.set(P.dir, state.dir);
    }
    return next;
  }

  /**
   * Apply a patch to the params. `patch` may carry filter fields directly
   * (`{ genres: ['RPG'] }`), a whole `filter`, state fields (`{ owned }`) or
   * `{ sort, dir, seed }`. A new sort resets the direction to that sort's
   * natural one, and picking the random sort mints a seed when none is given
   * (keeping the current one if it was already shuffled).
   */
  function write(params, patch = {}) {
    const current = read(params);
    const { sort, dir, seed, filter: filterPatch, ...rest } = patch;
    const fieldPatch = {};
    const statePatch = {};
    for (const [k, v] of Object.entries(rest)) (stateKeys.has(k) ? statePatch : fieldPatch)[k] = v;

    const next = { ...current, filter: { ...current.filter, ...filterPatch, ...fieldPatch } };
    for (const [k, v] of Object.entries(statePatch)) if (v !== undefined) next[k] = v;
    if (sort !== undefined) {
      next.sort = sort;
      next.dir = dir ?? dirFor(sort);
      if (sorts.random && sort === sorts.random) {
        next.seed = seed ?? (current.sort === sorts.random && current.seed ? current.seed : newSeed());
      }
    } else if (dir !== undefined) {
      next.dir = dir;
    }
    if (seed !== undefined && sort === undefined) next.seed = seed;
    return toParams(next, params);
  }

  /** The filter as the server's input: only what narrows. `null` when nothing does. */
  function toFilterInput(filter) {
    const f = { ...EMPTY_FILTER, ...filter };
    const out = {};
    const deferred = [];
    for (const field of fields) {
      const v = f[field.key];
      switch (field.type) {
        case 'search': {
          const q = (v || '').trim();
          if (q) out[field.key] = q;
          break;
        }
        case 'list': {
          const values = uniq(v || []);
          if (values.length) out[field.key] = values;
          break;
        }
        case 'enum':
          if (v !== emptyValue(field) && (field.values ?? []).includes(v)) {
            if (field.requires) deferred.push([field.key, v, field.requires]);
            else out[field.key] = v;
          }
          break;
        case 'boolean':
          if (v === true || v === false) out[field.key] = v;
          break;
        case 'flag':
          if (v === true) out[field.key] = true;
          break;
        case 'range':
          if (f[field.minKey] != null) out[field.minKey] = f[field.minKey];
          if (f[field.maxKey] != null) out[field.maxKey] = f[field.maxKey];
          break;
        default:
          break;
      }
    }
    for (const [key, v, requires] of deferred) if (requires.some((k) => out[k])) out[key] = v;
    return Object.keys(out).length ? out : null;
  }

  /** How many narrowing selections are on — each list value counts, the search does not. */
  function activeCount(state) {
    const f = { ...EMPTY_FILTER, ...state.filter };
    let n = 0;
    for (const field of fields) {
      const v = f[field.key];
      switch (field.type) {
        case 'list':
          n += (v || []).length;
          break;
        case 'enum':
          if (field.counts !== false && v && v !== emptyValue(field)) n += 1;
          break;
        case 'boolean':
          if (given(v)) n += 1;
          break;
        case 'flag':
          if (v === true) n += 1;
          break;
        case 'range':
          if (f[field.minKey] != null || f[field.maxKey] != null) n += 1;
          break;
        default:
          break;
      }
    }
    for (const s of stateFields) if (state[s.key] && state[s.key] !== s.default) n += 1;
    return n;
  }

  const searchKeys = fields.filter((f) => f.type === 'search').map((f) => f.key);

  /** Whether anything narrows the list at all (search included). */
  function isNarrowed(state) {
    return activeCount(state) > 0 || searchKeys.some((k) => Boolean((state.filter?.[k] || '').trim()));
  }

  /**
   * A stored view → the search string that applies it. `{ filter, sort, dir,
   * ...stateFields }`; anything invalid falls back to its default. A shuffled
   * view gets a fresh shuffle each time it is opened.
   */
  function viewSearch(view = {}) {
    const sort = validSort(view.sort);
    const state = {
      filter: { ...EMPTY_FILTER, ...(view.filter ?? {}) },
      sort,
      dir: DIRS.includes(view.dir) ? view.dir : sorts.defaultDir[sort],
      seed: null,
    };
    for (const s of stateFields) state[s.key] = s.values.includes(view[s.key]) ? view[s.key] : s.default;
    if (sorts.random && sort === sorts.random) state.seed = newSeed();
    const s = toParams(state).toString();
    return s ? `?${s}` : '';
  }

  /** The comparable form of a search string (seed ignored, param order ignored). */
  function canonicalSearch(search) {
    const state = read(new URLSearchParams(search || ''));
    const s = toParams({ ...state, seed: null });
    s.sort();
    return s.toString();
  }

  /** A list link with one more value on list `key` — e.g. a detail page's tappable genre. */
  function searchWith(search, key, value) {
    const params = new URLSearchParams(search || '');
    const { filter } = read(params);
    const values = filter[key] || [];
    const next = values.includes(value) ? params : write(params, { [key]: [...values, value] });
    const s = next.toString();
    return s ? `?${s}` : '';
  }

  /** The state with every narrowing off (search included); the sort stays. */
  const clearPatch = () => ({ filter: EMPTY_FILTER, ...stateDefaults });

  return {
    schema,
    fields,
    listKeys: listFields.map((f) => f.key),
    stateFields,
    sorts,
    params: P,
    EMPTY_FILTER,
    DEFAULT_STATE,
    OWN_PARAMS,
    read,
    toParams,
    write,
    toFilterInput,
    activeCount,
    isNarrowed,
    viewSearch,
    canonicalSearch,
    searchWith,
    clearPatch,
    newSeed,
  };
}
