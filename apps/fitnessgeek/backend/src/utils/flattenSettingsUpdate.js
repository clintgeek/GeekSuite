/**
 * Flatten a nested `usersettings` patch into MongoDB dot paths so that `$set`
 * MERGES a sub-document instead of replacing it.
 *
 * This is the third copy of one rule, and the reason it now lives in its own
 * module rather than inside a route handler:
 *
 *   1. basegeek's gateway — `flattenSettingsUpdate()` in
 *      `apps/basegeek/packages/api/src/graphql/fitnessgeek/resolvers.js`
 *   2. this app's `PUT /api/settings` — `routes/settingsRoutes.js`
 *   3. this app's `UserSettings.updateSettings` static — reached by
 *      `PUT /api/settings/ai`, `PUT /api/settings/dashboard` and
 *      `POST /api/goals`
 *
 * (1) and (2) were fixed on 2026-09-05 (BURN_REVIEW #5 and #6). (3) was not,
 * and it has exactly the same failure: `$set: { ai: { enabled: true } }`
 * replaces the whole `ai` sub-document, so a save that only touches the master
 * toggle deletes `ai.features`, and a partial `nutrition_goal` save deletes
 * bmr / tdee / weekly_schedule / keto.
 *
 * Rules, identical to the gateway's twin:
 *   - recurse into plain objects
 *   - stop at arrays (`dashboard.card_order`, `nutrition_goal.weekly_schedule`),
 *     Dates and scalars
 *   - stop at the Mixed Garmin OAuth token blobs, which are one opaque value
 *     each — a per-key merge there would splice two tokens together
 *   - drop `undefined`, and drop empty objects (`$set: { nutrition_goal: {} }`
 *     would reset the sub-document to its schema defaults, which is precisely
 *     what this exists to prevent)
 *
 * `garmin.password` is still encrypted on the way out: the shared schema's
 * `pre(findOneAndUpdate)` hook rewrites it in the dot-path form as well as the
 * nested one (`encryptGarminPasswordIn`).
 *
 * The proper long-term home is `@geeksuite/schemas/fitnessgeek/userSettings`,
 * beside the encryption — see apps/fitnessgeek/DOCS/USER_SETTINGS_SCHEMA.md.
 */

const OPAQUE_PATHS = new Set(['garmin.oauth1_token', 'garmin.oauth2_token']);

const isPlainObject = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function flattenForSet(input, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(input || {})) {
    if (value === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value) && !OPAQUE_PATHS.has(path)) {
      if (Object.keys(value).length) flattenForSet(value, path, out);
      continue;
    }
    out[path] = value;
  }
  return out;
}

export { flattenForSet, isPlainObject, OPAQUE_PATHS };
export default { flattenForSet, isPlainObject, OPAQUE_PATHS };
