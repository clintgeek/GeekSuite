/**
 * Boot migration: derive `libraryTags` and `unsortedTags` from every book's
 * raw `tags` (apps/bookgeek/DOCS/TAGS.md §4). GameGeek's genre migration
 * pattern (apps/gamegeek/backend/src/migrations/genres.js).
 *
 * Why a boot migration and not a one-off script: the vocabulary is meant to
 * change — Chef's answers in DOCS/TAGS_REVIEW.md become synonyms and drops —
 * and every such change has to reach the books already stored. A pass that
 * recomputes on each boot and writes only what differs does that on the next
 * deploy, with nobody remembering to run anything. `scripts/tags-migration.mjs`
 * runs the same code on demand, dry by default.
 *
 * Idempotent: a second run finds nothing to change. It never touches `tags`
 * or `myTags`. Each update is guarded on the exact `tags` array it read, so a
 * concurrent import or edit is never overwritten (that book is simply picked
 * up on the next boot). Logs one line with what changed.
 */
import { deriveTagFields } from "../tags.js";

export const TAG_MIGRATION_BATCH = 500;

const sameList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * The bulkWrite ops the migration would run for these rows (pure), and a
 * summary of what they change.
 */
export function planTagMigration(rows) {
  const ops = [];
  let fresh = 0; // books that had no derived fields yet
  for (const row of rows ?? []) {
    const current = Array.isArray(row.tags) ? row.tags : null;
    const next = deriveTagFields(current ?? []);
    if (sameList(row.libraryTags, next.libraryTags) && sameList(row.unsortedTags, next.unsortedTags)) continue;
    if (!Array.isArray(row.libraryTags) || !Array.isArray(row.unsortedTags)) fresh += 1;
    const guard = current ? { tags: current } : { tags: { $exists: false } };
    ops.push({ updateOne: { filter: { _id: row._id, ...guard }, update: { $set: next } } });
  }
  return { ops, fresh };
}

/**
 * @param {{Book: object, logger?: object, dryRun?: boolean, batchSize?: number}} deps
 * @returns {Promise<{scanned: number, planned: number, changed: number, fresh: number, dryRun: boolean, ops: object[]}>}
 */
export async function migrateTags({ Book, logger, dryRun = false, batchSize = TAG_MIGRATION_BATCH }) {
  const rows = await Book.find({}, { _id: 1, tags: 1, libraryTags: 1, unsortedTags: 1 }).lean();
  const { ops, fresh } = planTagMigration(rows);
  let changed = 0;
  if (!dryRun) {
    for (let i = 0; i < ops.length; i += batchSize) {
      const res = await Book.bulkWrite(ops.slice(i, i + batchSize), { ordered: false });
      changed += res?.modifiedCount ?? res?.nModified ?? 0;
    }
  }
  const summary = { scanned: rows.length, planned: ops.length, changed, fresh, dryRun };
  const verb = dryRun ? `would re-derive ${ops.length}` : `re-derived ${changed}`;
  logger?.info?.(summary, `tag migration: ${verb} book(s) of ${rows.length} (${fresh} had no derived tags yet)`);
  return { ...summary, ops };
}

export default { migrateTags, planTagMigration };
