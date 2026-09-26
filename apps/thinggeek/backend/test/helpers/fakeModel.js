/**
 * An in-memory stand-in for a mongoose model — just the calls this backend
 * makes (mongodb-memory-server is not resolvable from this package):
 * findOne / find (+ sort, limit, lean) / exists / distinct / create /
 * updateOne / updateMany / findOneAndUpdate / findOneAndDelete / deleteOne /
 * deleteMany / insertMany.
 *
 * Query language: equality on dotted paths (null matches missing, arrays
 * match by element containment, numeric segments index arrays), $in, $ne,
 * $exists, $lt/$lte/$gt/$gte, $or. Updates: $set, $push, $pull (with an
 * {field: {$in}} condition). Timestamps like mongoose's (createdAt/updatedAt;
 * updates bump updatedAt unless options.timestamps === false).
 *
 * `hooks.beforeDelete(filter)` / `hooks.beforeExists(filter)` let a test
 * simulate a concurrent writer at the exact moment the code under test acts.
 */
import mongoose from 'mongoose';

const { ObjectId } = mongoose.Types;

const clone = (v) => structuredClone(v, { transfer: [] });

function cloneDoc(doc) {
  // structuredClone turns ObjectIds into plain objects; rebuild them.
  return reviveIds(clone(serializeIds(doc)));
}
function serializeIds(v) {
  if (v instanceof ObjectId) return { __oid: v.toHexString() };
  if (v instanceof Date) return v;
  if (Array.isArray(v)) return v.map(serializeIds);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, serializeIds(x)]));
  return v;
}
function reviveIds(v) {
  if (v instanceof Date) return v;
  if (Array.isArray(v)) return v.map(reviveIds);
  if (v && typeof v === 'object') {
    if (Object.keys(v).length === 1 && typeof v.__oid === 'string') return new ObjectId(v.__oid);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, reviveIds(x)]));
  }
  return v;
}

function getPath(doc, p) {
  let cur = doc;
  for (const seg of p.split('.')) {
    if (cur == null) return undefined;
    if (Array.isArray(cur) && /^\d+$/.test(seg)) cur = cur[Number(seg)];
    else if (Array.isArray(cur)) cur = cur.map((el) => el?.[seg]); // photos.fileId → [ids]
    else cur = cur[seg];
  }
  return cur;
}

const norm = (v) => {
  if (v instanceof Date) return v.getTime();
  if (v instanceof ObjectId) return v.toHexString();
  return v;
};
const eq = (a, b) => norm(a) === norm(b);

function isOps(c) {
  return c && typeof c === 'object' && !Array.isArray(c) && !(c instanceof Date) && !(c instanceof ObjectId)
    && Object.keys(c).some((k) => k.startsWith('$'));
}

function matchValue(value, cond) {
  if (isOps(cond)) {
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case '$in': return arg.some((a) => matchValue(value, a));
        case '$ne': return !matchValue(value, arg);
        case '$exists': return (value !== undefined) === Boolean(arg);
        case '$lt': return value != null && norm(value) < norm(arg);
        case '$lte': return value != null && norm(value) <= norm(arg);
        case '$gt': return value != null && norm(value) > norm(arg);
        case '$gte': return value != null && norm(value) >= norm(arg);
        default: throw new Error(`fakeModel: unsupported operator ${op}`);
      }
    });
  }
  if (cond === null) return value == null || (Array.isArray(value) && value.some((v) => v == null));
  if (Array.isArray(value)) return value.some((v) => eq(v, cond));
  return eq(value, cond);
}

export function matches(doc, filter) {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return cond.some((f) => matches(doc, f));
    if (key === '$and') return cond.every((f) => matches(doc, f));
    const v = getPath(doc, key);
    // A path through an array yields [values]; test containment.
    if (Array.isArray(v) && !isOps(cond) && cond !== null) return v.some((x) => eq(x, cond));
    return matchValue(v, cond);
  });
}

function setPath(doc, p, value) {
  const segs = p.split('.');
  let cur = doc;
  for (const seg of segs.slice(0, -1)) {
    if (cur[seg] == null || typeof cur[seg] !== 'object') cur[seg] = {};
    cur = cur[seg];
  }
  cur[segs[segs.length - 1]] = value;
}

function applyUpdate(doc, update) {
  for (const [op, spec] of Object.entries(update)) {
    for (const [p, value] of Object.entries(spec)) {
      if (op === '$set') setPath(doc, p, cloneDoc(value));
      else if (op === '$push') {
        const arr = getPath(doc, p);
        if (Array.isArray(arr)) arr.push(cloneDoc(value));
        else setPath(doc, p, [cloneDoc(value)]);
      } else if (op === '$pull') {
        const arr = getPath(doc, p);
        if (Array.isArray(arr)) setPath(doc, p, arr.filter((el) => !matches(el, value)));
      } else throw new Error(`fakeModel: unsupported update ${op}`);
    }
  }
}

export function createFakeModel(initialDocs = [], { hooks = {}, now = () => new Date() } = {}) {
  const docs = initialDocs.map((d) => {
    const at = now();
    return { _id: new ObjectId(), createdAt: at, updatedAt: at, ...cloneDoc(d) };
  });
  const calls = [];

  function query(getRows) {
    let sortSpec = null;
    let limitN = null;
    const run = () => {
      let rows = getRows();
      if (sortSpec) {
        const [[k, dir]] = Object.entries(sortSpec);
        rows = [...rows].sort((a, b) => (String(norm(getPath(a, k))) < String(norm(getPath(b, k))) ? -dir : dir));
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return rows.map(cloneDoc);
    };
    const chain = {
      sort(spec) { sortSpec = spec; return chain; },
      limit(n) { limitN = n; return chain; },
      select() { return chain; },
      lean: async () => run(),
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return chain;
  }
  function single(getRow) {
    const run = () => { const r = getRow(); return r ? cloneDoc(r) : null; };
    const chain = {
      select() { return chain; },
      lean: async () => run(),
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return chain;
  }

  const model = {
    docs,
    calls,
    findOne(filter) {
      calls.push(['findOne', filter]);
      return single(() => docs.find((d) => matches(d, filter)));
    },
    find(filter = {}) {
      calls.push(['find', filter]);
      return query(() => docs.filter((d) => matches(d, filter)));
    },
    async exists(filter) {
      calls.push(['exists', filter]);
      await hooks.beforeExists?.(filter, model);
      const d = docs.find((x) => matches(x, filter));
      return d ? { _id: d._id } : null;
    },
    async distinct(field) {
      return [...new Set(docs.map((d) => getPath(d, field)).filter((v) => v != null))];
    },
    async create(doc) {
      calls.push(['create', doc]);
      const at = now();
      const row = { thumbPath: null, width: null, height: null, originalName: '', uploadedBy: null, ...cloneDoc(doc), _id: new ObjectId(), createdAt: at, updatedAt: at };
      docs.push(row);
      return cloneDoc(row);
    },
    async updateOne(filter, update, options = {}) {
      calls.push(['updateOne', filter, update]);
      const d = docs.find((x) => matches(x, filter));
      if (!d) return { matchedCount: 0, modifiedCount: 0 };
      applyUpdate(d, update);
      if (options.timestamps !== false && !update.$set?.updatedAt) d.updatedAt = now();
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async updateMany(filter, update) {
      calls.push(['updateMany', filter, update]);
      const hit = docs.filter((x) => matches(x, filter));
      for (const d of hit) { applyUpdate(d, update); d.updatedAt = now(); }
      return { matchedCount: hit.length, modifiedCount: hit.length };
    },
    findOneAndUpdate(filter, update, options = {}) {
      calls.push(['findOneAndUpdate', filter, update]);
      return single(() => {
        const d = docs.find((x) => matches(x, filter));
        if (!d) return null;
        applyUpdate(d, update);
        if (options.timestamps !== false) d.updatedAt = now();
        return d;
      });
    },
    async findOneAndDelete(filter) {
      calls.push(['findOneAndDelete', filter]);
      await hooks.beforeDelete?.(filter, model);
      const i = docs.findIndex((x) => matches(x, filter));
      if (i === -1) return null;
      const [row] = docs.splice(i, 1);
      return cloneDoc(row);
    },
    async deleteOne(filter) {
      calls.push(['deleteOne', filter]);
      await hooks.beforeDelete?.(filter, model);
      const i = docs.findIndex((x) => matches(x, filter));
      if (i === -1) return { deletedCount: 0 };
      docs.splice(i, 1);
      return { deletedCount: 1 };
    },
    async deleteMany(filter) {
      calls.push(['deleteMany', filter]);
      await hooks.beforeDelete?.(filter, model);
      let n = 0;
      for (let i = docs.length - 1; i >= 0; i -= 1) {
        if (matches(docs[i], filter)) { docs.splice(i, 1); n += 1; }
      }
      return { deletedCount: n };
    },
  };
  return model;
}

export default { createFakeModel, matches };
