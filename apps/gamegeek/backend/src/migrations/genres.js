/**
 * Boot migration: canonical genre names (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §A5).
 *
 * Every game's `genres` goes through canonicalGenres() — mapped, unknown
 * names kept, deduped after mapping. Idempotent: a second run finds nothing
 * to change. Logs the changed count once.
 *
 * Every update is scoped `{_id, householdId}` and guarded on the exact
 * `genres` array it read, so a concurrent edit is never overwritten (that
 * game is simply picked up on the next boot). When enrichment wrote the
 * genres and they still hash to what it wrote, the fingerprint moves with
 * them, so an unlink still clears enrichment's genres.
 */
import constantsModule from '@geeksuite/schemas/gamegeek/constants';
import { valueHash } from '../enrichment/plan.js';

const { canonicalGenres } = constantsModule;

export const GENRE_MIGRATION_BATCH = 500;

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** The bulkWrite ops the migration would run for these rows (pure). */
export function planGenreMigration(rows) {
  const ops = [];
  for (const row of rows ?? []) {
    const current = Array.isArray(row.genres) ? row.genres : [];
    const next = canonicalGenres(current);
    if (sameList(current, next)) continue;
    const set = { genres: next };
    const e = row.enrichment;
    if (e && Array.isArray(e.filled) && e.filled.includes('genres') && e.filledHashes?.genres === valueHash(current)) {
      set['enrichment.filledHashes'] = { ...e.filledHashes, genres: valueHash(next) };
    }
    ops.push({ updateOne: { filter: { _id: row._id, householdId: row.householdId, genres: current }, update: { $set: set } } });
  }
  return ops;
}

/**
 * @param {{Game: object, logger?: object, batchSize?: number}} deps
 * @returns {Promise<{scanned: number, changed: number}>}
 */
export async function migrateGenres({ Game, logger, batchSize = GENRE_MIGRATION_BATCH }) {
  const rows = await Game.find({ 'genres.0': { $exists: true } }, { _id: 1, householdId: 1, genres: 1, enrichment: 1 }).lean();
  const ops = planGenreMigration(rows);
  let changed = 0;
  for (let i = 0; i < ops.length; i += batchSize) {
    const res = await Game.bulkWrite(ops.slice(i, i + batchSize), { ordered: false });
    changed += res?.modifiedCount ?? res?.nModified ?? 0;
  }
  logger?.info?.({ scanned: rows.length, changed }, `genre migration: ${changed} game(s) normalized to canonical genres`);
  return { scanned: rows.length, changed };
}

export default { migrateGenres, planGenreMigration };
