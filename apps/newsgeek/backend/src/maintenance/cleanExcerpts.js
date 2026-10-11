/**
 * One-off: re-apply the excerpt cleaner (ingest/normalize.js cleanExcerpt) to
 * STORED excerpts — WordPress's "The post … appeared first on …." footers,
 * trailing "Continue reading" / "Read more", "[…]". New items are cleaned at
 * ingest; this fixes the ones stored before. Only `excerpt` is written, and
 * only when the cleaner changes it. Dry run unless `apply`. Idempotent.
 *
 * Run through scripts/clean-excerpts.js.
 */
import { cleanExcerpt } from '../ingest/normalize.js';

// A cheap superset of what the cleaner can change, so Mongo skips the rest.
const CANDIDATE = /appeared first on|Continue reading|Read [Mm]ore|\]\s*$/;
const WRITE_BATCH = 500;

/**
 * @param {object} deps
 * @param {import('mongoose').Model} deps.Article
 * @param {boolean} [deps.apply]
 * @param {number} [deps.samples]  how many before/after pairs to return
 * @returns {Promise<{ scanned: number, changed: number, written: number, examples: Array<{ before: string, after: string }> }>}
 */
export async function cleanExcerpts({ Article, apply = false, samples = 3 } = {}) {
  const result = { scanned: 0, changed: 0, written: 0, examples: [] };
  let ops = [];
  const flush = async () => {
    if (!ops.length) return;
    const res = await Article.collection.bulkWrite(ops, { ordered: false });
    result.written += res.modifiedCount || 0;
    ops = [];
  };
  const cursor = Article.collection.find({ excerpt: { $regex: CANDIDATE } }, { projection: { excerpt: 1 } });
  for await (const a of cursor) {
    result.scanned += 1;
    const after = cleanExcerpt(a.excerpt);
    if (after === a.excerpt) continue;
    result.changed += 1;
    if (result.examples.length < samples) result.examples.push({ before: a.excerpt.slice(-120), after: after.slice(-120) });
    if (apply) {
      // Guarded on the old value: an excerpt changed since we read it is left alone.
      ops.push({ updateOne: { filter: { _id: a._id, excerpt: a.excerpt }, update: { $set: { excerpt: after } } } });
      if (ops.length >= WRITE_BATCH) await flush();
    }
  }
  await flush();
  return result;
}

export default { cleanExcerpts };
