import express from 'express';
const router = express.Router();
import { authenticateToken } from '../middleware/auth.js';
import Meal from '../models/Meal.js';
import { MEAL_TYPES } from '@geeksuite/schemas/fitnessgeek/meal';
import logger from '../config/logger.js';

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/meals - Get all user's meals
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { meal_type, search } = req.query;

    let meals;

    if (search) {
      meals = await Meal.searchMeals(search, userId);
    } else if (meal_type) {
      meals = await Meal.getMealsByType(meal_type, userId);
    } else {
      meals = await Meal.getActiveMeals(userId);
    }

    logger.info('Meals retrieved', {
      userId,
      count: meals.length,
      mealType: meal_type || 'all',
      search: search || 'none'
    });

    res.json({
      success: true,
      data: meals
    });

  } catch (error) {
    logger.error('Error getting meals:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve meals',
        code: 'MEALS_RETRIEVAL_ERROR'
      }
    });
  }
});

// GET /api/meals/:id - Get single meal
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const meal = await Meal.findOne({
      _id: id,
      is_deleted: false
    }).populate('food_items.food_item_id');

    if (!meal) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Meal not found',
          code: 'MEAL_NOT_FOUND'
        }
      });
    }

    logger.info('Meal retrieved', { userId, mealId: id });

    res.json({
      success: true,
      data: meal
    });

  } catch (error) {
    logger.error('Error getting meal:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve meal',
        code: 'MEAL_RETRIEVAL_ERROR'
      }
    });
  }
});

// POST /api/meals - Create new meal
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, meal_type, food_items } = req.body;

    // Validate required fields
    if (!name || !meal_type || !food_items || !Array.isArray(food_items) || food_items.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Name, meal type, and at least one food item are required',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Validate meal type

    if (!MEAL_TYPES.includes(meal_type)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid meal type',
          code: 'VALIDATION_ERROR'
        }
      });
    }

    // Validate food items
    for (const item of food_items) {
      if (!item.food_item_id || !item.servings || item.servings <= 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Each food item must have a valid food_item_id and servings > 0',
            code: 'VALIDATION_ERROR'
          }
        });
      }
    }

    // Create meal
    const meal = new Meal({
      user_id: userId,
      name: name.trim(),
      meal_type,
      food_items
    });

    const savedMeal = await meal.save();

    // Get populated meal for response
    const populatedMeal = await Meal.findById(savedMeal._id)
      .populate('food_items.food_item_id');

    logger.info('Meal created', {
      userId,
      mealId: savedMeal._id,
      name: name,
      mealType: meal_type,
      itemCount: food_items.length
    });

    res.status(201).json({
      success: true,
      data: populatedMeal,
      message: 'Meal created successfully'
    });

  } catch (error) {
    logger.error('Error creating meal:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to create meal',
        code: 'MEAL_CREATION_ERROR'
      }
    });
  }
});

// PUT /api/meals/:id - Update meal
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, meal_type, food_items } = req.body;

    const meal = await Meal.findOne({
      _id: id,
      user_id: userId,
      is_deleted: false
    });

    if (!meal) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Meal not found',
          code: 'MEAL_NOT_FOUND'
        }
      });
    }

    // Update fields if provided
    if (name !== undefined) {
      meal.name = name.trim();
    }

    if (meal_type !== undefined) {

      if (!MEAL_TYPES.includes(meal_type)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid meal type',
            code: 'VALIDATION_ERROR'
          }
        });
      }
      meal.meal_type = meal_type;
    }

    if (food_items !== undefined) {
      if (!Array.isArray(food_items) || food_items.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Food items must be a non-empty array',
            code: 'VALIDATION_ERROR'
          }
        });
      }

      // Validate food items
      for (const item of food_items) {
        if (!item.food_item_id || !item.servings || item.servings <= 0) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Each food item must have a valid food_item_id and servings > 0',
              code: 'VALIDATION_ERROR'
            }
          });
        }
      }

      meal.food_items = food_items;
    }

    const updatedMeal = await meal.save();

    // Get populated meal for response
    const populatedMeal = await Meal.findById(updatedMeal._id)
      .populate('food_items.food_item_id');

    logger.info('Meal updated', {
      userId,
      mealId: id,
      updatedFields: Object.keys(req.body)
    });

    res.json({
      success: true,
      data: populatedMeal,
      message: 'Meal updated successfully'
    });

  } catch (error) {
    logger.error('Error updating meal:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to update meal',
        code: 'MEAL_UPDATE_ERROR'
      }
    });
  }
});

// DELETE /api/meals/:id - Delete meal (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const meal = await Meal.findOne({
      _id: id,
      user_id: userId,
      is_deleted: false
    });

    if (!meal) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Meal not found',
          code: 'MEAL_NOT_FOUND'
        }
      });
    }

    // Soft delete
    meal.is_deleted = true;
    await meal.save();

    logger.info('Meal deleted', {
      userId,
      mealId: id,
      mealName: meal.name
    });

    res.json({
      success: true,
      message: 'Meal deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting meal:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to delete meal',
        code: 'MEAL_DELETION_ERROR'
      }
    });
  }
});

export default router;
