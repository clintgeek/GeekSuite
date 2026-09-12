import mongoose from 'mongoose';
import { createNutritionGoalsSchema } from '@geeksuite/schemas/fitnessgeek/nutritionGoals';

// The field set and the compound index live in @geeksuite/schemas so that this
// model and basegeek's GraphQL copy
// (apps/basegeek/packages/api/src/graphql/fitnessgeek/models/NutritionGoals.js)
// cannot drift. Both point at the `nutritiongoals` collection in the same
// database — basegeek is the only writer, this side reads through
// services/foodReportService.js and services/aiInsightsService.js
// (routes/aiCoachRoutes.js was deleted 2026-09-06, caller-less) — and
// mongoose strict mode silently drops
// paths one side doesn't know about. See the shared module's header and
// DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// This is NOT `UserSettings.nutrition_goal`. That is a nested sub-document on
// a different collection describing a *plan* (plan_type, weekly_schedule, bmr,
// tdee, keto) and it shares no field name with this one; `DailySummary` reads
// that one, not this. The shared module's header spells out the difference.
// Do not unify them.
//
// Do NOT add fields here. Add them to the shared module; the tripwire tests in
// both suites fail if this model stops matching it.
const nutritionGoalsSchema = createNutritionGoalsSchema(mongoose);

// Statics stay app-side. basegeek's copies of these three open with
// `requireUser(userId)` — its fail-closed ownership posture — and this side's
// callers are already past auth, so the two writers deliberately disagree.
// Statics don't affect `schema.paths`, so that disagreement cannot cause the
// strict-mode data loss the shared module exists to prevent.

// Static method to get active goals for user
nutritionGoalsSchema.statics.getActiveGoals = async function(userId) {
  return await this.findOne({
    user_id: userId,
    is_active: true
  });
};

// Static method to create new goals (deactivates old ones)
nutritionGoalsSchema.statics.createGoals = async function(userId, goalsData) {
  // Deactivate existing goals
  await this.updateMany(
    { user_id: userId, is_active: true },
    { is_active: false }
  );

  // Create new goals
  const goals = new this({
    user_id: userId,
    ...goalsData
  });

  return await goals.save();
};

// Static method to update existing goals
nutritionGoalsSchema.statics.updateGoals = async function(userId, goalsData) {
  const existingGoals = await this.findOne({
    user_id: userId,
    is_active: true
  });

  if (!existingGoals) {
    throw new Error('No active goals found for user');
  }

  Object.assign(existingGoals, goalsData);
  return await existingGoals.save();
};

export default mongoose.model('NutritionGoals', nutritionGoalsSchema);
