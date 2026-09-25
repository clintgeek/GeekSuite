/**
 * An in-memory stand-in for the Game model — just enough of Mongo's query
 * and update language for the enrichment engine's calls: equality on dotted
 * paths (null matches missing, arrays match by containment), $in, $ne,
 * $exists, $lt/$lte/$gt/$gte, $all, $not, $or; updates $set (dotted),
 * $addToSet {$each}, $pullAll, $pull, $inc; the per-household unique
 * indexes on externalIds.steamAppId / igdb (E11000); and timestamps
 * (updatedAt bumps on every write, like mongoose).
 *
 * `hooks.beforeUpdate(filter, update, fake)` runs before each updateOne —
 * tests use it to simulate a concurrent writer.
 */
const clone = (v) => structuredClone(v);

function getPath(doc, path) {
  let cur = doc;
  for (const seg of path.split('.')) {
    if (cur == null) return undefined;
    cur = Array.isArray(cur) && /^\d+$/.test(seg) ? cur[Number(seg)] : cur[seg];
  }
  return cur;
}

function setPath(doc, path, value) {
  const segs = path.split('.');
  let cur = doc;
  for (const seg of segs.slice(0, -1)) {
    if (cur[seg] == null || typeof cur[seg] !== 'object') cur[seg] = {};
    cur = cur[seg];
  }
  cur[segs[segs.length - 1]] = value;
}

const norm = (v) => (v instanceof Date ? v.getTime() : v && typeof v === 'object' && !Array.isArray(v) && v.toHexString ? v.toHexString() : v);

function eq(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return norm(a) === norm(b);
}

function isOperatorObject(cond) {
  return cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith('$'));
}

function matchValue(value, cond) {
  if (isOperatorObject(cond)) {
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case '$in':
          return arg.some((a) => matchValue(value, a));
        case '$nin':
          return !arg.some((a) => matchValue(value, a));
        case '$ne':
          return !matchValue(value, arg);
        case '$exists':
          return (value !== undefined) === Boolean(arg);
        case '$lt':
          return value != null && norm(value) < norm(arg);
        case '$lte':
          return value != null && norm(value) <= norm(arg);
        case '$gt':
          return value != null && norm(value) > norm(arg);
        case '$gte':
          return value != null && norm(value) >= norm(arg);
        case '$all':
          return Array.isArray(value) && arg.every((a) => value.some((v) => eq(v, a)));
        case '$not':
          return !matchValue(value, arg);
        default:
          throw new Error(`fakeGameModel: unsupported operator ${op}`);
      }
    });
  }
  if (cond === null) return value == null;
  if (Array.isArray(value) && !Array.isArray(cond)) return value.some((v) => eq(v, cond));
  return eq(value, cond);
}

export function matches(doc, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    if (key === '$and') return cond.every((f) => matches(doc, f));
    return matchValue(getPath(doc, key), cond);
  });
}

const UNIQUE_PATHS = ['externalIds.steamAppId', 'externalIds.igdb'];

export function createFakeGameModel(initialDocs = [], hooks = {}) {
  let clock = Date.parse('2026-09-25T00:00:00Z');
  const tick = () => new Date((clock += 1000));
  const docs = initialDocs.map((d) => ({ updatedAt: tick(), ...clone(d) }));
  const calls = { updateOne: [] };

  function query(rows) {
    let out = rows;
    const chain = {
      sort(spec) {
        const [[k, dir]] = Object.entries(spec);
        out = [...out].sort((a, b) => (String(getPath(a, k)) < String(getPath(b, k)) ? -dir : dir));
        return chain;
      },
      limit(n) {
        out = out.slice(0, n);
        return chain;
      },
      lean: async () => out.map(clone),
    };
    return chain;
  }

  function checkUnique(next, self) {
    for (const path of UNIQUE_PATHS) {
      const v = getPath(next, path);
      if (typeof v !== 'string') continue;
      const clash = docs.find((d) => d !== self && d.householdId === next.householdId && getPath(d, path) === v);
      if (clash) {
        const err = new Error(`E11000 duplicate key ${path}`);
        err.code = 11000;
        throw err;
      }
    }
  }

  const model = {
    docs,
    calls,
    findOne(filter) {
      const hit = docs.find((d) => matches(d, filter));
      return { lean: async () => (hit ? clone(hit) : null) };
    },
    find(filter) {
      return query(docs.filter((d) => matches(d, filter)));
    },
    async countDocuments(filter) {
      return docs.filter((d) => matches(d, filter)).length;
    },
    async updateOne(filter, update) {
      calls.updateOne.push({ filter: clone(filter), update: clone(update) });
      if (hooks.beforeUpdate) await hooks.beforeUpdate(filter, update, model);
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return { matchedCount: 0, modifiedCount: 0 };
      const next = clone(doc);
      for (const [k, v] of Object.entries(update.$set ?? {})) setPath(next, k, clone(v));
      for (const [k, v] of Object.entries(update.$inc ?? {})) setPath(next, k, (getPath(next, k) ?? 0) + v);
      for (const [k, v] of Object.entries(update.$addToSet ?? {})) {
        const list = getPath(next, k) ?? [];
        for (const item of v.$each ?? [v]) if (!list.some((x) => eq(x, item))) list.push(item);
        setPath(next, k, list);
      }
      for (const [k, v] of Object.entries(update.$pullAll ?? {})) {
        setPath(next, k, (getPath(next, k) ?? []).filter((x) => !v.some((y) => eq(x, y))));
      }
      for (const [k, v] of Object.entries(update.$pull ?? {})) {
        setPath(next, k, (getPath(next, k) ?? []).filter((x) => !eq(x, v)));
      }
      next.updatedAt = tick();
      checkUnique(next, doc);
      Object.keys(doc).forEach((k) => delete doc[k]);
      Object.assign(doc, next);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    /** Test helper: mutate a stored doc as a concurrent writer would (bumps updatedAt). */
    touch(id, mutate) {
      const doc = docs.find((d) => String(d._id) === String(id));
      mutate(doc);
      doc.updatedAt = tick();
    },
    get(id) {
      return clone(docs.find((d) => String(d._id) === String(id)));
    },
  };
  return model;
}

export default { createFakeGameModel, matches };
