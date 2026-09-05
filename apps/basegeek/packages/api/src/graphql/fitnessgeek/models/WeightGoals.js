import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';
import { requireUser } from '../ownership.js';

// The field set and both indexes live in @geeksuite/schemas so that this model
// and fitnessgeek's REST copy (apps/fitnessgeek/backend/src/models/WeightGoals.js)
// cannot drift. Both point at the `weightgoals` collection in the same
// database — this gateway is the only writer, fitnessgeek reads through its
// aiInsightsService — and mongoose strict mode silently drops paths one side
// doesn't know about. See the shared module's header and
// DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// This is NOT `UserSettings.weight_goal`, which is a nested sub-document on a
// different collection with different bounds. Do not unify them.
//
// Do NOT add fields here. Add them to the shared module (and to typeDefs.js if
// they should cross GraphQL); the tripwire tests in both suites fail if this
// model stops matching the shared definition.
//
// Default import + destructure: the shared module is CommonJS (no build step,
// `require`-able and `import`-able by both consumers), and this is the interop
// form that works identically under Node ESM and jest's
// --experimental-vm-modules.
import weightGoalsSchemaModule from '@geeksuite/schemas/fitnessgeek/weightGoals';

const { createWeightGoalsSchema } = weightGoalsSchemaModule;

const fitnessConn = getAppConnection('fitnessgeek');

const weightGoalsSchema = createWeightGoalsSchema(mongoose);

// The ownership guards stay here, not in the shared module: this gateway fails
// closed on an unscoped query, fitnessgeek's callers are already past auth, and
// statics don't affect `schema.paths`, so the two writers are free to disagree.

// Static method to get active weight goals for user
weightGoalsSchema.statics.getActiveWeightGoals = async function(userId) {
  requireUser(userId);
  return await this.findOne({
    user_id: userId,
    is_active: true
  });
};

// Static method to create new weight goals (deactivates old ones)
weightGoalsSchema.statics.createWeightGoals = async function(userId, goalsData) {
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

// Static method to update existing weight goals
weightGoalsSchema.statics.updateWeightGoals = async function(userId, goalsData) {
  requireUser(userId);
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

export default fitnessConn.model('WeightGoals', weightGoalsSchema);
