/**
 * importUserResolver — turn a per-user Playnite drop folder's NAME into a
 * suite user id. Same approach as FitnessGeek's
 * (DOCS/BODY_COMPOSITION_INTAKE.md §11.1, src/services/importUserResolver.js):
 * the drop folder holds one subfolder per user, named with their GeekSuite
 * username — or their email, for accounts that sign in with one. Matched
 * case-insensitively and exactly.
 *
 * Users live in basegeek's `userGeek` database on the same Mongo server.
 * gamegeek's own connection can read it, so this uses `useDb` on that
 * connection rather than a new credential or a call to basegeek. Read-only,
 * and only `_id` is ever read back.
 */
import mongoose from 'mongoose';

const USER_DB = 'userGeek';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param {string} folderName
 * @param {{ users?: import('mongodb').Collection }} [deps] injectable for tests
 * @returns {Promise<string|null>} the user's id, or null when no user matches
 */
export async function resolveImportUser(folderName, deps = {}) {
  const name = (folderName || '').trim();
  if (!name) return null;
  const users = deps.users || mongoose.connection.useDb(USER_DB, { useCache: true }).collection('users');
  const exact = new RegExp(`^${escapeRegex(name)}$`, 'i');
  const doc = await users.findOne(
    { $or: [{ username: exact }, { email: exact }] },
    { projection: { _id: 1 } },
  );
  return doc ? String(doc._id) : null;
}

export default { resolveImportUser };
