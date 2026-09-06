import mongoose from 'mongoose';
import { toUtcMidnight } from '@geeksuite/utils';
import { createFoodLogSchema } from '@geeksuite/schemas/fitnessgeek/foodLog';

// The field set, the three compound indexes, the `meal_type` enum, the
// timestamp rename and the `calculatedNutrition` virtual live in
// @geeksuite/schemas so that this model and basegeek's GraphQL copy
// (apps/basegeek/packages/api/src/graphql/fitnessgeek/models/FoodLog.js)
// cannot drift. Both point at the `foodlogs` collection in the same database —
// this side through routes/logRoutes.js, foodRoutes.js and three services
// (aiCoachRoutes.js was deleted 2026-09-06, caller-less), the gateway through
// its `addFoodLog` / `updateFoodLog` /
// `deleteFoodLog` / `logMeal` / `copyFitnessMeal` resolvers, which took the
// writes over on 2026-09-05 — and mongoose strict mode silently drops paths
// one side doesn't know about. See the shared module's header and
// DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// Do NOT add fields here. Add them to the shared module; the tripwire tests in
// both suites fail if this model stops matching it.
//
// The `meal_type` enum is `MEAL_TYPES` from the shared `meal.js`, not a fourth
// copy of the four strings: `logMeal` writes a saved Meal's `meal_type`
// straight into a row here, and `DailySummary` buckets these rows by it. See
// the shared module's header for why that coupling clears the
// "different collection" bar that `settings.js`'s weight bounds did not.
const foodLogSchema = createFoodLogSchema(mongoose);

// Statics stay app-side, on the plan's §3 rule and for a second reason
// specific to this pair: they are where the date normalization lives, and
// `toUtcMidnight` comes from @geeksuite/utils, which is ESM-only and cannot be
// `require`d from the CommonJS shared package. basegeek's four copies are
// these four with `requireUser(userId)` at the head — its fail-closed
// ownership posture; every caller on this side is already past auth.

// Static method to get logs for a specific date
foodLogSchema.statics.getLogsForDate = async function(userId, date) {
  const startDate = toUtcMidnight(date);
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = toUtcMidnight(date);
  endDate.setUTCHours(23, 59, 59, 999);

  return await this.find({
    user_id: userId,
    log_date: { $gte: startDate, $lte: endDate }
  })
  .populate('food_item_id')
  .sort({ created_at: -1 });
};

// Static method to get logs for a date range
foodLogSchema.statics.getLogsForDateRange = async function(userId, startDate, endDate) {
  const start = toUtcMidnight(startDate);
  start.setUTCHours(0, 0, 0, 0);

  const end = toUtcMidnight(endDate);
  end.setUTCHours(23, 59, 59, 999);

  return await this.find({
    user_id: userId,
    log_date: { $gte: start, $lte: end }
  })
  .populate('food_item_id')
  .sort({ log_date: -1, created_at: -1 });
};

// Static method to get recent logs
foodLogSchema.statics.getRecentLogs = async function(userId, limit = 10) {
  return await this.find({ user_id: userId })
    .populate('food_item_id')
    .sort({ created_at: -1 })
    .limit(limit);
};

// Static method to get logs by meal type
foodLogSchema.statics.getLogsByMealType = async function(userId, mealType, date) {
  const startDate = toUtcMidnight(date);
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = toUtcMidnight(date);
  endDate.setUTCHours(23, 59, 59, 999);

  return await this.find({
    user_id: userId,
    meal_type: mealType,
    log_date: { $gte: startDate, $lte: endDate }
  })
  .populate('food_item_id')
  .sort({ created_at: -1 });
};

export default mongoose.model('FoodLog', foodLogSchema);
