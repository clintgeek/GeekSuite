import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';
import { requireUser } from '../ownership.js';

// The field set and the compound index live in @geeksuite/schemas so that this
// model and fitnessgeek's REST copy
// (apps/fitnessgeek/backend/src/models/NutritionGoals.js) cannot drift. Both
// point at the `nutritiongoals` collection in the same database — this gateway
// is the only writer, fitnessgeek reads through its aiCoach routes and its
// report/insight services — and mongoose strict mode silently drops paths one
// side doesn't know about. See the shared module's header and
// DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// This is NOT `UserSettings.nutrition_goal`, which is a nested sub-document on
// a different collection describing a *plan* and sharing no field name with
// this one. Do not unify them.
//
// Do NOT add fields here. Add them to the shared module (and to typeDefs.js if
// they should cross GraphQL); the tripwire tests in both suites fail if this
// model stops matching the shared definition.
//
// Default import + destructure: the shared module is CommonJS (no build step,
// `require`-able and `import`-able by both consumers), and this is the interop
// form that works identically under Node ESM and jest's
// --experimental-vm-modules.
import nutritionGoalsSchemaModule from '@geeksuite/schemas/fitnessgeek/nutritionGoals';

const { createNutritionGoalsSchema } = nutritionGoalsSchemaModule;

const fitnessConn = getAppConnection('fitnessgeek');

const nutritionGoalsSchema = createNutritionGoalsSchema(mongoose);

// The ownership guards stay here, not in the shared module: this gateway fails
// closed on an unscoped query, fitnessgeek's callers are already past auth, and
// statics don't affect `schema.paths`, so the two writers are free to disagree.

// Static method to get active goals for user
nutritionGoalsSchema.statics.getActiveGoals = async function(userId) {
  requireUser(userId);
  return await this.findOne({
    user_id: userId,
    is_active: true
  });
};

// Static method to create new goals (deactivates old ones)
nutritionGoalsSchema.statics.createGoals = async function(userId, goalsData) {
  requireUser(userId);
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
  requireUser(userId);
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

export default fitnessConn.model('NutritionGoals', nutritionGoalsSchema);
