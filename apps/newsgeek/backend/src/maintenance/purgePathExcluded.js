/**
 * One-off: delete STORED articles that their own source's path rules
 * (`Source.pathExclude`) would now drop at ingest — the press releases and
 * national wire already in the database from before the rules existed.
 *
 * Scope: an article is judged only by the rules of the source that stored it
 * (its `sourceId`); sources without rules are never touched. Dry run unless
 * `apply` is true. Idempotent: a second apply finds nothing.
 *
 * Run through scripts/purge-path-excluded.js.
 */
import pathRulesModule from '@geeksuite/schemas/newsgeek/pathRules';

const { compilePathRules, isPathExcluded } = pathRulesModule;
const DELETE_BATCH = 500;

/**
 * @param {object} deps
 * @param {import('mongoose').Model} deps.Source
 * @param {import('mongoose').Model} deps.Article
 * @param {boolean} [deps.apply]  false (default) = count only
 * @returns {Promise<Array<{ slug: string, rules: number, scanned: number, matched: number, deleted: number }>>}
 */
export async function purgePathExcluded({ Source, Article, apply = false } = {}) {
  const sources = await Source.collection
    .find({ 'pathExclude.0': { $exists: true } }, { projection: { slug: 1, pathExclude: 1 } })
    .sort({ slug: 1 })
    .toArray();
  const out = [];
  for (const source of sources) {
    const compiled = compilePathRules(source.pathExclude);
    const row = { slug: source.slug, rules: compiled.length, scanned: 0, matched: 0, deleted: 0 };
    const doomed = [];
    const cursor = Article.collection.find({ sourceId: source._id }, { projection: { url: 1, canonicalUrl: 1 } });
    for await (const a of cursor) {
      row.scanned += 1;
      if (isPathExcluded([a.url, a.canonicalUrl], compiled)) doomed.push(a._id);
    }
    row.matched = doomed.length;
    if (apply) {
      for (let i = 0; i < doomed.length; i += DELETE_BATCH) {
        const res = await Article.collection.deleteMany({ _id: { $in: doomed.slice(i, i + DELETE_BATCH) }, sourceId: source._id });
        row.deleted += res.deletedCount || 0;
      }
    }
    out.push(row);
  }
  return out;
}

export default { purgePathExcluded };
