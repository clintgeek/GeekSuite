/**
 * Legacy-tolerant tag reads, for NoteGeek / TodoGeek / ThingGeek.
 *
 * Every write now stores the suite standard (`@geeksuite/tags`: lowercase
 * kebab-case, `/` nesting). Tags written BEFORE the standard (`geekSuite`,
 * `Work`) stay in the database until `scripts/migrate-tags-kebab.js --apply`
 * rewrites them, and a filter on `geek-suite` must still find them in the
 * meantime. A normalized tag cannot be turned back into its legacy spellings
 * (`geek-suite` could have been `geekSuite`, `Geek Suite`, `geek_suite`), so
 * these helpers go the other way: read the owner's DISTINCT stored spellings
 * (one indexed `distinct`), keep the ones whose normalized form matches, and
 * filter with `$in` on those exact strings.
 *
 * After the migration every stored spelling IS its normalized form, so the
 * result is simply `[tag]` — same answer, one extra small read. Once the
 * migration is confirmed applied this can be simplified back to plain
 * equality; until then it is the difference between a filter that works and
 * one that silently loses rows.
 */
import { normalizeTag, isUnder } from '@geeksuite/tags';

/**
 * The stored spellings (for `scope`) whose normalized form passes `test`.
 * @param {import('mongoose').Model} Model
 * @param {object} scope   the owner filter, e.g. `{ userId }`
 * @param {(normalized: string, stored: string) => boolean} test
 * @returns {Promise<string[]>}
 */
export async function storedSpellingsWhere(Model, scope, test) {
  const stored = await Model.distinct('tags', scope);
  return stored.filter((t) => typeof t === 'string' && test(normalizeTag(t), t));
}

/** Stored spellings of exactly `tag` (normalized first). Always includes `tag` itself. */
export async function spellingsOf(Model, scope, tag) {
  const want = normalizeTag(tag);
  if (!want) return [];
  const found = await storedSpellingsWhere(Model, scope, (n) => n === want);
  return found.includes(want) ? found : [want, ...found];
}

/** Stored spellings of `root` and everything beneath it. Always includes `root` itself. */
export async function subtreeSpellings(Model, scope, root) {
  const want = normalizeTag(root);
  if (!want) return [];
  const found = await storedSpellingsWhere(Model, scope, (n) => isUnder(n, want));
  return found.includes(want) ? found : [want, ...found];
}

/** Mongo condition on `tags`: any of these exact strings. */
export const anyOf = (spellings) => ({ $in: spellings });
