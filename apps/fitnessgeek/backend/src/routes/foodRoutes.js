import express from 'express';
const router = express.Router();
import { authenticateToken } from '../middleware/auth.js';
import FoodItem from '../models/FoodItem.js';
import FoodLog from '../models/FoodLog.js';
import UserSettings from '../models/UserSettings.js';
import logger from '../config/logger.js';
import unifiedFoodService from '../services/unifiedFoodService.js';
import { foodItemDedupeFilters, foodCatalogVisibilityFilter } from '@geeksuite/schemas/fitnessgeek/foodItem';

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/foods - Unified food search
// Supports: ?search=query, ?barcode=xxx, or no params for all foods
router.get('/', async (req, res) => {
  try {
    const { search, barcode, source, limit = 25, includeAI = 'true' } = req.query;
    const userId = req.user.id;

    let foods;

    if (barcode) {
      // Barcode lookup
      const food = await unifiedFoodService.getByBarcode(barcode);
      foods = food ? [food] : [];

      logger.info('Barcode lookup', { userId, barcode, found: !!food });

    } else if (search) {
      // Smart search with AI fallback (AI uses API key, no user token needed)
      foods = await unifiedFoodService.search(search, {
        limit: parseInt(limit),
        includeAI: includeAI === 'true',
        userId
      });

      logger.info('Food search', {
        userId,
        query: search,
        count: foods.length,
        sources: [...new Set(foods.map(f => f.source))]
      });

    } else {
      // Get all foods from local DB
      const filter = { is_deleted: false };
      if (source) filter.source = source;

      const localFoods = await FoodItem.find(filter)
        .sort({ name: 1 })
        .limit(parseInt(limit))
        .lean();

      foods = localFoods.map(f => ({
        id: f._id.toString(),
        name: f.name,
        brand: f.brand || '',
        barcode: f.barcode || '',
        nutrition: f.nutrition,
        serving: f.serving,
        source: f.source || 'local'
      }));
    }

    res.json({
      success: true,
      data: foods
    });

  } catch (error) {
    logger.error('Error getting food items:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve food items',
        code: 'FOOD_RETRIEVAL_ERROR'
      }
    });
  }
});

// GET /api/foods/favorites - Get user's favorite foods
router.get('/favorites', async (req, res) => {
  try {
    const userId = req.user.id;
    const settings = await UserSettings.findOne({ user_id: userId });

    if (!settings?.favorite_foods?.length) {
      return res.json({ success: true, data: [] });
    }

    const foods = await FoodItem.find({
      _id: { $in: settings.favorite_foods },
      is_deleted: false
    }).lean();

    const result = foods.map(f => ({
      id: f._id.toString(),
      name: f.name,
      brand: f.brand || '',
      nutrition: f.nutrition,
      serving: f.serving,
      source: f.source || 'local',
      isFavorite: true
    }));

    logger.info('Favorites retrieved', { userId, count: result.length });
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Error getting favorites:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve favorites', code: 'FAVORITES_ERROR' }
    });
  }
});

// POST /api/foods/favorites/:foodId - Add food to favorites
router.post('/favorites/:foodId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { foodId } = req.params;

    await UserSettings.findOneAndUpdate(
      { user_id: userId },
      { $addToSet: { favorite_foods: foodId } },
      { upsert: true }
    );

    logger.info('Food added to favorites', { userId, foodId });
    res.json({ success: true, message: 'Added to favorites' });

  } catch (error) {
    logger.error('Error adding favorite:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to add favorite', code: 'FAVORITE_ADD_ERROR' }
    });
  }
});

// DELETE /api/foods/favorites/:foodId - Remove food from favorites
router.delete('/favorites/:foodId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { foodId } = req.params;

    await UserSettings.findOneAndUpdate(
      { user_id: userId },
      { $pull: { favorite_foods: foodId } }
    );

    logger.info('Food removed from favorites', { userId, foodId });
    res.json({ success: true, message: 'Removed from favorites' });

  } catch (error) {
    logger.error('Error removing favorite:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to remove favorite', code: 'FAVORITE_REMOVE_ERROR' }
    });
  }
});

// GET /api/foods/recent - Get user's recently logged foods
router.get('/recent', async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 20 } = req.query;

    // Get distinct food_item_ids from recent logs, ordered by most recent
    const recentLogs = await FoodLog.aggregate([
      { $match: { user_id: userId } },
      { $sort: { created_at: -1 } },
      { $group: {
        _id: '$food_item_id',
        lastUsed: { $first: '$created_at' },
        usageCount: { $sum: 1 }
      }},
      { $sort: { lastUsed: -1 } },
      { $limit: parseInt(limit) }
    ]);

    if (!recentLogs.length) {
      return res.json({ success: true, data: [] });
    }

    // Get the food items
    const foodIds = recentLogs.map(r => r._id);
    const foods = await FoodItem.find({
      _id: { $in: foodIds },
      is_deleted: false
    }).lean();

    // Get user's favorites for marking
    const settings = await UserSettings.findOne({ user_id: userId });
    const favoriteIds = new Set((settings?.favorite_foods || []).map(id => id.toString()));

    // Map and preserve order from aggregation
    const foodMap = new Map(foods.map(f => [f._id.toString(), f]));
    const result = recentLogs
      .filter(r => foodMap.has(r._id.toString()))
      .map(r => {
        const f = foodMap.get(r._id.toString());
        return {
          id: f._id.toString(),
          name: f.name,
          brand: f.brand || '',
          nutrition: f.nutrition,
          serving: f.serving,
          source: f.source || 'local',
          lastUsed: r.lastUsed,
          usageCount: r.usageCount,
          isFavorite: favoriteIds.has(f._id.toString())
        };
      });

    logger.info('Recent foods retrieved', { userId, count: result.length });
    res.json({ success: true, data: result });

  } catch (error) {
    logger.error('Error getting recent foods:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Failed to retrieve recent foods', code: 'RECENT_FOODS_ERROR' }
    });
  }
});

// GET /api/foods/:id - Get single food item
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Q41 (2026-09-06): was its own inline copy of the visibility filter,
    // matching only `{user_id: null}`; now the shared
    // `foodCatalogVisibilityFilter` (also matches a legacy row with no
    // `user_id` key at all — same shape the gateway's `foodCatalogFilter`
    // always used).
    const food = await FoodItem.findOne({
      _id: id,
      is_deleted: false,
      ...foodCatalogVisibilityFilter(userId)
    });

    if (!food) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Food item not found',
          code: 'FOOD_NOT_FOUND'
        }
      });
    }

    logger.info('Food item retrieved', { userId, foodId: id });

    res.json({
      success: true,
      data: food
    });

  } catch (error) {
    logger.error('Error getting food item:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve food item',
        code: 'FOOD_RETRIEVAL_ERROR'
      }
    });
  }
});

// POST /api/foods - Create new food item
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      brand,
      barcode,
      nutrition,
      serving,
      source,
      source_id
    } = req.body;

    // Validate required fields
    if (!name || !nutrition || !nutrition.calories_per_serving) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Name and calories are required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Check if food already exists.
    //
    // Q41 (2026-09-06): this used to be its own two-rung, non-sequential
    // ladder (`if (barcode) ... else if (source && source_id) ...`, no
    // `(name, brand)` rung at all) — a THIRD, subtly different copy of the
    // dedupe logic `findOrCreateFoodItem` already shares between this app and
    // basegeek's gateway. It now walks the same shared rungs
    // (`foodItemDedupeFilters`), in the same order, so a duplicate is caught
    // exactly the same way here as everywhere else that writes this
    // collection — including the previously-missing `(name, brand)` rung, and
    // no longer skipping the `source`/`source_id` rung just because a
    // (non-matching) barcode was also supplied.
    //
    // What still differs, deliberately: a row THIS route creates is
    // user-owned (`user_id: userId`, below) — a private custom food — where
    // `findOrCreateFoodItem`'s creation branch always mints a global row
    // (`user_id: null`). Folding the CREATE step in as well would make every
    // custom food typed here instantly visible to every other user through
    // the catalog's global-row visibility rule, which is a privacy change,
    // not a refactor — reported, not decided here. See
    // DOCS/FITNESSGEEK_MODEL_CONSOLIDATION.md §12 follow-up #2.
    let existingFood = null;
    for (const rung of foodItemDedupeFilters({ barcode, source, source_id, name, brand })) {
      existingFood = await FoodItem.findOne(rung.filter);
      if (existingFood) break;
    }

    if (existingFood) {
      logger.info('Food item already exists', {
        userId,
        foodId: existingFood._id,
        barcode: barcode || null,
        source: source || null
      });

      return res.json({
        success: true,
        data: existingFood,
        message: 'Food item already exists'
      });
    }

    // Create new food item
    const foodItem = new FoodItem({
      name,
      brand,
      barcode,
      nutrition: {
        calories_per_serving: nutrition.calories_per_serving,
        protein_grams: nutrition.protein_grams || 0,
        carbs_grams: nutrition.carbs_grams || 0,
        fat_grams: nutrition.fat_grams || 0,
        fiber_grams: nutrition.fiber_grams || 0,
        sugar_grams: nutrition.sugar_grams || 0,
        sodium_mg: nutrition.sodium_mg || 0
      },
      serving: {
        size: serving?.size || 100,
        unit: serving?.unit || 'g'
      },
      source: source || 'custom',
      source_id,
      user_id: userId // Custom foods belong to the user
    });

    const savedFood = await foodItem.save();

    logger.info('Food item created', {
      userId,
      foodId: savedFood._id,
      name: savedFood.name,
      source: savedFood.source
    });

    res.status(201).json({
      success: true,
      data: savedFood,
      message: 'Food item created successfully'
    });

  } catch (error) {
    logger.error('Error creating food item:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create food item',
        code: 'FOOD_CREATION_ERROR'
      }
    });
  }
});

// PUT /api/foods/:id - Update food item
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updateData = req.body;

    // Allow users to edit any food they've saved locally (custom or API-sourced)
    const food = await FoodItem.findOne({
      _id: id,
      user_id: userId,
      is_deleted: false
    });

    if (!food) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Food item not found or not editable',
          code: 'FOOD_NOT_FOUND'
        }
      });
    }

    // Update allowed fields
    const allowedFields = ['name', 'brand', 'nutrition', 'serving'];
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        food[field] = updateData[field];
      }
    });

    const updatedFood = await food.save();

    logger.info('Food item updated', {
      userId,
      foodId: id,
      updatedFields: Object.keys(updateData)
    });

    res.json({
      success: true,
      data: updatedFood,
      message: 'Food item updated successfully'
    });

  } catch (error) {
    logger.error('Error updating food item:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update food item',
        code: 'FOOD_UPDATE_ERROR'
      }
    });
  }
});

// DELETE /api/foods/:id - Soft delete food item
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Allow users to delete any food they've saved locally (custom or API-sourced)
    const food = await FoodItem.findOne({
      _id: id,
      user_id: userId,
      is_deleted: false
    });

    if (!food) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Food item not found or not deletable',
          code: 'FOOD_NOT_FOUND'
        }
      });
    }

    // Soft delete
    food.is_deleted = true;
    await food.save();

    logger.info('Food item deleted', {
      userId,
      foodId: id,
      name: food.name
    });

    res.json({
      success: true,
      message: 'Food item deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting food item:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to delete food item',
        code: 'FOOD_DELETION_ERROR'
      }
    });
  }
});

// GET /api/foods/search/:query - Search foods (alternative endpoint)
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const { limit = 25 } = req.query;
    const userId = req.user.id;

    const foods = await FoodItem.search(query, userId, parseInt(limit));

    logger.info('Food search performed', {
      userId,
      query,
      count: foods.length
    });

    res.json({
      success: true,
      data: foods
    });

  } catch (error) {
    logger.error('Error searching foods:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to search foods',
        code: 'FOOD_SEARCH_ERROR'
      }
    });
  }
});

export default router;