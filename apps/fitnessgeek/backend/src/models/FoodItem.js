import mongoose from 'mongoose';
import {
  createFoodItemSchema,
  findOrCreateFoodItem,
  foodCatalogVisibilityFilter,
} from '@geeksuite/schemas/fitnessgeek/foodItem';

// The field set, all six indexes (including `barcode`'s unique/sparse one and
// the `{name,brand}` text index), the `source` enum, the `totalCalories`
// virtual and the `isGlobal` instance method live in @geeksuite/schemas so
// that this model and basegeek's GraphQL copy
// (apps/basegeek/packages/api/src/graphql/fitnessgeek/models/FoodItem.js)
// cannot drift. Both point at the `fooditems` collection in the same database
// — this side through routes/foodRoutes.js and services/unifiedFoodService.js,
// the gateway through its `fitnessFood` / `addFitnessFood` / `addFoodLog`
// resolvers — and mongoose strict mode silently drops paths one side doesn't
// know about. See the shared module's header and
// DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// Do NOT add fields here. Add them to the shared module; the tripwire tests in
// both suites fail if this model stops matching it. And do not change a
// `unique` flag on either side alone — see the shared module's header for why
// both processes have to be redeployed together if one ever moves.
const foodItemSchema = createFoodItemSchema(mongoose);

// Static method to find or create food item.
//
// The DEDUPE LADDER IS SHARED — barcode, then (source, source_id), then
// (name, brand), otherwise a new GLOBAL row — because it is the only thing
// stopping this backend and the gateway minting duplicate catalog rows for the
// same USDA/OpenFoodFacts item. That is the one carve-out from the "statics
// stay app-side" rule (plan §4 pair 8): it is not an ownership policy, it has
// one correct meaning for both writers, and a divergence in it would fork the
// catalog quietly rather than throw.
//
// This side adds no policy on top. The gateway's caller re-checks the resolved
// row with `findAccessible` before using it — that re-check lives in its
// resolver, not in its static, and it is deliberately not replicated here.
// This static has no live caller in this app today; it is kept because the
// gateway's does and because dropping it would change the schema's statics key
// set for no reason.
foodItemSchema.statics.findOrCreate = async function findOrCreate(foodData, userId = null) {
  // `userId` is accepted and ignored — shipped behaviour on both sides. A row
  // minted here is always global (`user_id: null`); the private custom-food
  // path is a different call.
  void userId;
  return findOrCreateFoodItem(this, foodData);
};

// Static method to search foods.
//
// Stays app-side: it is an ownership-scoping read (no `requireUser` guard —
// callable with `userId = null` for a global-only read). Its FILTER SHAPE is
// shared now (Q41, 2026-09-06): `foodCatalogVisibilityFilter` is the one
// definition of "a visible catalog row", reconciled with the gateway's
// `foodCatalogFilter` (`ownership.js`) — see the shared module's header.
foodItemSchema.statics.search = async function(query, userId = null, limit = 25) {
  const filter = { is_deleted: false };

  // Include global foods (however the "no owner" shape was stored) and the
  // caller's own custom foods.
  const userFilter = foodCatalogVisibilityFilter(userId);

  if (query) {
    // Simple regex search instead of text search
    const searchRegex = new RegExp(query, 'i');
    filter.$and = [
      userFilter,
      {
        $or: [
          { name: searchRegex },
          { brand: searchRegex }
        ]
      }
    ];
  } else {
    // No search query, just get all foods for user
    filter.$or = userFilter.$or;
  }

  return await this.find(filter)
    .sort({ name: 1 })
    .limit(limit);
};

export default mongoose.model('FoodItem', foodItemSchema);
