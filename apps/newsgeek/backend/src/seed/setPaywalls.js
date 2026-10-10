/**
 * One-off: bring an EXISTING database's paywall levels in line with
 * PAYWALL_BY_SLUG (./data.js). The seed is insert-if-absent, so a source that
 * already exists never picks up a changed `access.paywall`; this does, for
 * exactly the listed slugs and exactly that one field. Idempotent: a source
 * already at its level is reported and left alone. Unknown slugs (not in this
 * database) are reported as missing, never created.
 *
 * Run through scripts/set-paywalls.js (`npm run set-paywalls [-- --dry-run]`).
 */
import { PAYWALL_BY_SLUG } from './data.js';

/**
 * @param {object} deps
 * @param {import('mongoose').Model} deps.Source
 * @param {Record<string,string>} [deps.levels]  slug → paywall (defaults to PAYWALL_BY_SLUG)
 * @param {boolean} [deps.dryRun]
 * @returns {Promise<Array<{ slug: string, from: string|null, to: string, action: 'set'|'would-set'|'unchanged'|'missing' }>>}
 */
export async function setPaywalls({ Source, levels = PAYWALL_BY_SLUG, dryRun = false } = {}) {
  const out = [];
  for (const [slug, to] of Object.entries(levels)) {
    const row = await Source.collection.findOne({ slug }, { projection: { 'access.paywall': 1 } });
    if (!row) { out.push({ slug, from: null, to, action: 'missing' }); continue; }
    const from = row.access?.paywall ?? null;
    if (from === to) { out.push({ slug, from, to, action: 'unchanged' }); continue; }
    if (dryRun) { out.push({ slug, from, to, action: 'would-set' }); continue; }
    // Raw collection write: one field, no timestamps or other defaults touched.
    await Source.collection.updateOne({ _id: row._id }, { $set: { 'access.paywall': to } });
    out.push({ slug, from, to, action: 'set' });
  }
  return out;
}

export default { setPaywalls };
