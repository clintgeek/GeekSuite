/**
 * ownership.js — fitnessgeek data-access guards.
 *
 * Mirrors the `requireUser` pattern used by the todogeek service layer
 * (see ../todogeek/services/taskService.js). Kept free of model imports so
 * the models themselves can import it without creating a cycle.
 *
 * Rules encoded here:
 *   - Personal data (meals, food logs, summaries, goals, weights, BP,
 *     medications, settings, streaks) is ALWAYS scoped by its owner field.
 *   - FoodItem is a deliberately shared catalog: rows with no `user_id` are
 *     global and readable by everybody. Reads use `foodCatalogFilter()`
 *     (global OR mine); writes stay owner-scoped in the resolvers.
 *   - Logging, copying and re-logging read through `foodReadFilter()`, which
 *     adds the foods of the caller's household (C4, 2026-10-16). Read only:
 *     edits and deletes still match `user_id` alone, and search keeps the
 *     narrower `foodCatalogFilter()`.
 */

import mongoose from 'mongoose';
import foodItemSchemaModule from '@geeksuite/schemas/fitnessgeek/foodItem';

const { foodCatalogVisibilityFilter } = foodItemSchemaModule;

/**
 * Refuse to build a query that is not scoped to a user. A resolver that
 * forgets its auth check therefore fails closed instead of leaking.
 */
export function requireUser(userId) {
  if (!userId) {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED';
    throw err;
  }
  return userId;
}

/** True when `id` can be cast to an ObjectId (avoids CastError leaks). */
export function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id ?? ''));
}

/**
 * Read scope for the shared food catalog: global entries (no owner) plus the
 * caller's own custom foods. Another user's *private* food is not visible.
 *
 * The fail-closed `requireUser` guard stays here (ownership POLICY, app-side,
 * same as every other static in this file); the filter SHAPE itself is now
 * `foodCatalogVisibilityFilter` from `@geeksuite/schemas/fitnessgeek/foodItem`
 * (Q41, 2026-09-06), reconciled with fitnessgeek's REST `search` static,
 * which used to match a narrower "no owner" shape than this function did. See
 * that module's header for the reconciliation.
 */
export function foodCatalogFilter(userId) {
  return foodCatalogVisibilityFilter(requireUser(userId));
}

/**
 * Read scope for LOGGING a food: everything `foodCatalogFilter` allows, plus
 * the private foods of the other members of the caller's household
 * (`usersettings.household.household_id`).
 *
 * Why: a meal copied from Chef's log points at Chef's custom foods, and
 * re-logging it from Heather's side failed the ownership check with
 * "Food item not found" (review B9). Household members already read each
 * other's food logs; reading the food a shared log points at is the same
 * trust. It is read-only by construction — every write in the resolvers
 * matches `user_id: user.id` and never goes through this — and search does
 * not use it, so ranking is not widened.
 *
 * @param {string} userId                the caller
 * @param {string[]} [householdUserIds]  other members' user ids
 */
export function foodReadFilter(userId, householdUserIds = []) {
  const base = foodCatalogFilter(userId);
  const others = [...new Set((householdUserIds || []).map(String))].filter((id) => id && id !== String(userId));
  if (!others.length) return base;
  return { $or: [...base.$or, { user_id: { $in: others } }] };
}
