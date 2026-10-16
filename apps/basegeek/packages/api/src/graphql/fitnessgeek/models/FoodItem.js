import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';
import { requireUser, isValidObjectId, foodReadFilter } from '../ownership.js';
import UserSettings from './UserSettings.js';

// The field set, all six indexes (including `barcode`'s unique/sparse one and
// the `{name,brand}` text index), the `source` enum, the `totalCalories`
// virtual and the `isGlobal` instance method live in @geeksuite/schemas so
// that this model and fitnessgeek's REST copy
// (apps/fitnessgeek/backend/src/models/FoodItem.js) cannot drift. Both point
// at the `fooditems` collection in the same database — this gateway through
// its `fitnessFood` / `addFitnessFood` / `addFoodLog` resolvers, fitnessgeek
// through its foodRoutes and unifiedFoodService — and mongoose strict mode
// silently drops paths one side doesn't know about. See the shared module's
// header and DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md.
//
// Do NOT add fields here. Add them to the shared module (and to typeDefs.js if
// they should cross GraphQL); the tripwire tests in both suites fail if this
// model stops matching the shared definition. And do not change a `unique`
// flag on either side alone — see the shared module's header for why both
// processes have to be redeployed together if one ever moves.
//
// Default import + destructure: the shared module is CommonJS (no build step,
// `require`-able and `import`-able by both consumers), and this is the interop
// form that works identically under Node ESM and jest's
// --experimental-vm-modules.
import foodItemSchemaModule from '@geeksuite/schemas/fitnessgeek/foodItem';

const {
  createFoodItemSchema,
  findOrCreateFoodItem,
  foodCatalogVisibilityFilter,
  foodItemDedupeFilters,
  newFoodItemAttrs,
} = foodItemSchemaModule;

const fitnessConn = getAppConnection('fitnessgeek');

const foodItemSchema = createFoodItemSchema(mongoose);

// Read scope for logging: global foods (no user_id), the caller's own custom
// foods, and — since 2026-10-16 (C4) — the custom foods of the caller's
// household. Deliberately shared — global entries stay readable by everyone —
// but a PRIVATE custom food of anyone outside the household is not exposed.
// Read only: edits and deletes match `user_id` directly in the resolvers.
//
// `includeDeleted` is for copying an existing log: a soft-deleted food is
// still the food that log points at, and the copy carries its own nutrition
// snapshot. Ownership is the question there, not whether the row is live.
const readScope = async (userId, { includeDeleted = false } = {}) => {
  requireUser(userId);
  const members = await UserSettings.householdMemberIds(userId);
  return {
    ...(includeDeleted ? {} : { is_deleted: false }),
    ...foodReadFilter(userId, members),
  };
};

foodItemSchema.statics.findAccessible = async function(id, userId, options) {
  requireUser(userId);
  if (!isValidObjectId(id)) return null;
  return this.findOne({ _id: id, ...(await readScope(userId, options)) });
};

// Bulk variant used to validate food_item_id references supplied by clients.
foodItemSchema.statics.findAccessibleMany = async function(ids, userId, options) {
  requireUser(userId);
  const valid = (ids || []).filter(isValidObjectId);
  if (!valid.length) return [];
  return this.find({ _id: { $in: valid }, ...(await readScope(userId, options)) });
};

// Static method to find or create food item.
//
// The DEDUPE LADDER IS SHARED — barcode, then (source, source_id), then
// (name, brand), otherwise a new GLOBAL row — because it is the only thing
// stopping this gateway and fitnessgeek's REST backend minting duplicate
// catalog rows for the same USDA/OpenFoodFacts item. That is the one carve-out
// from the "statics stay app-side" rule (plan §4 pair 8): it is not an
// ownership policy, it has one correct meaning for both writers, and a
// divergence in it would fork the catalog quietly rather than throw.
//
// NO OWNERSHIP GUARD HERE, ON PURPOSE. The ladder's queries are unscoped —
// that is how a global row gets shared — so `resolveLogFoodItem` in
// resolvers.js puts the resolved row through `findAccessible` afterwards,
// which is what stops a crafted (name, brand) handing back another user's
// private custom food. That re-check is the gateway's divergence from REST and
// it lives in the resolver; moving it in here would double the query for every
// caller and change what this static returns.
foodItemSchema.statics.findOrCreate = async function findOrCreate(foodData, userId = null) {
  // `userId` is accepted and ignored — shipped behaviour on both sides. A row
  // minted here is always global (`user_id: null`); `addFitnessFood` is the
  // path that mints a private custom food.
  void userId;
  return findOrCreateFoodItem(this, foodData);
};

// Find or create a food the CALLER owns (C5, 2026-10-16). Used for a tapped AI
// search result: every one used to mint a GLOBAL row (`user_id: null`) that
// the whole suite then saw in search (review P2). Same dedupe ladder as
// `findOrCreate` — the shared rungs, in the shared order — but each rung only
// looks at rows the caller could already see (global or theirs), so it can
// neither hand back somebody else's private food nor reuse it, and a miss
// creates the row with `user_id` set to the caller. Existing rows, global or
// not, are left exactly as they are.
foodItemSchema.statics.findOrCreateOwned = async function findOrCreateOwned(foodData, userId) {
  requireUser(userId);
  const visible = foodCatalogVisibilityFilter(userId);
  for (const rung of foodItemDedupeFilters(foodData)) {
    const existing = await this.findOne({ $and: [rung.filter, visible] });
    if (existing) return existing;
  }
  return new this({ ...newFoodItemAttrs(foodData), user_id: String(userId) }).save();
};

// Static method to search foods.
//
// Stays app-side: it is an ownership-scoping read with no `requireUser`
// guard (callable with `userId = null`). Its FILTER SHAPE now agrees with
// `foodCatalogFilter` above (Q41, 2026-09-06) — both build on the shared
// `foodCatalogVisibilityFilter`, so a legacy row with no `user_id` key at all
// is visible through either path. No live caller in this package today.
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

export default fitnessConn.model('FoodItem', foodItemSchema);
