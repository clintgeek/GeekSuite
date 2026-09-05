import mongoose from 'mongoose';
import { createMealSchema } from '@geeksuite/schemas/fitnessgeek/meal';

// The field set, the embedded meal-item sub-schema, the `pre('save')`
// `updated_at` stamp and the `getNutrition` instance method live in
// @geeksuite/schemas so that this model and basegeek's GraphQL copy
// (apps/basegeek/packages/api/src/graphql/fitnessgeek/models/Meal.js) cannot
// drift. Both point at the `meals` collection in the same database — this side
// through routes/mealRoutes.js, the gateway through its `meals`/`meal`/
// `logMeal` resolvers — and mongoose strict mode silently drops paths one side
// doesn't know about. See the shared module's header and
// DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// Do NOT add fields here. Add them to the shared module; the tripwire tests in
// both suites fail if this model stops matching it.
const mealSchema = createMealSchema(mongoose);

// Statics stay app-side, and for this model that is the *only* safe answer
// rather than merely the tidy one: the two sides do not agree about what a
// missing userId means. These three treat it as "no filter" and will return
// every user's meals; basegeek's throw UNAUTHORIZED, and it also has a
// `findOwned` this side has no equivalent of. Every caller here passes a
// userId from the authenticated request, so nothing is broken — but promoting
// either version would be a behaviour change on one side wearing a refactor's
// clothes. That is divergence C4 in the plan; tightening this side is its own
// ticket with its own test.

// Get all active meals for a user
mealSchema.statics.getActiveMeals = async function(userId) {
  const query = { is_deleted: false };
  if (userId) query.user_id = userId;
  return this.find(query).populate('food_items.food_item_id').sort({ name: 1 });
};

// Get meals by meal type for a user
mealSchema.statics.getMealsByType = async function(mealType, userId) {
  const query = { meal_type: mealType, is_deleted: false };
  if (userId) query.user_id = userId;
  return this.find(query).populate('food_items.food_item_id').sort({ name: 1 });
};

// Search meals by name for a user
mealSchema.statics.searchMeals = async function(searchTerm, userId) {
  const regex = new RegExp(searchTerm, 'i');
  const query = { name: regex, is_deleted: false };
  if (userId) query.user_id = userId;
  return this.find(query).populate('food_items.food_item_id').sort({ name: 1 });
};

export default mongoose.model('Meal', mealSchema);
