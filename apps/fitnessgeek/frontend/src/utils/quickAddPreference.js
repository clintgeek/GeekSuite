/**
 * The opt-in switch for natural-language quick-add (AI_IDEAS.md idea #2).
 *
 * **Why this is client-side, and why that is documented rather than hidden.**
 * The suite's AI rules say every feature is opt-in through *a setting the app
 * already persists*, default OFF. fitnessgeek does persist one that names this
 * exact feature — `ai.features.natural_language_food_logging` on
 * `usersettings` — but it, and `ai.enabled` above it, both default to **true**
 * in `@geeksuite/schemas`, and that shared module is consumed by two processes
 * and owned by neither this file nor this stream. Reusing it as the opt-in
 * would have shipped the feature switched ON for every existing user, which is
 * the one thing the rules are unambiguous about.
 *
 * So the two switches do different jobs, and both are real:
 *
 *   - **this one** — per-browser, default OFF, the opt-in. When it is off the
 *     UI never calls `parseFoodEntry` and the entry point is not rendered.
 *   - **`ai.features.natural_language_food_logging`** — server-side, honoured
 *     by the resolver itself: off means the deterministic split with no model
 *     call, whatever the client does. A kill switch, not the opt-in.
 *
 * The clean follow-up is to flip the schema default to `false` and move the
 * opt-in server-side; it needs a `packages/schemas` change plus a settings
 * write path, which is a different stream's file set.
 *
 * Every accessor is try/caught: a private window, blocked site data or a
 * storage quota error must read as "not opted in", never as a crash on the
 * Food Log page.
 */

export const QUICK_ADD_NL_KEY = 'fitnessgeek:quickAddNL';

/** Default OFF. Anything but the literal string `'true'` is off. */
export function isNaturalQuickAddEnabled() {
  try {
    return window.localStorage.getItem(QUICK_ADD_NL_KEY) === 'true';
  } catch {
    return false;
  }
}

/** @param {boolean} enabled */
export function setNaturalQuickAddEnabled(enabled) {
  try {
    window.localStorage.setItem(QUICK_ADD_NL_KEY, enabled ? 'true' : 'false');
  } catch {
    // Storage unavailable — the toggle simply does not persist. The caller
    // keeps its own React state for this session, so the switch still works
    // until the tab is closed.
  }
}

export default { QUICK_ADD_NL_KEY, isNaturalQuickAddEnabled, setNaturalQuickAddEnabled };
