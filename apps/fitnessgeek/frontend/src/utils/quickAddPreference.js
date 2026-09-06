/**
 * The opt-in switch for natural-language quick-add (AI_IDEAS.md idea #2).
 *
 * **It lives on the server now.** The flag is
 * `ai.features.natural_language_food_logging` on the user's `usersettings`
 * document — the field that already names this exact feature, that the
 * gateway's `parseFoodEntry` resolver already reads before it will call a
 * model, and that `PUT /settings/ai` already knows how to write.
 *
 * R115 could not use it, and said so at the time: the field defaulted to
 * `true` in `@geeksuite/schemas`, so adopting it as the opt-in would have
 * shipped the feature switched ON for every existing user, which the AI rules
 * forbid. R124 flipped that default to `false` in the shared factory, which
 * removes the objection: the server flag is now off until somebody turns it
 * on, so it can be the opt-in AND stay the kill switch the resolver honours.
 * One switch, one meaning, and a choice that follows the user between
 * browsers instead of living in one profile's site data.
 *
 * `ai.enabled` gates it too, exactly as the resolver does: turning AI off
 * wholesale turns this off with it.
 *
 * **The migration.** Anybody who opted in during R115 has
 * `localStorage['fitnessgeek:quickAddNL'] === 'true'` and nothing on the
 * server. `migrateLegacyQuickAddOptIn()` moves that across once, then drops
 * the key. It only ever turns the feature ON — a legacy `'false'` is
 * indistinguishable from "never touched it" now that the server default is
 * also off, so it is simply discarded.
 *
 * Every localStorage accessor is try/caught: a private window, blocked site
 * data or a quota error must read as "nothing to migrate", never as a crash
 * on the Food Log page.
 */

/** The R115 per-browser key. Retained for the migration, written by nothing. */
export const QUICK_ADD_NL_KEY = 'fitnessgeek:quickAddNL';

/**
 * Is the feature on for this user, per their settings document?
 *
 * Deliberately strict about `true`: a settings payload that has never carried
 * an `ai` block (an older document, or a failed load falling back to
 * defaults) reads as off, which is the safe direction for an AI feature.
 *
 * @param {object|null|undefined} settings a FitnessUserSettings payload
 */
export function isNaturalQuickAddEnabled(settings) {
  const ai = settings?.ai;
  if (!ai) return false;
  if (ai.enabled === false) return false;
  return ai.features?.natural_language_food_logging === true;
}

/** The legacy flag's value, or null when there is nothing stored. */
export function readLegacyOptIn() {
  try {
    return window.localStorage.getItem(QUICK_ADD_NL_KEY);
  } catch {
    return null;
  }
}

/** Drop the legacy flag. Safe to call when it was never there. */
export function clearLegacyOptIn() {
  try {
    window.localStorage.removeItem(QUICK_ADD_NL_KEY);
  } catch {
    // Storage unavailable — there was nothing to clear either.
  }
}

/**
 * Move an R115 localStorage opt-in onto the settings document, once.
 *
 * @param {object} args
 * @param {object|null} args.settings  the settings just loaded from the server
 * @param {(ai: object) => Promise<*>} args.saveAISettings  writes `PUT /settings/ai`
 * @returns {Promise<boolean>} whether the feature should be treated as ON
 *
 * The key is removed only after the write succeeds. If the write fails the
 * flag stays put and the next page load tries again — a lost opt-in is a
 * feature that silently disappears, which is worse than one extra request.
 */
export async function migrateLegacyQuickAddOptIn({ settings, saveAISettings }) {
  const serverOn = isNaturalQuickAddEnabled(settings);
  const legacy = readLegacyOptIn();

  if (legacy === null) return serverOn;

  // Already on server-side, or the legacy value was never an opt-in: the key
  // is noise now either way.
  if (serverOn || legacy !== 'true') {
    clearLegacyOptIn();
    return serverOn;
  }

  // `ai.enabled === false` is a deliberate, wholesale "no AI" from this user.
  // Migrating under it would quietly re-enable a feature they switched off, so
  // the key is dropped without being honoured.
  if (settings?.ai?.enabled === false) {
    clearLegacyOptIn();
    return false;
  }

  try {
    await saveAISettings({ features: { natural_language_food_logging: true } });
    clearLegacyOptIn();
    return true;
  } catch {
    // Keep the key; try again next load. The feature stays on for this
    // session so the migration is invisible to the person using it.
    return true;
  }
}

export default {
  QUICK_ADD_NL_KEY,
  isNaturalQuickAddEnabled,
  readLegacyOptIn,
  clearLegacyOptIn,
  migrateLegacyQuickAddOptIn,
};
