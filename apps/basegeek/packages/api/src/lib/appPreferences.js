/**
 * appPreferences.js — canonical access helpers for User.appPreferences.
 *
 * Canonical shape: a Mongoose Map<string, Mixed> (as declared in the User
 * schema). MongoDB has no Map BSON type, so on disk the field is a plain
 * sub-document; Mongoose 8 casts that sub-document to a MongooseMap on every
 * hydration. That means:
 *   - Old documents that predate the Map schema look identical on disk to
 *     documents written under it, and load back as real Maps.
 *   - A missing field hydrates as an empty Map (schema default).
 *
 * The bug these helpers close: route code used to read the field two different
 * ways — `.get(app)` (Map access) OR `user.appPreferences[app]` (object
 * access) — in the same file. Bracket access on a MongooseMap returns
 * `undefined`, so the object branch silently missed data, and ad-hoc writes
 * risked skipping `markModified`. Funnelling every read and write through here
 * keeps access on one shape so preferences can't vanish.
 */

/**
 * Ensure `user.appPreferences` is a real Map and return it.
 *
 * Loaded documents always expose a Map, but a code path that assigned a plain
 * object (or left it nullish) would break Map writes — coerce defensively so
 * `.set()` always lands.
 *
 * @param {import('mongoose').Document} user
 * @returns {Map<string, any>}
 */
function ensureMap(user) {
  const ap = user.appPreferences;
  if (ap instanceof Map) return ap;
  const map = new Map(ap && typeof ap === 'object' ? Object.entries(ap) : []);
  user.appPreferences = map;
  return map;
}

/**
 * All of a user's app preferences as a plain object (safe for JSON responses).
 *
 * @param {import('mongoose').Document} user
 * @returns {Record<string, any>}
 */
export function appPreferencesToObject(user) {
  const ap = user.appPreferences;
  if (ap instanceof Map) return Object.fromEntries(ap);
  return ap && typeof ap === 'object' ? { ...ap } : {};
}

/**
 * One app's preferences as a plain object ({} when the app has none).
 *
 * Returns a shallow copy so callers can't mutate the stored value in place
 * without going through {@link setAppPreferences}.
 *
 * @param {import('mongoose').Document} user
 * @param {string} appName
 * @returns {Record<string, any>}
 */
export function getAppPreferences(user, appName) {
  const ap = user.appPreferences;
  const value = ap instanceof Map ? ap.get(appName) : ap?.[appName];
  return value ? { ...value } : {};
}

/**
 * Merge `patch` into one app's preferences and persist the user.
 *
 * Uses `Map.set` + `markModified` so Mongoose reliably serialises the whole
 * appPreferences sub-path — writing a fresh merged object (never mutating the
 * stored Mixed value in place) so re-fetches see the update.
 *
 * @param {import('mongoose').Document} user
 * @param {string} appName
 * @param {Record<string, any>} patch
 * @returns {Promise<Record<string, any>>} the merged value now stored
 */
export async function setAppPreferences(user, appName, patch) {
  const map = ensureMap(user);
  const existing = map.get(appName) || {};
  const merged = { ...existing, ...patch };
  map.set(appName, merged);
  user.markModified('appPreferences');
  await user.save();
  return merged;
}
