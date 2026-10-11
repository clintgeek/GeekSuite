/**
 * One-off: bring an EXISTING database's per-source path rules in line with
 * PATH_RULES_BY_SLUG (./pathRules.js). The seed is insert-if-absent, so a
 * source that already exists never picks up new `pathExclude` defaults; this
 * sets exactly that one field on exactly the listed slugs. Idempotent: a
 * source already at its rules is reported and left alone. A slug missing from
 * the database is reported, never created.
 *
 * Run through scripts/set-path-rules.js (`--dry-run` writes nothing).
 */
import { PATH_RULES_BY_SLUG } from './pathRules.js';

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * @param {object} deps
 * @param {import('mongoose').Model} deps.Source
 * @param {Record<string,string[]>} [deps.rules]  slug → patterns (defaults to PATH_RULES_BY_SLUG)
 * @param {boolean} [deps.dryRun]
 * @returns {Promise<Array<{ slug, from: string[]|null, to: string[], action: 'set'|'would-set'|'unchanged'|'missing' }>>}
 */
export async function setPathRules({ Source, rules = PATH_RULES_BY_SLUG, dryRun = false } = {}) {
  const out = [];
  for (const [slug, patterns] of Object.entries(rules)) {
    const to = [...patterns];
    const row = await Source.collection.findOne({ slug }, { projection: { pathExclude: 1 } });
    if (!row) { out.push({ slug, from: null, to, action: 'missing' }); continue; }
    const from = Array.isArray(row.pathExclude) ? row.pathExclude : [];
    if (same(from, to)) { out.push({ slug, from, to, action: 'unchanged' }); continue; }
    if (dryRun) { out.push({ slug, from, to, action: 'would-set' }); continue; }
    // Raw collection write: one field, no timestamps or other defaults touched.
    await Source.collection.updateOne({ _id: row._id }, { $set: { pathExclude: to } });
    out.push({ slug, from, to, action: 'set' });
  }
  return out;
}

export default { setPathRules };
