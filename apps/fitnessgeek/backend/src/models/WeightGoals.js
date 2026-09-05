import mongoose from 'mongoose';
import { createWeightGoalsSchema } from '@geeksuite/schemas/fitnessgeek/weightGoals';

// The field set and both indexes live in @geeksuite/schemas so that this model
// and basegeek's GraphQL copy
// (apps/basegeek/packages/api/src/graphql/fitnessgeek/models/WeightGoals.js)
// cannot drift. Both point at the `weightgoals` collection in the same
// database — basegeek is the only writer, this side reads through
// src/services/aiInsightsService.js — and mongoose strict mode silently drops
// paths one side doesn't know about. See the shared module's header and
// DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// This is NOT `UserSettings.weight_goal`. That is a nested sub-document on a
// different collection with different bounds and extra fields; the shared
// module's header spells out the difference. Do not unify them.
//
// Do NOT add fields here. Add them to the shared module; the tripwire tests in
// both suites fail if this model stops matching it.
const weightGoalsSchema = createWeightGoalsSchema(mongoose);

// Statics stay app-side. basegeek's copies of these three open with
// `requireUser(userId)` — its fail-closed ownership posture — and this side's
// callers are already past auth, so the two writers deliberately disagree.
// Statics don't affect `schema.paths`, so that disagreement cannot cause the
// strict-mode data loss the shared module exists to prevent.

// Static method to get active weight goals for user
weightGoalsSchema.statics.getActiveWeightGoals = async function(userId) {
  return await this.findOne({
    user_id: userId,
    is_active: true
  });
};

// Static method to create new weight goals (deactivates old ones)
weightGoalsSchema.statics.createWeightGoals = async function(userId, goalsData) {
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

// Static method to update existing weight goals
weightGoalsSchema.statics.updateWeightGoals = async function(userId, goalsData) {
  const existingGoals = await this.findOne({
    user_id: userId,
    is_active: true
  });

  if (!existingGoals) {
    throw new Error('No active weight goals found for user');
  }

  Object.assign(existingGoals, goalsData);
  return await existingGoals.save();
};

export default mongoose.model('WeightGoals', weightGoalsSchema);
