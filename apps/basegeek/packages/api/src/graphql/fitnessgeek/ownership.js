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
