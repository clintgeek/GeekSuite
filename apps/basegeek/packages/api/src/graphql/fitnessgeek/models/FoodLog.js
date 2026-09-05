import mongoose from 'mongoose';
import { toUtcMidnight } from '@geeksuite/utils/dates';
import { getAppConnection } from '../../shared/appConnections.js';
import { requireUser } from '../ownership.js';

// The field set, the three compound indexes, the `meal_type` enum, the
// timestamp rename and the `calculatedNutrition` virtual live in
// @geeksuite/schemas so that this model and fitnessgeek's REST copy
// (apps/fitnessgeek/backend/src/models/FoodLog.js) cannot drift. Both point at
// the `foodlogs` collection in the same database — this gateway through its
// `addFoodLog` / `updateFoodLog` / `deleteFoodLog` / `logMeal` /
// `copyFitnessMeal` resolvers, which took the writes over on 2026-09-05,
// fitnessgeek through its logRoutes/foodRoutes/aiCoachRoutes and three
// services, which still read heavily — and mongoose strict mode silently
// drops paths one side doesn't know about. See the shared module's header and
// DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// Do NOT add fields here. Add them to the shared module (and to typeDefs.js if
// they should cross GraphQL); the tripwire tests in both suites fail if this
// model stops matching the shared definition.
//
// The `meal_type` enum is `MEAL_TYPES` from the shared `meal.js`, not a fourth
// copy of the four strings: `logMeal` below writes a saved Meal's `meal_type`
// straight into a row here, and `DailySummary` buckets these rows by it.
//
// Default import + destructure: the shared module is CommonJS (no build step,
// `require`-able and `import`-able by both consumers), and this is the interop
// form that works identically under Node ESM and jest's
// --experimental-vm-modules.
import foodLogSchemaModule from '@geeksuite/schemas/fitnessgeek/foodLog';

const { createFoodLogSchema } = foodLogSchemaModule;

const fitnessConn = getAppConnection('fitnessgeek');

const foodLogSchema = createFoodLogSchema(mongoose);

// Statics stay app-side, on the plan's §3 rule and for a second reason
// specific to this pair: they are where the date normalization lives, and
// `toUtcMidnight` comes from @geeksuite/utils, which is ESM-only and cannot be
// `require`d from the CommonJS shared package. These four are fitnessgeek's
// four plus `requireUser(userId)` — this gateway is multi-tenant at the model
// layer and fails closed on an unscoped read.

// Static method to get logs for a specific date
foodLogSchema.statics.getLogsForDate = async function(userId, date) {
  requireUser(userId);
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
  requireUser(userId);
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
  requireUser(userId);
  return await this.find({ user_id: userId })
    .populate('food_item_id')
    .sort({ created_at: -1 })
    .limit(limit);
};

// Static method to get logs by meal type
foodLogSchema.statics.getLogsByMealType = async function(userId, mealType, date) {
  requireUser(userId);
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

export default fitnessConn.model('FoodLog', foodLogSchema);
