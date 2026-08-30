/**
 * ownership.js — fitnessgeek data-access guards.
 *
 * Mirrors the `requireUser` pattern used by the bujogeek service layer
 * (see ../bujogeek/services/taskService.js). Kept free of model imports so
 * the models themselves can import it without creating a cycle.
 *
 * Rules encoded here:
 *   - Personal data (meals, food logs, summaries, goals, weights, BP,
 *     medications, settings, streaks) is ALWAYS scoped by its owner field.
 *   - FoodItem is a deliberately shared catalog: rows with no `user_id` are
 *     global and readable by everybody. Reads use `foodCatalogFilter()`
 *     (global OR mine); writes stay owner-scoped in the resolvers.
 */

import mongoose from 'mongoose';

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
 */
export function foodCatalogFilter(userId) {
  return {
    $or: [
      { user_id: requireUser(userId) },
      { user_id: null },
      { user_id: { $exists: false } },
    ],
  };
}
