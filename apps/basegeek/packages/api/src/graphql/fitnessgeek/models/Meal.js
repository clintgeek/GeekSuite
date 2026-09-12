import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';
import { requireUser, isValidObjectId } from '../ownership.js';

// The field set, the embedded meal-item sub-schema and the `pre('save')`
// `updated_at` stamp live in
// @geeksuite/schemas so that this model and fitnessgeek's REST copy
// (apps/fitnessgeek/backend/src/models/Meal.js) cannot drift. Both point at
// the `meals` collection in the same database — this gateway through its
// `meals`/`meal`/`logMeal` resolvers, fitnessgeek through its mealRoutes — and
// mongoose strict mode silently drops paths one side doesn't know about. See
// the shared module's header and DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// Do NOT add fields here. Add them to the shared module (and to typeDefs.js if
// they should cross GraphQL); the tripwire tests in both suites fail if this
// model stops matching the shared definition.
//
// Default import + destructure: the shared module is CommonJS (no build step,
// `require`-able and `import`-able by both consumers), and this is the interop
// form that works identically under Node ESM and jest's
// --experimental-vm-modules.
import mealSchemaModule from '@geeksuite/schemas/fitnessgeek/meal';

const { createMealSchema } = mealSchemaModule;

const fitnessConn = getAppConnection('fitnessgeek');

const mealSchema = createMealSchema(mongoose);

// The ownership guards stay here, not in the shared module — and for this
// model that is the only safe answer rather than merely the tidy one.
// fitnessgeek's copies of the three list statics treat a missing userId as
// "no filter" and return every user's meals; these throw. It also has no
// `findOwned`. Promoting either version would be a behaviour change on one
// side wearing a refactor's clothes (divergence C4 in the plan), so both sides
// keep exactly what they shipped.

// Meals are personal data: every lookup below is owner-scoped, and a missing
// userId is a hard failure rather than a silent "return everybody's meals".

// Load one meal by id, scoped to its owner. Returns null when the id is
// malformed, missing, deleted, or owned by somebody else — callers must not be
// able to tell those cases apart.
mealSchema.statics.findOwned = async function(mealId, userId) {
  requireUser(userId);
  if (!isValidObjectId(mealId)) return null;
  return this.findOne({ _id: mealId, user_id: userId, is_deleted: false });
};

// Get all active meals for a user
mealSchema.statics.getActiveMeals = async function(userId) {
  requireUser(userId);
  return this.find({ is_deleted: false, user_id: userId })
    .populate('food_items.food_item_id')
    .sort({ name: 1 });
};

// Get meals by meal type for a user
mealSchema.statics.getMealsByType = async function(mealType, userId) {
  requireUser(userId);
  return this.find({ meal_type: mealType, is_deleted: false, user_id: userId })
    .populate('food_items.food_item_id')
    .sort({ name: 1 });
};

// Search meals by name for a user
mealSchema.statics.searchMeals = async function(searchTerm, userId) {
  requireUser(userId);
  const regex = new RegExp(searchTerm, 'i');
  return this.find({ name: regex, is_deleted: false, user_id: userId })
    .populate('food_items.food_item_id')
    .sort({ name: 1 });
};

export default fitnessConn.model('Meal', mealSchema);
